## Desenha tiles e objetos a partir do snapshot. Sem lógica de simulação.

class_name WorldView
extends Node2D

@onready var tiles_root: Node2D = $Tiles
@onready var objects_root: Node2D = $Objects

var _grid_w: int = 0
var _grid_h: int = 0
var _tile_nodes: Dictionary = {} # "x,y" -> Polygon2D
## "x,y" -> Node2D stack (outer + core Polygon2D). Upsert — nunca wipe.
var _fire_nodes: Dictionary = {}
var _smoke_nodes: Dictionary = {} # "x,y" -> Polygon2D (fumaça)
var _object_nodes: Dictionary = {} # id -> Polygon2D
var _construction: bool = false
var _hover_cell: Vector2i = Vector2i(-1, -1)
var _tile_data: Dictionary = {} # "x,y" -> Dictionary
var _object_data: Dictionary = {} # id -> Dictionary
## Camada de manchas (cinza/carvão/escombro) acima dos Polygon2D de tile.
var _residue_layer: Node2D
var _fire_flicker_on: bool = false


func _ready() -> void:
	# Móveis acima do brilho/fumaça do tile — evita “sumir” no overlay de fogo.
	if objects_root:
		objects_root.z_index = 5
	# _draw do WorldView fica atrás dos filhos; manchas precisam de nó próprio.
	var layer := _ResidueMarksLayer.new()
	layer.host = self
	layer.z_index = 3
	layer.z_as_relative = true
	add_child(layer)
	_residue_layer = layer
	set_process(false)


func _process(_delta: float) -> void:
	# Flicker só no glow de fogo (nós upsertados). Não toca em móveis.
	if not _fire_flicker_on:
		return
	var t_sec := Time.get_ticks_msec() * 0.001
	var any := false
	for key in _fire_nodes.keys():
		var stack: Node2D = _fire_nodes[key]
		if stack == null or not is_instance_valid(stack) or not stack.visible:
			continue
		any = true
		var burn_i := float(stack.get_meta("burn_i", 50.0))
		var starve := float(stack.get_meta("starve", 0.0))
		var cx := int(stack.get_meta("cx", 0))
		var cy := int(stack.get_meta("cy", 0))
		var phase := float((cx * 13 + cy * 7) % 17) * 0.41
		var speed := 5.5 + burn_i * 0.045
		var flick := 0.86 + 0.14 * sin(t_sec * speed + phase)
		# Chama fraca treme menos; starve amortece o pico.
		flick = lerpf(0.92, flick, clampf(burn_i / 55.0, 0.35, 1.0))
		flick = lerpf(flick, 0.78, starve)
		stack.modulate = Color(1, 1, 1, flick)
	if not any:
		_fire_flicker_on = false
		set_process(false)


func apply_snapshot(payload: Dictionary) -> void:
	# Upsert (não wipe): wipe+queue_free faz móveis piscarem a cada snapshot.
	_grid_w = int(payload.get("width", 0))
	_grid_h = int(payload.get("height", 0))

	var seen_tiles: Dictionary = {}
	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var tx := int(t.get("x", 0))
		var ty := int(t.get("y", 0))
		seen_tiles["%d,%d" % [tx, ty]] = true
		_upsert_tile(t)
	_prune_tiles(seen_tiles)

	var seen_objs: Dictionary = {}
	var objects: Array = payload.get("objects", [])
	for o in objects:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		var oid := String(o.get("id", ""))
		if oid == "":
			continue
		seen_objs[oid] = true
		_upsert_object(o)
	_prune_objects(seen_objs)
	queue_redraw()
	_redraw_residue_marks()


func apply_delta(payload: Dictionary) -> void:
	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		_upsert_tile(t)
	var upsert: Array = payload.get("objectsUpsert", [])
	for o in upsert:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		_upsert_object(o)
	var remove: Array = payload.get("objectsRemove", [])
	for id_v in remove:
		_remove_object(String(id_v))
	# Marcas de cinza/escombro — sem recrear nós de móveis.
	_redraw_residue_marks()


func world_size_px() -> Vector2:
	return Vector2(float(_grid_w), float(_grid_h)) * WorldScale.PIXELS_PER_TILE


func set_construction_overlay(on: bool) -> void:
	_construction = on
	if not on:
		_hover_cell = Vector2i(-1, -1)
	queue_redraw()


