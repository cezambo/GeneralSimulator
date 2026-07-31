## Cena raiz: liga CoreClient → WorldView / Agents / HUD / Camera.
## Cliente fino: zero pathfinding, zero validação de mundo.

extends Node

@onready var core: CoreClient = $CoreClient
@onready var world_view: WorldView = $World/WorldView
@onready var agents: AgentsLayer = $World/Agents
@onready var camera: CameraRig = $World/CameraRig
@onready var hud: Hud = $Hud

var _paint_dragging: bool = false
var _last_painted: Vector2i = Vector2i(-999, -999)


func _ready() -> void:
	core.connected.connect(_on_connected)
	core.disconnected.connect(_on_disconnected)
	core.status_changed.connect(_on_status)
	core.snapshot_received.connect(_on_snapshot)
	core.agents_updated.connect(_on_agents)
	core.clock_updated.connect(_on_clock)
	core.delta_received.connect(_on_delta)
	core.protocol_error.connect(_on_error)
	hud.speed_requested.connect(_on_speed)
	hud.vision_toggled.connect(_on_vision)
	hud.construction_toggled.connect(_on_construction)
	hud.build_undo_requested.connect(_on_undo)
	hud.build_redo_requested.connect(_on_redo)
	hud.save_requested.connect(_on_save)
	hud.load_requested.connect(_on_load)


func _process(_delta: float) -> void:
	_update_hover_inspect()


func _unhandled_input(event: InputEvent) -> void:
	if hud.is_construction():
		_handle_construction_input(event)
		return

	if hud.current_sandbox_tool() != "":
		_handle_sandbox_input(event)
		return

	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			var world_pos := world_view.get_global_mouse_position()
			var pawn := agents.pick_nearest(world_pos)
			if pawn:
				agents.set_selected(pawn.agent_id)
				hud.set_selection(pawn.describe())
				return
			var cell := WorldScale.px_to_cell(world_pos)
			var info := world_view.tile_info_at(cell)
			if String(info.get("type", "")) == "door":
				core.toggle_door(cell.x, cell.y)
				hud.set_selection("Porta (%d,%d) — alternando…" % [cell.x, cell.y])
				return
			if agents.get_selected_id() != "":
				core.move_agent(agents.get_selected_id(), cell.x, cell.y)
				var sel := agents.get_selected_id()
				var p2 := agents.get_pawn(sel)
				if p2:
					hud.set_selection("%s → (%d,%d)" % [p2.describe(), cell.x, cell.y])
				else:
					hud.set_selection("Selecionado: %s → (%d,%d)" % [sel, cell.x, cell.y])
			else:
				hud.set_selection("Nenhum agente selecionado")


func _handle_sandbox_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			# Direita cancela a ferramenta RT.
			hud.clear_sandbox_tool()
			_paint_dragging = false
			return
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_paint_dragging = mb.pressed
			if mb.pressed:
				_last_painted = Vector2i(-999, -999)
				_apply_sandbox_at_mouse()
		return
	if event is InputEventMouseMotion and _paint_dragging:
		_apply_sandbox_at_mouse()


func _handle_construction_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT or mb.button_index == MOUSE_BUTTON_RIGHT:
			_paint_dragging = mb.pressed
			if mb.pressed:
				_last_painted = Vector2i(-999, -999)
				# Botão direito = apagar, independente da ferramenta.
				var force_erase := mb.button_index == MOUSE_BUTTON_RIGHT
				_apply_tool_at_mouse(force_erase)
		return
	if event is InputEventMouseMotion:
		if _paint_dragging:
			var force_erase := Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
			_apply_tool_at_mouse(force_erase)


func _apply_sandbox_at_mouse() -> void:
	var cell := WorldScale.px_to_cell(world_view.get_global_mouse_position())
	if not world_view.in_bounds_cell(cell):
		return
	if cell == _last_painted:
		return
	_last_painted = cell
	var effect: String = hud.current_sandbox_tool()
	if effect == "":
		return
	core.apply_tool(effect, [{"x": cell.x, "y": cell.y}])


