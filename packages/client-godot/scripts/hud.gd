## HUD: status do núcleo, relógio, inspeção e atalhos.

class_name Hud
extends CanvasLayer

signal speed_requested(speed: int)
signal vision_toggled(on: bool)
signal construction_toggled(on: bool)
signal build_tool_changed(tool_id: String)
signal build_undo_requested
signal build_redo_requested
signal build_rotate_requested
signal sandbox_tool_changed(tool_id: String)
signal save_requested
signal load_requested

@onready var status_label: Label = $Margin/VBox/Status
@onready var clock_label: Label = $Margin/VBox/Clock
@onready var help_label: Label = $Margin/VBox/Help
@onready var select_label: Label = $Margin/VBox/Select
@onready var inspect_label: Label = $Margin/VBox/Inspect

var _vision_on: bool = true
var _connected: bool = false
var _last_speed: int = 1
var _paused: bool = false
var _construction: bool = false
## wall | wall_wood | floor | door | window | erase | furniture | move_furniture | del_object
var _build_tool: String = "wall"
## Material activo para parede / janela (B pedra · N pinho).
var _build_material: String = "pedra"
var _furniture_def: String = "cadeira_madeira"
## "" | wet | extinguish — ferramentas RT fora da construção
var _sandbox_tool: String = ""
## Última célula onde a ferramenta RT foi aplicada (−1 = ainda sem clique).
var _last_sandbox_cell: Vector2i = Vector2i(-1, -1)
var _selection_text: String = "Nenhum agente selecionado"
var _help_open: bool = false
var _help_panel: PanelContainer
var _construction_panel: ConstructionPanel
## Stub de contexto (construção): dica junto ao cursor, sem roubar o Dir. = apagar.
var _context_stub: PanelContainer
var _context_label: Label


func _ready() -> void:
	_build_help_overlay()
	_build_construction_panel()
	_build_context_stub()
	_refresh_help()
	if select_label:
		select_label.text = _selection_text
	if inspect_label:
		inspect_label.text = "—"
	set_connected(false)


func set_connected(ok: bool, detail: String = "") -> void:
	_connected = ok
	if ok:
		status_label.text = "Núcleo conectado (ws://127.0.0.1:8787)"
		status_label.modulate = UiTheme.STATUS_OK
	else:
		var extra := (" · " + detail) if detail != "" else ""
		status_label.text = "Núcleo desconectado — a reconectar…" + extra
		# Laranja durante retry; vermelho se ainda sem detalhe (estado inicial).
		status_label.modulate = UiTheme.status_color(false, detail != "")


func apply_clock(payload: Dictionary) -> void:
	_last_speed = int(payload.get("speed", _last_speed))
	_paused = bool(payload.get("paused", false)) or _last_speed == 0
	var day := int(payload.get("day", 1))
	var season := int(payload.get("season", 1))
	var year := int(payload.get("year", 1))
	var sim_time := int(payload.get("simTime", 0))
	var hour := int(floor(float(sim_time % 1440) / 60.0))
	var minute := int(sim_time % 60)
	var speed_txt := "pausado" if _paused else ("x%d" % _last_speed)
	var mode_txt := " · CONSTRUÇÃO" if _construction else ""
	clock_label.text = "Dia %d · Est. %d · Ano %d · %02d:%02d · %s%s" % [
		day, season, year, hour, minute, speed_txt, mode_txt
	]


func set_selection(text: String) -> void:
	_selection_text = text
	_refresh_select_label()


## Feedback de aplicação RT (G/Q): atualiza a linha de seleção sem estragar o texto do agente.
func note_sandbox_apply(x: int, y: int) -> void:
	_last_sandbox_cell = Vector2i(x, y)
	_refresh_select_label()


func set_inspect(text: String) -> void:
	if inspect_label:
		inspect_label.text = text