func set_hover_cell(cell: Vector2i) -> void:
	if cell == _hover_cell:
		return
	_hover_cell = cell
	queue_redraw()


func hover_cell() -> Vector2i:
	return _hover_cell


## Célula sob o rato no espaço local do WorldView (respeita câmara/zoom).
func cell_at_mouse() -> Vector2i:
	return WorldScale.px_to_cell(get_local_mouse_position())


func in_bounds_cell(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < _grid_w and cell.y < _grid_h


func tile_info_at(cell: Vector2i) -> Dictionary:
	if not in_bounds_cell(cell):
		return {}
	var key := "%d,%d" % [cell.x, cell.y]
	return _tile_data.get(key, {}) as Dictionary


func describe_tile(cell: Vector2i) -> String:
	var t := tile_info_at(cell)
	if t.is_empty():
		if in_bounds_cell(cell):
			return "(%d,%d) — sem dados" % [cell.x, cell.y]
		return "fora do mapa"
	var look := String(t.get("look", "")).strip_edges()
	# Fallback local se o núcleo ainda não mandou prosa (snapshot antigo).
	if look == "":
		look = _fallback_look(t)
	# Objetos locais cobrem o caso em que o delta de tile veio sem lista de móveis.
	var local_objs := _object_labels_at(cell)
	for name in local_objs:
		if not look.contains(name):
			look += " · com %s" % name
	var detail := _inspect_numbers(t)
	if detail != "":
		return "(%d,%d) %s\n%s" % [cell.x, cell.y, look, detail]
	return "(%d,%d) %s" % [cell.x, cell.y, look]


func _fallback_look(t: Dictionary) -> String:
	var tile_type := String(t.get("type", "?"))
	var material_id := String(t.get("materialId", "?"))
	var parts: PackedStringArray = []
	if tile_type == "door":
		var state: Dictionary = t.get("state", {})
		var open := bool(state.get("isOpen", false))
		parts.append("porta de %s (%s)" % [material_id, "aberta" if open else "fechada"])
	else:
		parts.append("%s · %s" % [tile_type, material_id])
	var states: Array = t.get("states", [])
	for s in states:
		if typeof(s) != TYPE_DICTIONARY:
			continue
		var st := String(s.get("type", ""))
		var inten := int(s.get("intensity", 0))
		if st != "" and inten > 0:
			parts.append("%s" % st)
	return " · ".join(parts)


func _inspect_numbers(t: Dictionary) -> String:
	## Segunda linha: números úteis para debug, sem poluir a prosa.
	var bits: PackedStringArray = []
	if t.has("integrity") and float(t.get("integrity", 100.0)) < 99.5:
		bits.append("int %d" % int(t.get("integrity", 100)))
	if t.has("temperature"):
		bits.append("%.0f°C" % float(t.get("temperature", 0.0)))
	var states: Array = t.get("states", [])
	for s in states:
		if typeof(s) != TYPE_DICTIONARY:
			continue
		var st := String(s.get("type", ""))
		var inten := int(s.get("intensity", 0))
		if st != "" and inten > 0:
			bits.append("%s %d" % [st, inten])
	if bits.is_empty():
		return ""
	return " · ".join(bits)


func _object_labels_at(cell: Vector2i) -> PackedStringArray:
	var out: PackedStringArray = []
	for id in _object_data.keys():
		var obj: Dictionary = _object_data[id]
		var pos: Dictionary = obj.get("pos", {})
		var ox := int(floor(float(pos.get("x", -999.0))))
		var oy := int(floor(float(pos.get("y", -999.0))))
		if ox != cell.x or oy != cell.y:
			continue
		var def_id := String(obj.get("defId", "")).replace("_", " ")
		if def_id == "":
			continue
		var label := def_id
		if def_id.begins_with("cadeira") or def_id.begins_with("mesa") or def_id.begins_with("cama"):
			label = "uma %s" % def_id
		elif def_id.begins_with("banco"):
			label = "um %s" % def_id
		out.append(label)
	return out


func _draw() -> void:
	if _grid_w <= 0:
		return
	var s := WorldScale.PIXELS_PER_TILE
	if _construction:
		var grid_color := Color(1, 1, 1, 0.18)
		for x in range(_grid_w + 1):
			var px := float(x) * s
			draw_line(Vector2(px, 0), Vector2(px, float(_grid_h) * s), grid_color, 1.0)
		for y in range(_grid_h + 1):
			var py := float(y) * s
			draw_line(Vector2(0, py), Vector2(float(_grid_w) * s, py), grid_color, 1.0)
	if in_bounds_cell(_hover_cell):
		var r := Rect2(Vector2(_hover_cell) * s, Vector2(s, s))
		var fill := Color(1.0, 0.85, 0.2, 0.22) if _construction else Color(0.7, 0.85, 1.0, 0.14)
		var edge := Color(1.0, 0.9, 0.3, 0.7) if _construction else Color(0.75, 0.9, 1.0, 0.55)
		draw_rect(r, fill, true)
		draw_rect(r, edge, false, 2.0)


func _redraw_residue_marks() -> void:
	if _residue_layer and is_instance_valid(_residue_layer):
		_residue_layer.queue_redraw()


func _upsert_object(obj: Dictionary) -> void:
	var id := String(obj.get("id", ""))
	if id == "":
		return
	_object_data[id] = obj.duplicate(true)
	var def_id := String(obj.get("defId", ""))
	var marker: Polygon2D
	if _object_nodes.has(id):
		marker = _object_nodes[id]
	else:
		marker = Polygon2D.new()
		marker.z_index = 3
		objects_root.add_child(marker)
		_object_nodes[id] = marker
	# Marcador centrado em pos (núcleo usa centro de célula: n+0.5).
	# Cabe numa célula 0.5 m: cadeira ~48% da célula; mesa/cama ~78%.
	var s := WorldScale.PIXELS_PER_TILE
	var half := s * 0.24
	if def_id.contains("mesa") or def_id.contains("cama"):
		half = s * 0.39
	elif def_id.contains("banco"):
		half = s * 0.28
	marker.polygon = PackedVector2Array([
		Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)
	])
	var states: Array = obj.get("states", [])
	var burning := _has_state(states, "burning")
	# Histerese visual: temperatura alta mantém tint de fogo se o estado
	# `burning` piscar entre ticks (decay vs re-ignição por contacto).
	var temp := float(obj.get("temperature", 0.0)) if obj.has("temperature") else 0.0
	var on_fire := burning or temp >= 100.0
	var h := float(def_id.hash() % 360) / 360.0
	if on_fire:
		# Amarelo-âmbar distinto do tile em chama (ff5a00) — não camufla.
		marker.color = Color(1.0, 0.82, 0.22, 1.0)
	else:
		marker.color = Color.from_hsv(h, 0.4, 0.72)
		if obj.has("integrity"):
			var integ := clampf(float(obj.get("integrity", 100.0)) / 100.0, 0.0, 1.0)
			marker.color = marker.color.darkened((1.0 - integ) * 0.65)
	marker.position = WorldScale.tile_to_px(obj.get("pos", {}))
	marker.rotation_degrees = float(obj.get("rotation", 0.0))
	marker.visible = true


