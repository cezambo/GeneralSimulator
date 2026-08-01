## Desenha tiles e objetos a partir do snapshot. Sem lógica de simulação.

class_name WorldView
extends Node2D

@onready var tiles_root: Node2D = $Tiles
@onready var objects_root: Node2D = $Objects

var _grid_w: int = 0
var _grid_h: int = 0
var _tile_nodes: Dictionary = {} # "x,y" -> Polygon2D
var _fire_nodes: Dictionary = {} # "x,y" -> Polygon2D (brilho)
var _smoke_nodes: Dictionary = {} # "x,y" -> Polygon2D (fumaça)
var _object_nodes: Dictionary = {} # id -> Polygon2D
var _construction: bool = false
var _hover_cell: Vector2i = Vector2i(-1, -1)
var _tile_data: Dictionary = {} # "x,y" -> Dictionary
var _object_data: Dictionary = {} # id -> Dictionary


func _ready() -> void:
	# Móveis acima do brilho/fumaça do tile — evita “sumir” no overlay de fogo.
	if objects_root:
		objects_root.z_index = 5


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
	var parts: PackedStringArray = ["%s · %s" % [tile_type, material_id]]
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
	var burning := _has_state(states, "burning")
	var smoky := _has_state(states, "smoky")
	var wet := _has_state(states, "wet")

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

	poly.color = WorldScale.tile_color(tile_type, burning, material_id)
	# wet = encharcado no tile (não é volume/fluxo de líquido — isso é V2).
	# Parede: tint mais leve para não parecer que virou “só água/chão”.
	if wet and not burning:
		var wet_i := clampf(_state_intensity(states, "wet") / 100.0, 0.35, 1.0)
		var wet_mix := (0.22 + 0.18 * wet_i) if tile_type == "wall" else (0.4 + 0.35 * wet_i)
		poly.color = poly.color.lerp(Color("2f6f9e"), wet_mix)
	# smoky = névoa de estado no tile, não camada de gás (R-023).
	if smoky and not burning:
		poly.color = poly.color.lerp(Color("5c5c62"), 0.28)
	# Calor residual (sem chama): tint laranja suave — legível pós-extinção.
	if not burning and cell.has("temperature"):
		var temp := float(cell.get("temperature", 20.0))
		if temp >= 45.0:
			var heat_t := clampf((temp - 45.0) / 200.0, 0.0, 1.0)
			poly.color = poly.color.lerp(Color("c45a28"), 0.12 + 0.38 * heat_t)
	if tile_type == "door" and bool(state.get("isOpen", false)) and not burning:
		poly.color = WorldScale.tile_color("door", false, material_id).lightened(0.2)
		if wet:
			poly.color = poly.color.lerp(Color("2f6f9e"), 0.4)
	if cell.has("integrity") and not burning:
		var integ := clampf(float(cell.get("integrity", 100.0)) / 100.0, 0.0, 1.0)
		poly.color = poly.color.darkened((1.0 - integ) * 0.55)

	_set_fire_glow(key, x, y, burning)
	var smoke_intensity := _state_intensity(states, "smoky") if smoky and not burning else 0.0
	_set_smoke_haze(key, x, y, smoke_intensity)


func _set_fire_glow(key: String, x: int, y: int, burning: bool) -> void:
	if burning:
		var glow: Polygon2D
		if _fire_nodes.has(key):
			glow = _fire_nodes[key]
		else:
			glow = Polygon2D.new()
			var s := WorldScale.PIXELS_PER_TILE
			var m := 10.0
			glow.polygon = PackedVector2Array([
				Vector2(m, m), Vector2(s - m, m), Vector2(s - m, s - m), Vector2(m, s - m)
			])
			glow.position = WorldScale.cell_to_px(x, y)
			glow.z_index = 1
			tiles_root.add_child(glow)
			_fire_nodes[key] = glow
		glow.color = Color(1.0, 0.92, 0.2, 0.85)
		glow.visible = true
	elif _fire_nodes.has(key):
		(_fire_nodes[key] as Polygon2D).visible = false


func _set_smoke_haze(key: String, x: int, y: int, intensity: float) -> void:
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
		# Névoa acinzentada-amarronzada (fuligem), não "gás" volumétrico.
		var a := clampf(intensity / 100.0, 0.18, 0.62)
		haze.color = Color(0.42, 0.4, 0.38, a)
		haze.visible = true
	elif _smoke_nodes.has(key):
		(_smoke_nodes[key] as Polygon2D).visible = false


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