func set_construction(on: bool) -> void:
	_construction = on
	if on:
		_sandbox_tool = ""
		_last_sandbox_cell = Vector2i(-1, -1)
	if _construction_panel:
		_construction_panel.show_panel(on)
		if on:
			_sync_construction_panel()
			call_deferred("_place_construction_panel")
	if not on and _context_stub:
		_context_stub.visible = false
	_refresh_help()
	if _construction:
		if not clock_label.text.ends_with("CONSTRUÇÃO"):
			clock_label.text += " · CONSTRUÇÃO"
	else:
		clock_label.text = clock_label.text.replace(" · CONSTRUÇÃO", "")
	_refresh_select_label()


func is_construction() -> bool:
	return _construction


func current_build_tool() -> String:
	return _build_tool


func current_build_material() -> String:
	return _build_material


func current_furniture_def() -> String:
	return _furniture_def


func current_sandbox_tool() -> String:
	return _sandbox_tool


func clear_sandbox_tool() -> void:
	if _sandbox_tool == "":
		return
	_sandbox_tool = ""
	_last_sandbox_cell = Vector2i(-1, -1)
	_refresh_help()
	sandbox_tool_changed.emit(_sandbox_tool)


func _refresh_select_label() -> void:
	if not select_label:
		return
	if _construction:
		select_label.text = "Ferramenta: %s" % _tool_label(_build_tool)
	elif _sandbox_tool != "":
		select_label.text = _sandbox_status_line()
	else:
		select_label.text = _selection_text


func _sandbox_status_line() -> String:
	var tool := _sandbox_short(_sandbox_tool)
	if _last_sandbox_cell.x < 0:
		return "Ativa: %s — clique no tile · Dir. cancela" % tool
	return "Ativa: %s · última célula (%d,%d)" % [
		tool, _last_sandbox_cell.x, _last_sandbox_cell.y
	]


func _refresh_help() -> void:
	if _construction:
		help_label.text = "H/F1 ajuda · C sair · painel Construção (materiais / estruturas / mobília)"
	else:
		help_label.text = "H/F1 ajuda · Clique: sel./andar · porta · G água · Q extinguir · F6/F7 save/load · C construir · Espaço pausa · 1–4 vel · V cone · WASD"
	_refresh_select_label()


func _build_construction_panel() -> void:
	_construction_panel = ConstructionPanel.new()
	_construction_panel.name = "ConstructionPanel"
	_construction_panel.custom_minimum_size = Vector2(276, 0)
	_construction_panel.material_selected.connect(_on_panel_material)
	_construction_panel.structure_selected.connect(_on_panel_structure)
	_construction_panel.furniture_selected.connect(_on_panel_furniture)
	_construction_panel.furniture_tool_selected.connect(_set_tool)
	_construction_panel.rotate_requested.connect(func() -> void: build_rotate_requested.emit())
	_construction_panel.undo_requested.connect(func() -> void: build_undo_requested.emit())
	_construction_panel.redo_requested.connect(func() -> void: build_redo_requested.emit())
	_construction_panel.exit_requested.connect(_exit_construction)
	add_child(_construction_panel)
	# Topo-direita após o layout medir o conteúdo.
	_construction_panel.resized.connect(_place_construction_panel)
	get_viewport().size_changed.connect(_place_construction_panel)
	call_deferred("_place_construction_panel")


func _place_construction_panel() -> void:
	if _construction_panel == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var sz := _construction_panel.size
	if sz.x < 8.0:
		sz = _construction_panel.get_combined_minimum_size()
	_construction_panel.position = Vector2(vp.x - sz.x - float(UiTheme.MARGIN_EDGE), 12.0)


func _build_context_stub() -> void:
	## Dica leve junto ao cursor em construção (não intercepta o Dir. = apagar do main).
	_context_stub = PanelContainer.new()
	_context_stub.name = "BuildContextStub"
	_context_stub.visible = false
	_context_stub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := UiTheme.make_panel_style()
	style.set_corner_radius_all(3)
	style.content_margin_left = 8
	style.content_margin_top = 5
	style.content_margin_right = 8
	style.content_margin_bottom = 5
	_context_stub.add_theme_stylebox_override("panel", style)
	_context_label = Label.new()
	_context_label.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	_context_label.add_theme_color_override("font_color", UiTheme.TEXT_PRIMARY)
	_context_label.add_theme_color_override("font_outline_color", UiTheme.TEXT_OUTLINE)
	_context_label.add_theme_constant_override("outline_size", UiTheme.OUTLINE_BODY)
	_context_stub.add_child(_context_label)
	add_child(_context_stub)