func _upsert_tile(cell: Dictionary) -> void:
	var x := int(cell.get("x", 0))
	var y := int(cell.get("y", 0))
	var key := "%d,%d" % [x, y]
	_tile_data[key] = cell.duplicate(true)
	var tile_type := String(cell.get("type", "floor"))
	var material_id := String(cell.get("materialId", ""))
	var state: Dictionary = cell.get("state", {})
	var states: Array = cell.get("states", [])
	var burn_i := _state_intensity(states, "burning")
	var smoke_i := _state_intensity(states, "smoky")
	var burning := burn_i > 0.0
	var smoky := smoke_i > 0.0
	var wet := _has_state(states, "wet")
	var integ := float(cell.get("integrity", 100.0)) if cell.has("integrity") else 100.0
	var residue := _is_residue_material(material_id)
	# Parede/porta consumida → floor com integrity 0 (escombro atravessável).
	var rubble := tile_type == "floor" and integ <= 0.0 and not residue
	# Oxigênio opcional no snapshot — só dim se o campo existir.
	var starve := _oxygen_starve_factor(cell, smoke_i, burn_i)

	var poly: Polygon2D
	if _tile_nodes.has(key):
		poly = _tile_nodes[key]
	else:
		poly = Polygon2D.new()
		var s := WorldScale.PIXELS_PER_TILE
		poly.polygon = PackedVector2Array([Vector2(0, 0), Vector2(s, 0), Vector2(s, s), Vector2(0, s)])
		poly.position = WorldScale.cell_to_px(x, y)
		tiles_root.add_child(poly)
		_tile_nodes[key] = poly

	poly.color = _tile_surface_color(tile_type, burn_i, material_id, residue, rubble)
	# wet = encharcado no tile (não é volume/fluxo de líquido — isso é V2).
	# Intensidade 0–100 do snapshot: leve = azul subtil; forte (encharcado) = azul óbvio.
	# Parede/resíduo: mix mais baixo para não apagar cinza/carvão/escombro.
	var wet_i := 0.0
	if wet and not burning:
		wet_i = clampf(_state_intensity(states, "wet") / 100.0, 0.0, 1.0)
		# Curva suave: baixo fica discreto; ≥70 (encharcado) sobe rápido.
		var wet_t := wet_i * wet_i * (3.0 - 2.0 * wet_i) # smoothstep
		var wet_col: Color
		if residue or rubble:
			wet_col = Color("3a6a7a").lerp(Color("1a6a9a"), wet_t)
		else:
			wet_col = Color("4a7a8e").lerp(Color("1e5f8a"), wet_t)
		var wet_mix: float
		if tile_type == "wall":
			wet_mix = 0.06 + 0.34 * wet_t
		elif residue or rubble:
			wet_mix = 0.08 + 0.36 * wet_t
		else:
			wet_mix = 0.12 + 0.68 * wet_t
		poly.color = poly.color.lerp(wet_col, wet_mix)
	# smoky = névoa de estado no tile, não camada de gás (R-023).
	if smoky and (not burning or burn_i < 35.0):
		var smoke_tint := clampf(smoke_i / 100.0, 0.0, 1.0)
		var tint_mix := lerpf(0.12, 0.38, smoke_tint)
		if residue:
			tint_mix *= 0.75
		if burning:
			tint_mix *= 0.55
		poly.color = poly.color.lerp(Color("4a4a50"), tint_mix)
	# Calor residual (sem chama): laranja distinto do molhado; em cinza/carvão sobe um pouco.
	if not burning and cell.has("temperature"):
		var temp := float(cell.get("temperature", 20.0))
		if temp >= 45.0:
			var heat_t := clampf((temp - 45.0) / 200.0, 0.0, 1.0)
			var heat_col := Color("e06830") if residue or rubble else Color("c45a28")
			var heat_mix := 0.18 + 0.42 * heat_t
			if wet:
				# Molhado + quente → vapor morno; wet forte segura mais o laranja.
				heat_mix *= lerpf(0.7, 0.4, wet_i)
				heat_col = Color("b86a48")
			poly.color = poly.color.lerp(heat_col, heat_mix)
	if tile_type == "door" and bool(state.get("isOpen", false)) and not burning:
		poly.color = _structure_color("door", material_id).lightened(0.22)
		if wet:
			poly.color = poly.color.lerp(Color("2f6f9e"), 0.1 + 0.55 * wet_i)
	elif tile_type == "window" and bool(state.get("isOpen", false)) and not burning:
		poly.color = _structure_color("window", material_id).lightened(0.18)
		if wet:
			poly.color = poly.color.lerp(Color("2f6f9e"), 0.08 + 0.4 * wet_i)
	# Integridade: dano em chão normal escurece; resíduo já é escuro (só um toque);
	# escombro (integrity 0) já tem cor própria — não escurecer de novo.
	if cell.has("integrity") and not burning and not rubble:
		var integ_n := clampf(integ / 100.0, 0.0, 1.0)
		var darken := (1.0 - integ_n) * (0.28 if residue else 0.55)
		poly.color = poly.color.darkened(darken)
	# Starve: smoky alto + chama fraca + O₂ presente → tile mais abafado.
	if starve > 0.0:
		poly.color = poly.color.darkened(0.12 + 0.28 * starve)
		poly.color = poly.color.lerp(Color("2a2a2e"), 0.1 + 0.22 * starve)

	_set_fire_glow(key, x, y, burn_i, starve)
	# Fumaça por intensidade; sob chama fraca ainda aparece (chama forte cobre).
	var smoke_draw := 0.0
	if smoky and (not burning or burn_i < 40.0):
		smoke_draw = smoke_i
		if burning:
			smoke_draw *= lerpf(0.85, 0.35, clampf(burn_i / 40.0, 0.0, 1.0))
	_set_smoke_haze(key, x, y, smoke_draw, starve)