func _apply_tool_at_mouse(force_erase: bool = false) -> void:
	var cell := WorldScale.px_to_cell(world_view.get_global_mouse_position())
	if not world_view.in_bounds_cell(cell):
		return
	if cell == _last_painted:
		return
	_last_painted = cell
	var tool_id: String = "erase" if force_erase else hud.current_build_tool()
	match tool_id:
		"erase":
			core.remove_tiles([{"x": cell.x, "y": cell.y}])
		"furniture":
			core.place_object(hud.current_furniture_def(), cell.x, cell.y)
			# Um clique por móvel — não arrasta pilha.
			_paint_dragging = false
		"del_object":
			core.remove_object_at(cell.x, cell.y)
		"floor":
			core.paint_tiles("floor", "pinho", [{"x": cell.x, "y": cell.y}])
		"door":
			core.paint_tiles("door", "pinho", [{"x": cell.x, "y": cell.y}])
		"wall_wood":
			core.paint_tiles("wall", "pinho", [{"x": cell.x, "y": cell.y}])
		_:
			# Pedra: corta-fogo. Parede de madeira (inflamável) = tecla N.
			core.paint_tiles("wall", "pedra", [{"x": cell.x, "y": cell.y}])


func _update_hover_inspect() -> void:
	var cell := WorldScale.px_to_cell(world_view.get_global_mouse_position())
	if world_view.in_bounds_cell(cell):
		world_view.set_hover_cell(cell)
		var line := "Tile: %s" % world_view.describe_tile(cell)
		var sid := agents.get_selected_id()
		if sid != "" and not hud.is_construction():
			var pawn := agents.get_pawn(sid)
			if pawn:
				line += "\nSel: %s" % pawn.describe()
		hud.set_inspect(line)
	else:
		world_view.set_hover_cell(Vector2i(-1, -1))
		hud.set_inspect("Tile: —")


func _on_connected() -> void:
	hud.set_connected(true)


func _on_disconnected() -> void:
	hud.set_connected(false)


func _on_status(text: String) -> void:
	if not core.is_core_connected():
		hud.set_connected(false, text)


func _on_snapshot(payload: Dictionary) -> void:
	world_view.apply_snapshot(payload)
	agents.apply_snapshot(payload)
	camera.focus_world_center(world_view.world_size_px())
	camera.set_bounds(world_view.world_size_px())
	if payload.has("clock"):
		hud.apply_clock(payload["clock"])
	var mode := String(payload.get("mode", "normal"))
	var construction := mode == "construction"
	if construction != hud.is_construction():
		hud.set_construction(construction)
		world_view.set_construction_overlay(construction)


func _on_agents(payload: Dictionary) -> void:
	agents.apply_agents_update(payload)
	var sid := agents.get_selected_id()
	if sid != "" and not hud.is_construction() and hud.current_sandbox_tool() == "":
		var pawn := agents.get_pawn(sid)
		if pawn:
			hud.set_selection(pawn.describe())


func _on_clock(payload: Dictionary) -> void:
	hud.apply_clock(payload)
	agents.apply_clock(payload)


func _on_delta(payload: Dictionary) -> void:
	world_view.apply_delta(payload)


func _on_error(payload: Dictionary) -> void:
	push_warning("Protocolo: %s — %s" % [payload.get("code", "?"), payload.get("message", "")])
	var code := String(payload.get("code", ""))
	match code:
		"NO_PATH", "BLOCKED", "OUT_OF_BOUNDS":
			hud.set_selection("Inválido: %s" % String(payload.get("message", code)))
		"NOTHING_TO_UNDO":
			hud.set_selection("Nada para desfazer")
		"NOTHING_TO_REDO":
			hud.set_selection("Nada para refazer")
		"NOT_FOUND":
			hud.set_selection("Não encontrado: %s" % String(payload.get("message", code)))
		"SAVE_FAILED", "LOAD_FAILED":
			hud.set_selection("Save/load: %s" % String(payload.get("message", code)))


func _on_speed(speed: int) -> void:
	core.set_speed(speed)


func _on_vision(on: bool) -> void:
	agents.set_vision_debug(on)


func _on_construction(on: bool) -> void:
	_paint_dragging = false
	world_view.set_construction_overlay(on)
	if on:
		agents.set_selected("")
		core.set_mode("construction")
	else:
		core.set_mode("normal")


func _on_undo() -> void:
	core.undo_build()


func _on_redo() -> void:
	core.redo_build()


func _on_save() -> void:
	core.save_slot("demo")
	hud.set_selection("Salvando slot demo…")


func _on_load() -> void:
	core.load_slot("demo")
	hud.set_selection("Carregando slot demo…")