func _process(_delta: float) -> void:
	if not _construction or _context_stub == null or _context_label == null:
		return
	var mouse := get_viewport().get_mouse_position()
	# Esconde se o cursor está sobre o painel de construção.
	if _construction_panel and _construction_panel.visible:
		var r := _construction_panel.get_global_rect()
		if r.has_point(mouse):
			_context_stub.visible = false
			return
	_context_label.text = _context_stub_text()
	_context_stub.visible = true
	_context_stub.position = mouse + Vector2(14, 18)


func _context_stub_text() -> String:
	match _build_tool:
		"wall", "wall_wood":
			return "Esq. pintar parede · Dir. apagar"
		"door":
			return "Esq. porta · Dir. apagar tile"
		"window":
			return "Esq. janela · Dir. apagar tile"
		"floor":
			return "Esq. chão · Dir. apagar"
		"erase":
			return "Esq./Dir. → chão"
		"furniture":
			return "Esq. colocar · Dir. apagar tile"
		"move_furniture":
			return "Esq. origem→destino · Dir. cancela"
		"del_object":
			return "Esq. remove móvel · Dir. apaga tile"
		_:
			return "Dir. apagar tile"


func _build_help_overlay() -> void:
	_help_panel = PanelContainer.new()
	_help_panel.name = "HelpOverlay"
	_help_panel.visible = false
	_help_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_help_panel.position = Vector2(UiTheme.MARGIN_EDGE, UiTheme.HUD_STACK_CLEARANCE)

	UiTheme.apply_panel(_help_panel)

	var body := Label.new()
	body.text = _help_overlay_text()
	UiTheme.apply_body_label(body)
	_help_panel.add_child(body)
	add_child(_help_panel)


func _help_overlay_text() -> String:
	return """Atalhos da demo  ·  H / F1 fecha

Geral
  Espaço — pausa / retoma
  1–4 — velocidade (1, 2, 5, 20)
  WASD / setas — pan · V — cone de visão
  Clique — sel./andar · porta abrir/fechar
  G — água (molhar tile; apaga fogo no lugar)
  Q — extinguir fogo (fumaça residual)
  Dir. — cancela ferramenta RT activa
  F6 / F7 — salvar / carregar slot demo
  C — entrar / sair construção

Construção  (painel à direita com C)
  B / N — material pedra / pinho (parede)
  Parede · Porta (R) · Janela · Chão (F)
  E — apagar tile · T — cadeira
  M — mover móvel · . — girar · X — remover
  Z / Y — desfazer / refazer
  Dir. — apagar ao pintar"""


func _toggle_help() -> void:
	_help_open = not _help_open
	if _help_panel:
		_help_panel.visible = _help_open
		# Ajuda por cima do painel de construção.
		if _help_open:
			_help_panel.move_to_front()


func _is_help_toggle(event: InputEvent) -> bool:
	if not (event is InputEventKey):
		return false
	var key := event as InputEventKey
	var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
	return code == KEY_H or code == KEY_F1


func _tool_label(tool_id: String) -> String:
	match tool_id:
		"wall":
			return "parede (pedra) — corta fogo"
		"wall_wood":
			return "parede (pinho) — queima"
		"floor":
			return "chão (pinho)"
		"door":
			return "porta (pinho)"
		"window":
			return "janela (%s)" % _build_material
		"erase":
			return "apagar tile → chão"
		"furniture":
			return "móvel: %s" % _furniture_def
		"move_furniture":
			return "mover móvel (clique origem → destino)"
		"del_object":
			return "remover móvel"
		_:
			return tool_id


func _sandbox_short(tool_id: String) -> String:
	match tool_id:
		"wet":
			return "água (G)"
		"extinguish":
			return "extinguir (Q)"
		_:
			return tool_id