## 0 = sem efeito; 1 = starve máximo. Só se `oxygen` vier no snapshot.
func _oxygen_starve_factor(cell: Dictionary, smoke_i: float, burn_i: float) -> float:
	if not cell.has("oxygen"):
		return 0.0
	# Precisa de muita fumaça + chama baixa/ausente para o look “abafado”.
	if smoke_i < 45.0:
		return 0.0
	if burn_i >= 45.0:
		return 0.0
	var o2 := clampf(float(cell.get("oxygen", 100.0)), 0.0, 100.0)
	if o2 >= 55.0:
		return 0.0
	var o2_t := 1.0 - clampf(o2 / 55.0, 0.0, 1.0)
	var smoke_t := clampf((smoke_i - 45.0) / 55.0, 0.0, 1.0)
	var low_fire_t := 1.0 - clampf(burn_i / 45.0, 0.0, 1.0)
	return clampf(o2_t * smoke_t * lerpf(0.55, 1.0, low_fire_t), 0.0, 1.0)


func _set_fire_glow(key: String, x: int, y: int, intensity: float, starve: float = 0.0) -> void:
	if intensity > 0.0:
		var stack: Node2D
		var outer: Polygon2D
		var core: Polygon2D
		if _fire_nodes.has(key):
			stack = _fire_nodes[key]
			outer = stack.get_node("outer") as Polygon2D
			core = stack.get_node("core") as Polygon2D
		else:
			stack = Node2D.new()
			stack.position = WorldScale.cell_to_px(x, y)
			stack.z_index = 1
			outer = Polygon2D.new()
			outer.name = "outer"
			core = Polygon2D.new()
			core.name = "core"
			stack.add_child(outer)
			stack.add_child(core)
			tiles_root.add_child(stack)
			_fire_nodes[key] = stack
		var s := WorldScale.PIXELS_PER_TILE
		var t := clampf(intensity / 100.0, 0.0, 1.0)
		# Outer: brasa laranja; cresce com intensidade.
		var m_out := lerpf(12.0, 5.0, t)
		outer.polygon = PackedVector2Array([
			Vector2(m_out, m_out), Vector2(s - m_out, m_out),
			Vector2(s - m_out, s - m_out), Vector2(m_out, s - m_out),
		])
		var out_col := Color("c43808").lerp(Color("ff7a18"), t)
		out_col.a = lerpf(0.38, 0.78, t)
		# Core: amarelo-branco só em chama média+; inset maior.
		var m_core := lerpf(18.0, 12.0, t)
		core.polygon = PackedVector2Array([
			Vector2(m_core, m_core), Vector2(s - m_core, m_core),
			Vector2(s - m_core, s - m_core), Vector2(m_core, s - m_core),
		])
		var core_col := Color("ffb020").lerp(Color("fff0a0"), t)
		core_col.a = lerpf(0.0, 0.9, clampf((t - 0.22) / 0.55, 0.0, 1.0))
		if starve > 0.0:
			# Chama abafada: menos amarelo, mais vermelho-escuro, alpha baixo.
			out_col = out_col.lerp(Color("6a2010"), 0.35 + 0.4 * starve)
			out_col.a *= lerpf(1.0, 0.45, starve)
			core_col.a *= lerpf(1.0, 0.25, starve)
			core_col = core_col.lerp(Color("a04018"), 0.5 * starve)
		outer.color = out_col
		core.color = core_col
		core.visible = core_col.a > 0.04
		stack.set_meta("burn_i", intensity)
		stack.set_meta("starve", starve)
		stack.set_meta("cx", x)
		stack.set_meta("cy", y)
		stack.modulate = Color(1, 1, 1, 1)
		stack.visible = true
		if not _fire_flicker_on:
			_fire_flicker_on = true
			set_process(true)
	elif _fire_nodes.has(key):
		(_fire_nodes[key] as Node2D).visible = false


func _set_smoke_haze(key: String, x: int, y: int, intensity: float, starve: float = 0.0) -> void:
	if intensity > 0.0:
		var haze: Polygon2D
		if _smoke_nodes.has(key):
			haze = _smoke_nodes[key]
		else:
			haze = Polygon2D.new()
			var s := WorldScale.PIXELS_PER_TILE
			haze.polygon = PackedVector2Array([
				Vector2(0, 0), Vector2(s, 0), Vector2(s, s), Vector2(0, s)
			])
			haze.position = WorldScale.cell_to_px(x, y)
			haze.z_index = 2
			tiles_root.add_child(haze)
			_smoke_nodes[key] = haze
		# Densidade por intensidade (curva suave): leve = véu; alto = fuligem opaca.
		var t := clampf(intensity / 100.0, 0.0, 1.0)
		var t2 := t * t * (3.0 - 2.0 * t)
		var a := lerpf(0.10, 0.78, t2)
		var g := lerpf(0.52, 0.26, t2)
		var col := Color(g, g * 0.96, g * 0.9, a)
		if starve > 0.0:
			col = col.lerp(Color(0.18, 0.17, 0.16, a), 0.35 + 0.4 * starve)
			col.a = clampf(col.a * lerpf(1.0, 1.15, starve), 0.0, 0.88)
		haze.color = col
		haze.visible = true
	elif _smoke_nodes.has(key):
		(_smoke_nodes[key] as Polygon2D).visible = false