func _set_tool(tool_id: String) -> void:
	_build_tool = tool_id
	if tool_id == "wall":
		_build_material = "pedra"
	elif tool_id == "wall_wood":
		_build_material = "pinho"
	_refresh_help()
	_sync_construction_panel()
	build_tool_changed.emit(_build_tool)


func _set_material(material_id: String) -> void:
	_build_material = material_id
	# Com janela activa, só muda o material (continua a pintar janela).
	if _build_tool == "window":
		_refresh_help()
		_sync_construction_panel()
		return
	# B/N clássicos e botão de material: selecciona parede nesse material.
	_set_tool("wall" if material_id == "pedra" else "wall_wood")


func _on_panel_material(material_id: String) -> void:
	_set_material(material_id)


func _on_panel_structure(tool_id: String) -> void:
	match tool_id:
		"wall":
			_set_tool("wall" if _build_material == "pedra" else "wall_wood")
		"window":
			_set_tool("window")
		_:
			_set_tool(tool_id)


func _on_panel_furniture(def_id: String) -> void:
	_furniture_def = def_id
	_set_tool("furniture")


func _sync_construction_panel() -> void:
	if _construction_panel:
		_construction_panel.sync_state(_build_tool, _build_material, _furniture_def)


func _exit_construction() -> void:
	if not _construction:
		return
	_construction = false
	set_construction(false)
	construction_toggled.emit(false)


func _set_sandbox_tool(tool_id: String) -> void:
	if _sandbox_tool == tool_id:
		_sandbox_tool = ""
		_last_sandbox_cell = Vector2i(-1, -1)
	else:
		_sandbox_tool = tool_id
		_last_sandbox_cell = Vector2i(-1, -1)
	_refresh_help()
	sandbox_tool_changed.emit(_sandbox_tool)


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if _is_help_toggle(event):
		_toggle_help()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("toggle_construction"):
		_construction = not _construction
		set_construction(_construction)
		construction_toggled.emit(_construction)
		return
	if _construction:
		if event.is_action_pressed("build_tool_wall"):
			_set_material("pedra")
		elif event.is_action_pressed("build_tool_wall_wood"):
			_set_material("pinho")
		elif event.is_action_pressed("build_tool_floor"):
			_set_tool("floor")
		elif event.is_action_pressed("build_tool_door"):
			_set_tool("door")
		elif event.is_action_pressed("build_tool_erase"):
			_set_tool("erase")
		elif event.is_action_pressed("build_tool_furniture"):
			_furniture_def = "cadeira_madeira"
			_set_tool("furniture")
		elif event.is_action_pressed("build_tool_move_furniture"):
			_set_tool("move_furniture")
		elif event.is_action_pressed("build_tool_del_object"):
			_set_tool("del_object")
		elif event.is_action_pressed("build_rotate"):
			build_rotate_requested.emit()
		elif event.is_action_pressed("build_undo"):
			build_undo_requested.emit()
		elif event.is_action_pressed("build_redo"):
			build_redo_requested.emit()
		return
	if event.is_action_pressed("tool_water"):
		_set_sandbox_tool("wet")
		return
	if event.is_action_pressed("tool_extinguish"):
		_set_sandbox_tool("extinguish")
		return
	if event.is_action_pressed("save_slot"):
		save_requested.emit()
		return
	if event.is_action_pressed("load_slot"):
		load_requested.emit()
		return
	if event.is_action_pressed("toggle_pause"):
		if _paused:
			speed_requested.emit(1 if _last_speed == 0 else _last_speed)
		else:
			speed_requested.emit(0)
	elif event.is_action_pressed("speed_1"):
		speed_requested.emit(1)
	elif event.is_action_pressed("speed_2"):
		speed_requested.emit(2)
	elif event.is_action_pressed("speed_5"):
		speed_requested.emit(5)
	elif event.is_action_pressed("speed_20"):
		speed_requested.emit(20)
	elif event.is_action_pressed("toggle_vision"):
		_vision_on = not _vision_on
		vision_toggled.emit(_vision_on)