func _is_residue_material(material_id: String) -> bool:
	# Resíduos de combustão / destroços (mesmo conjunto que o núcleo deposita).
	match material_id:
		"cinza", "carvao", "lascas", "entulho", "sucata", "cacos":
			return true
		_:
			return false


func _structure_color(tile_type: String, material_id: String) -> Color:
	## Cores de parede/porta/janela mais distintas entre si e do chão.
	var wood := material_id in ["pinho", "carvalho", "madeira", "freixo", "cedro"]
	match tile_type:
		"wall":
			if wood:
				return Color("5a4030")
			if material_id == "tijolo":
				return Color("8a4a3a")
			if material_id == "adobe":
				return Color("9a7a52")
			# pedra / default — azul-ardósia frio (contrasta com chão quente)
			return Color("3a4552")
		"door":
			if material_id == "ferro" or material_id == "metal":
				return Color("4a5058")
			# madeira — âmbar mais quente que parede
			return Color("9a5c2e")
		"window":
			if material_id == "vidro" or material_id == "":
				return Color("6ab0c8")
			if wood:
				return Color("5a8a9a")
			return Color("58a0b8")
		_:
			return WorldScale.tile_color(tile_type, false, material_id)


func _tile_surface_color(
	tile_type: String,
	burn_intensity: float,
	material_id: String,
	residue: bool,
	rubble: bool,
) -> Color:
	if burn_intensity > 0.0:
		var t := clampf(burn_intensity / 100.0, 0.0, 1.0)
		# Fraco = brasa escura; forte = laranja vivo.
		return Color("a02800").lerp(Color("ff6a12"), t)
	# Cinza/carvão do móvel queimado: cores próprias, mais óbvias que o chão de pinho.
	if residue:
		match material_id:
			"carvao":
				return Color("14100c")
			"lascas":
				return Color("4a3420")
			"entulho":
				return Color("7a7264")
			"sucata":
				return Color("5a6068")
			"cacos":
				return Color("8a6458")
			_:
				# cinza — cinza-claro acastanhado, distinto do carvão preto
				return Color("7a7268")
	# Escombro de estrutura (parede/porta → floor integrity 0): pedregulho bege-acinzentado.
	if rubble:
		return Color("8e8678")
	match tile_type:
		"wall", "door", "window":
			return _structure_color(tile_type, material_id)
		_:
			return WorldScale.tile_color(tile_type, false, material_id)


## Manchas determinísticas em cinza/carvão/escombro (seed por célula — estável).
func paint_residue_marks(ci: CanvasItem) -> void:
	if _grid_w <= 0:
		return
	var s := WorldScale.PIXELS_PER_TILE
	for key in _tile_data.keys():
		var t: Dictionary = _tile_data[key]
		var material_id := String(t.get("materialId", ""))
		var tile_type := String(t.get("type", "floor"))
		var residue := _is_residue_material(material_id)
		var integ := float(t.get("integrity", 100.0)) if t.has("integrity") else 100.0
		var rubble := tile_type == "floor" and integ <= 0.0 and not residue
		if not residue and not rubble:
			continue
		var states: Array = t.get("states", [])
		if _has_state(states, "burning"):
			continue
		var x := int(t.get("x", 0))
		var y := int(t.get("y", 0))
		var origin := Vector2(float(x), float(y)) * s
		var cell_seed := int(x * 73856093) ^ int(y * 19349663)
		var n := 10 if material_id == "carvao" or material_id == "cinza" else 7
		if rubble:
			n = 8
		for i in range(n):
			var h := cell_seed + i * 83492791
			var fx := float(h & 255) / 255.0
			var fy := float((h >> 8) & 255) / 255.0
			var sz_mul := 0.08 + 0.1 * float((h >> 16) & 3) / 3.0
			if rubble:
				sz_mul *= 1.25
			elif material_id == "cinza":
				sz_mul *= 0.85
			var sz := s * sz_mul
			var col := _residue_speckle_color(material_id, rubble, h)
			var pos := origin + Vector2(fx * (s - sz), fy * (s - sz))
			ci.draw_rect(Rect2(pos, Vector2(sz, sz)), col, true)


func _residue_speckle_color(material_id: String, rubble: bool, h: int) -> Color:
	var alt := (h & 1) == 0
	if rubble:
		# Pedras irregulares — contraste alto bege/cinza.
		return Color(0.28, 0.26, 0.22, 0.7) if alt else Color(0.72, 0.68, 0.58, 0.55)
	match material_id:
		"carvao":
			return Color(0.04, 0.03, 0.02, 0.95) if alt else Color(0.28, 0.2, 0.12, 0.65)
		"lascas":
			return Color(0.18, 0.12, 0.06, 0.8) if alt else Color(0.55, 0.42, 0.26, 0.55)
		"entulho":
			return Color(0.36, 0.34, 0.3, 0.65) if alt else Color(0.62, 0.56, 0.46, 0.5)
		"sucata":
			return Color(0.22, 0.26, 0.3, 0.7) if alt else Color(0.58, 0.56, 0.5, 0.45)
		"cacos":
			return Color(0.5, 0.3, 0.26, 0.65) if alt else Color(0.72, 0.58, 0.5, 0.5)
		_:
			# cinza — pó claro + manchas média (não preto como carvão)
			return Color(0.42, 0.4, 0.36, 0.7) if alt else Color(0.78, 0.74, 0.68, 0.55)


func _has_state(states: Array, type_name: String) -> bool:
	return _state_intensity(states, type_name) > 0.0


func _state_intensity(states: Array, type_name: String) -> float:
	for s in states:
		if typeof(s) == TYPE_DICTIONARY and String(s.get("type", "")) == type_name:
			return float(s.get("intensity", 0))
	return 0.0


func _prune_tiles(keep: Dictionary) -> void:
	var drop: Array = []
	for key in _tile_nodes.keys():
		if not keep.has(key):
			drop.append(key)
	for key in drop:
		_free_node(_tile_nodes[key])
		_tile_nodes.erase(key)
		if _fire_nodes.has(key):
			_free_node(_fire_nodes[key])
			_fire_nodes.erase(key)
		if _smoke_nodes.has(key):
			_free_node(_smoke_nodes[key])
			_smoke_nodes.erase(key)
		_tile_data.erase(key)


func _prune_objects(keep: Dictionary) -> void:
	var drop: Array = []
	for id in _object_nodes.keys():
		if not keep.has(id):
			drop.append(id)
	for id in drop:
		_remove_object(String(id))


func _remove_object(id: String) -> void:
	if _object_nodes.has(id):
		_free_node(_object_nodes[id])
		_object_nodes.erase(id)
	_object_data.erase(id)


func _free_node(node: Variant) -> void:
	if node == null:
		return
	var n := node as Node
	if n == null:
		return
	# free() imediato: queue_free deixa 1 frame sem marcador (flicker).
	if is_instance_valid(n):
		n.free()


## Desenha manchas acima dos tiles (z_index 3), abaixo dos móveis (z_index 5).
class _ResidueMarksLayer extends Node2D:
	var host: WorldView

	func _draw() -> void:
		if host:
			host.paint_residue_marks(self)
