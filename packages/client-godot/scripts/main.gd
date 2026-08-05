## Cena raiz: liga CoreClient → WorldView / Agents / HUD / Camera.
## Cliente fino: zero pathfinding, zero validação de mundo.

extends Node

const PauseMenuScript := preload("res://scripts/pause_menu.gd")
const TopBarScript := preload("res://scripts/top_bar.gd")
const ContextMenuScript := preload("res://scripts/context_menu.gd")

@onready var core: CoreClient = $CoreClient
@onready var world_view: WorldView = $World/WorldView
@onready var agents: AgentsLayer = $World/Agents
@onready var camera: CameraRig = $World/CameraRig
@onready var hud: Hud = $Hud

var pause_menu: PauseMenu
var top_bar: TopBar
var context_menu: ContextMenu

var _paint_dragging: bool = false
var _last_painted: Vector2i = Vector2i(-999, -999)
var _move_from: Vector2i = Vector2i(-999, -999)
var _speed_before_menu: int = 1
var _menu_paused_sim: bool = false
## Cache do último res.agent.detail (agent + perception).
var _agent_detail_cache: Dictionary = {}
## Cache do último res.agent.perception (included / notable / visible / report).
var _perception_cache: Dictionary = {}
var _perception_poll_left: float = 0.0
const _PERCEPTION_POLL_SEC := 0.85
const _PERCEPTION_DETAIL_EVERY := 4 ## ciclos locais por cada req.agent.detail
var _perception_detail_countdown: int = 0


func _ready() -> void:
	_setup_overlays()
	_wire_core()
	_wire_hud()
	_wire_overlays()


func _setup_overlays() -> void:
	pause_menu = PauseMenuScript.new() as PauseMenu
	pause_menu.name = "PauseMenu"
	add_child(pause_menu)

	top_bar = TopBarScript.new() as TopBar
	top_bar.name = "TopBar"
	add_child(top_bar)

	context_menu = ContextMenuScript.new() as ContextMenu
	context_menu.name = "ContextMenu"
	add_child(context_menu)


func _wire_core() -> void:
	core.connected.connect(_on_connected)
	core.disconnected.connect(_on_disconnected)
	core.status_changed.connect(_on_status)
	core.snapshot_received.connect(_on_snapshot)
	core.agents_updated.connect(_on_agents)
	core.clock_updated.connect(_on_clock)
	core.delta_received.connect(_on_delta)
	core.agent_detail_received.connect(_on_agent_detail)
	core.agent_perception_received.connect(_on_agent_perception)
	core.protocol_error.connect(_on_error)


func _wire_hud() -> void:
	hud.speed_requested.connect(_on_speed)
	hud.vision_toggled.connect(_on_vision)
	hud.construction_toggled.connect(_on_construction)
	hud.build_undo_requested.connect(_on_undo)
	hud.build_redo_requested.connect(_on_redo)
	hud.build_rotate_requested.connect(_on_rotate)
	hud.save_requested.connect(_on_save)
	hud.load_requested.connect(_on_load)
	hud.agent_perception_closed.connect(_on_perception_closed)


func _wire_overlays() -> void:
	pause_menu.resume_requested.connect(_on_pause_resume)
	pause_menu.help_requested.connect(_on_pause_help)
	top_bar.speed_requested.connect(_on_speed)
	context_menu.action_selected.connect(_on_context_action)


func _process(delta: float) -> void:
	if pause_menu != null and pause_menu.is_open():
		return
	if context_menu != null and context_menu.is_open():
		return
	_update_hover_inspect()
	_poll_agent_perception(delta)


func _unhandled_input(event: InputEvent) -> void:
	if context_menu != null and context_menu.is_open():
		if _is_pause_menu_toggle(event):
			# Esc / P: fecha o contexto primeiro (não abre pausa).
			context_menu.close()
			get_viewport().set_input_as_handled()
		return

	# Esc com ferramenta G/Q activa: cancela a ferramenta (não abre pausa).
	# Dir. no modo normal abre sempre o menu de contexto — não cancela G/Q.
	if _is_escape_key(event) and not hud.is_construction() and hud.current_sandbox_tool() != "":
		if pause_menu == null or not pause_menu.is_open():
			hud.clear_sandbox_tool()
			_paint_dragging = false
			get_viewport().set_input_as_handled()
			return

	if _is_pause_menu_toggle(event):
		_toggle_pause_menu()
		get_viewport().set_input_as_handled()
		return

	if pause_menu != null and pause_menu.is_open():
		return

	if hud.is_construction():
		_handle_construction_input(event)
		return

	# Modo normal: Dir. / F2 / Menu → menu no cursor (mesmo com G/Q activo).
	if _is_context_menu_open_event(event):
		_open_context_at_mouse()
		get_viewport().set_input_as_handled()
		return

	if hud.current_sandbox_tool() != "":
		_handle_sandbox_input(event)
		return

	_handle_world_pick_input(event)


func _is_pause_menu_toggle(event: InputEvent) -> bool:
	if not event is InputEventKey:
		return false
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return false
	var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
	return code == KEY_ESCAPE or code == KEY_P


func _toggle_pause_menu() -> void:
	if context_menu != null and context_menu.is_open():
		context_menu.close()
	if pause_menu.is_open():
		pause_menu.close()
		_on_pause_resume()
	else:
		_speed_before_menu = top_bar.resume_speed() if top_bar else 1
		_menu_paused_sim = true
		core.set_speed(0)
		if top_bar:
			top_bar.set_paused_visual(true)
		pause_menu.open()


func _is_escape_key(event: InputEvent) -> bool:
	if not event is InputEventKey:
		return false
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return false
	var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
	return code == KEY_ESCAPE


func _is_context_menu_hotkey(event: InputEvent) -> bool:
	if not event is InputEventKey:
		return false
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return false
	var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
	return code == KEY_MENU or code == KEY_F2


func _is_context_menu_open_event(event: InputEvent) -> bool:
	if _is_context_menu_hotkey(event):
		return true
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		return mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT
	return false


func _open_context_at_mouse() -> void:
	var cell := world_view.cell_at_mouse()
	if not world_view.in_bounds_cell(cell):
		return
	_paint_dragging = false
	if context_menu != null and context_menu.is_open():
		context_menu.close()
	world_view.set_hover_cell(cell)
	var info := world_view.tile_info_at(cell)
	var screen := get_viewport().get_mouse_position()
	context_menu.open_at(screen, cell, info)


func _on_context_action(action_id: String, cell: Vector2i) -> void:
	if not world_view.in_bounds_cell(cell):
		return
	world_view.set_hover_cell(cell)
	match action_id:
		ContextMenu.ACTION_WET, ContextMenu.ACTION_EXTINGUISH, ContextMenu.ACTION_IGNITE, ContextMenu.ACTION_SMOKE, ContextMenu.ACTION_DRY:
			core.apply_tool(action_id, [{"x": cell.x, "y": cell.y}])
			hud.set_selection("%s → (%d,%d)" % [_context_action_label(action_id), cell.x, cell.y])
		ContextMenu.ACTION_TOGGLE_DOOR:
			core.toggle_door(cell.x, cell.y)
			hud.set_selection("Porta (%d,%d) — alternando…" % [cell.x, cell.y])
		ContextMenu.ACTION_INSPECT:
			var line := world_view.describe_tile(cell)
			hud.set_inspect(line)
			hud.set_selection("Inspeção (%d,%d)" % [cell.x, cell.y])
			var half := WorldScale.PIXELS_PER_TILE * 0.5
			camera.position = WorldScale.cell_to_px(cell.x, cell.y) + Vector2(half, half)
		_:
			pass


func _context_action_label(action_id: String) -> String:
	match action_id:
		ContextMenu.ACTION_WET:
			return "Molhar"
		ContextMenu.ACTION_EXTINGUISH:
			return "Extinguir"
		ContextMenu.ACTION_IGNITE:
			return "Atear fogo"
		ContextMenu.ACTION_SMOKE:
			return "Emitir fumaça"
		ContextMenu.ACTION_DRY:
			return "Secar"
		_:
			return action_id


func _on_pause_resume() -> void:
	if _menu_paused_sim:
		_menu_paused_sim = false
		core.set_speed(_speed_before_menu if _speed_before_menu > 0 else 1)
	if pause_menu.is_open():
		pause_menu.close()


func _on_pause_help() -> void:
	# Mantém a sim pausada; encaminha para o HUD se houver sinal, senão dispara H (overlay existente).
	if not _menu_paused_sim:
		_speed_before_menu = top_bar.resume_speed() if top_bar else 1
		_menu_paused_sim = true
		core.set_speed(0)
	if hud.has_signal("help_requested"):
		hud.emit_signal("help_requested")
		return
	var ev := InputEventKey.new()
	ev.pressed = true
	ev.echo = false
	ev.keycode = KEY_H
	ev.physical_keycode = KEY_H
	get_viewport().push_unhandled_input(ev)


func _handle_world_pick_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		# Dir. tratado em _unhandled_input (sempre abre menu no modo normal).
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			var world_pos := world_view.to_global(world_view.get_local_mouse_position())
			var pawn := agents.pick_nearest(world_pos)
			if pawn:
				_select_agent(pawn)
				return
			var cell := world_view.cell_at_mouse()
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
				hud.hide_agent_perception()
				_agent_detail_cache.clear()


func _handle_sandbox_input(event: InputEvent) -> void:
	# Dir. já abre o menu de contexto em _unhandled_input.
	# Cancelar G/Q: Esc, ou voltar a premir G/Q (toggle no Hud).
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
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
		if mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			_move_from = Vector2i(-999, -999)
			_paint_dragging = false
			_last_painted = Vector2i(-999, -999)
			_apply_tool_at_mouse(true)
			return
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if hud.current_build_tool() == "move_furniture":
				if mb.pressed:
					_handle_move_furniture_click()
				return
			_paint_dragging = mb.pressed
			if mb.pressed:
				_last_painted = Vector2i(-999, -999)
				_apply_tool_at_mouse(false)
		return
	if event is InputEventMouseMotion:
		if _paint_dragging and hud.current_build_tool() != "move_furniture":
			var force_erase := Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
			_apply_tool_at_mouse(force_erase)


func _apply_sandbox_at_mouse() -> void:
	var cell := world_view.cell_at_mouse()
	if not world_view.in_bounds_cell(cell):
		return
	if cell == _last_painted:
		return
	_last_painted = cell
	var effect: String = hud.current_sandbox_tool()
	if effect == "":
		return
	# Alinha hover/inspect com o clique (mesmo convertor local).
	world_view.set_hover_cell(cell)
	core.apply_tool(effect, [{"x": cell.x, "y": cell.y}])
	hud.note_sandbox_apply(cell.x, cell.y)


func _apply_tool_at_mouse(force_erase: bool = false) -> void:
	var cell := world_view.cell_at_mouse()
	if not world_view.in_bounds_cell(cell):
		return
	if cell == _last_painted:
		return
	_last_painted = cell
	world_view.set_hover_cell(cell)
	var tool_id: String = "erase" if force_erase else hud.current_build_tool()
	match tool_id:
		"erase":
			core.remove_tiles([{"x": cell.x, "y": cell.y}])
		"furniture":
			core.place_object(hud.current_furniture_def(), cell.x, cell.y)
			# Um clique por móvel — não arrasta pilha.
			_paint_dragging = false
		"move_furniture":
			pass
		"del_object":
			core.remove_object_at(cell.x, cell.y)
		"floor":
			core.paint_tiles("floor", "pinho", [{"x": cell.x, "y": cell.y}])
		"door":
			core.paint_tiles("door", "pinho", [{"x": cell.x, "y": cell.y}])
		"window":
			core.paint_tiles("window", hud.current_build_material(), [{"x": cell.x, "y": cell.y}])
		"wall_wood":
			core.paint_tiles("wall", "pinho", [{"x": cell.x, "y": cell.y}])
		_:
			# Pedra: corta-fogo. Parede de madeira (inflamável) = tecla N.
			core.paint_tiles("wall", "pedra", [{"x": cell.x, "y": cell.y}])


func _handle_move_furniture_click() -> void:
	var cell := world_view.cell_at_mouse()
	if not world_view.in_bounds_cell(cell):
		return
	if _move_from.x < 0:
		_move_from = cell
		hud.set_selection("Mover: origem (%d,%d) — clique o destino" % [cell.x, cell.y])
		return
	core.move_object_at(_move_from.x, _move_from.y, cell.x, cell.y)
	hud.set_selection("Móvel (%d,%d) → (%d,%d)" % [_move_from.x, _move_from.y, cell.x, cell.y])
	_move_from = Vector2i(-999, -999)


func _update_hover_inspect() -> void:
	var cell := world_view.cell_at_mouse()
	if world_view.in_bounds_cell(cell):
		world_view.set_hover_cell(cell)
		var line := world_view.describe_tile(cell)
		var sid := agents.get_selected_id()
		if sid != "" and not hud.is_construction():
			var pawn := agents.get_pawn(sid)
			if pawn:
				line += "\nSel: %s" % pawn.describe()
		hud.set_inspect(line)
	else:
		world_view.set_hover_cell(Vector2i(-1, -1))
		hud.set_inspect("—")


func _on_connected() -> void:
	hud.set_connected(true)
	print_rich("[color=lime][Main] HUD: núcleo conectado[/color]")


func _on_disconnected() -> void:
	hud.set_connected(false, "queda de ligação")
	print_rich("[color=orange][Main] HUD: núcleo desconectado — a reconectar…[/color]")


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
		if top_bar:
			top_bar.apply_clock(payload["clock"])
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
	# Se o selecionado desapareceu do update, fecha o painel.
	if hud.is_agent_perception_open():
		var pid := hud.perception_agent_id()
		if pid != "" and agents.get_pawn(pid) == null:
			hud.hide_agent_perception()
			_agent_detail_cache.clear()
			_perception_cache.clear()
			agents.set_selected("")


func _on_clock(payload: Dictionary) -> void:
	hud.apply_clock(payload)
	agents.apply_clock(payload)
	if top_bar:
		top_bar.apply_clock(payload)


func _on_delta(payload: Dictionary) -> void:
	world_view.apply_delta(payload)


func _on_agent_detail(payload: Dictionary) -> void:
	if payload.is_empty():
		return
	# Protocolo: { agent, perception } — não { id, … } no topo.
	var agent_raw: Variant = payload.get("agent", {})
	var agent: Dictionary = agent_raw if typeof(agent_raw) == TYPE_DICTIONARY else {}
	var id := String(agent.get("id", payload.get("id", "")))
	if id == "" or id != agents.get_selected_id():
		return
	_agent_detail_cache = {
		"id": id,
		"name": String(agent.get("name", "")),
		"agent": agent.duplicate(true),
	}
	var perc_raw: Variant = payload.get("perception", {})
	if typeof(perc_raw) == TYPE_DICTIONARY and not (perc_raw as Dictionary).is_empty():
		_perception_cache = (perc_raw as Dictionary).duplicate(true)
		_perception_cache["agentId"] = id
	_push_perception_to_hud(id, true)


func _on_agent_perception(payload: Dictionary) -> void:
	if payload.is_empty():
		return
	var id := String(payload.get("agentId", payload.get("id", "")))
	if id == "" or id != agents.get_selected_id():
		return
	_perception_cache = payload.duplicate(true)
	_push_perception_to_hud(id, true)


func _on_perception_closed() -> void:
	agents.set_selected("")
	_agent_detail_cache.clear()
	_perception_cache.clear()
	hud.set_selection("Nenhum agente selecionado")


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
			# Detalhe do agente em falta — painel fica com enriquecimento local.
			if hud.is_agent_perception_open():
				hud.set_agent_perception_loading(false)
			else:
				hud.set_selection("Não encontrado: %s" % String(payload.get("message", code)))
		"SAVE_FAILED", "LOAD_FAILED":
			hud.set_selection("Save/load: %s" % String(payload.get("message", code)))


func _on_speed(speed: int) -> void:
	if speed > 0:
		_menu_paused_sim = false
		_speed_before_menu = speed
		if pause_menu != null and pause_menu.is_open():
			pause_menu.close()
	core.set_speed(speed)


func _on_vision(on: bool) -> void:
	agents.set_vision_debug(on)


func _on_construction(on: bool) -> void:
	_paint_dragging = false
	_move_from = Vector2i(-999, -999)
	world_view.set_construction_overlay(on)
	if on:
		agents.set_selected("")
		_agent_detail_cache.clear()
		_perception_cache.clear()
		hud.hide_agent_perception()
		core.set_mode("construction")
	else:
		core.set_mode("normal")


func _select_agent(pawn: AgentPawn) -> void:
	agents.set_selected(pawn.agent_id)
	hud.set_selection(pawn.describe())
	hud.show_agent_perception(pawn.agent_id, pawn.agent_name)
	_agent_detail_cache.clear()
	_perception_cache.clear()
	_perception_poll_left = 0.0
	_perception_detail_countdown = 0
	_push_perception_to_hud(pawn.agent_id, false)
	# Preferir o endpoint dedicado; detail traz o mesmo perception + perfil.
	core.request_agent_perception(pawn.agent_id)
	core.request_agent_detail(pawn.agent_id)


func _poll_agent_perception(delta: float) -> void:
	if hud.is_construction() or not hud.is_agent_perception_open():
		return
	var sid := agents.get_selected_id()
	if sid == "" or sid != hud.perception_agent_id():
		return
	_perception_poll_left -= delta
	if _perception_poll_left > 0.0:
		return
	_perception_poll_left = _PERCEPTION_POLL_SEC
	# Refresh imediato com cache/local; pede ao núcleo o scan fresco.
	_push_perception_to_hud(sid, false)
	core.request_agent_perception(sid)
	_perception_detail_countdown -= 1
	if _perception_detail_countdown <= 0:
		_perception_detail_countdown = _PERCEPTION_DETAIL_EVERY
		core.request_agent_detail(sid)


func _push_perception_to_hud(agent_id: String, from_core: bool) -> void:
	var payload := _build_agent_perception_payload(agent_id)
	if payload.is_empty():
		return
	if from_core:
		hud.set_agent_perception_loading(false)
	hud.apply_agent_detail(payload)


## Monta Dictionary para o painel: preferir res.agent.perception / detail.perception
## (included, notable, visible, report); fallback local só se o núcleo ainda não respondeu.
func _build_agent_perception_payload(agent_id: String) -> Dictionary:
	var pawn := agents.get_pawn(agent_id)
	if pawn == null:
		return {}

	var origin := pawn.position / WorldScale.PIXELS_PER_TILE
	var facing := pawn.rotation_degrees
	var angle := pawn.vision_angle_deg
	var range_tiles := pawn.vision_range_tiles

	var detail: Dictionary = {
		"id": agent_id,
		"name": pawn.agent_name,
	}
	if not _agent_detail_cache.is_empty() and String(_agent_detail_cache.get("id", "")) == agent_id:
		if String(_agent_detail_cache.get("name", "")) != "":
			detail["name"] = String(_agent_detail_cache.get("name", ""))

	# Visão: preferir núcleo (perception.vision); senão pawn / agents.update.
	var vision := {"angle": angle, "range": range_tiles}
	var core_perception: Dictionary = {}
	if not _perception_cache.is_empty() and String(_perception_cache.get("agentId", "")) == agent_id:
		core_perception = _perception_cache.duplicate(true)
	if not core_perception.is_empty():
		var cv: Variant = core_perception.get("vision", {})
		if typeof(cv) == TYPE_DICTIONARY:
			var cvd: Dictionary = cv
			var ca := float(cvd.get("angle", 0.0))
			var cr := float(cvd.get("range", 0.0))
			if ca > 0.0 or cr > 0.0:
				vision = {"angle": ca if ca > 0.0 else angle, "range": cr if cr > 0.0 else range_tiles}

	detail["vision"] = vision

	if core_perception.is_empty():
		# Stub local até chegar res.agent.perception.
		detail["perception"] = _collect_local_perception(
			agent_id, origin, facing, angle, range_tiles
		)
	else:
		# Payload do núcleo intacto (included / notable / visible / report).
		var merged := core_perception.duplicate(true)
		if not merged.has("vision"):
			merged["vision"] = vision
		detail["perception"] = merged

	return detail


func _collect_local_perception(
	self_id: String,
	origin: Vector2,
	facing_deg: float,
	angle_deg: float,
	range_tiles: float
) -> Dictionary:
	var in_cone: Array = []
	var ambient := {
		"fire": [],
		"smoke": [],
		"wet": [],
		"heat": [],
		"doors": [],
	}

	var r := int(ceil(maxf(range_tiles, 1.0)))
	var ox := int(floor(origin.x))
	var oy := int(floor(origin.y))
	var half := maxf(angle_deg * 0.5, 1.0)

	for dy in range(-r, r + 1):
		for dx in range(-r, r + 1):
			var cell := Vector2i(ox + dx, oy + dy)
			if not world_view.in_bounds_cell(cell):
				continue
			var center := Vector2(float(cell.x) + 0.5, float(cell.y) + 0.5)
			var dist := origin.distance_to(center)
			var cheb := maxi(absi(dx), absi(dy))
			var in_cone_cell := _point_in_vision_cone(origin, facing_deg, half, range_tiles, center)

			var info := world_view.tile_info_at(cell)
			if info.is_empty():
				continue

			# Ambiente imediato: vizinhança (inclui a célula do agente).
			if cheb <= 1:
				_append_ambient_from_tile(ambient, cell, info)

			if not in_cone_cell or dist > range_tiles:
				continue
			_append_cone_from_tile(in_cone, cell, info)

	# Outros agentes no cone.
	for other_id in agents.get_all_ids():
		if other_id == self_id:
			continue
		var other := agents.get_pawn(other_id)
		if other == null:
			continue
		var op := other.position / WorldScale.PIXELS_PER_TILE
		if not _point_in_vision_cone(origin, facing_deg, half, range_tiles, op):
			continue
		in_cone.append({
			"kind": "agent",
			"text": "%s (%s)" % [other.agent_name, other.agent_id],
		})

	return {"inCone": in_cone, "ambient": ambient, "vision": {"angle": angle_deg, "range": range_tiles}}


func _point_in_vision_cone(
	origin: Vector2,
	facing_deg: float,
	half_angle_deg: float,
	range_tiles: float,
	point: Vector2
) -> bool:
	var delta := point - origin
	var dist := delta.length()
	if dist > range_tiles:
		return false
	if dist < 0.15:
		return true
	var bearing := rad_to_deg(atan2(delta.y, delta.x))
	var diff := absf(wrapf(bearing - facing_deg, -180.0, 180.0))
	return diff <= half_angle_deg + 0.01


func _append_ambient_from_tile(ambient: Dictionary, cell: Vector2i, info: Dictionary) -> void:
	var where := "(%d,%d)" % [cell.x, cell.y]
	var tile_type := String(info.get("type", ""))
	var temp := float(info.get("temperature", 20.0))
	var states: Array = info.get("states", [])

	if tile_type == "door":
		var st: Dictionary = info.get("state", {})
		var open := bool(st.get("isOpen", false))
		(ambient["doors"] as Array).append("%s %s" % [where, "aberta" if open else "fechada"])

	for s in states:
		if typeof(s) != TYPE_DICTIONARY:
			continue
		var stype := String(s.get("type", ""))
		var inten := float(s.get("intensity", 0))
		if inten <= 0.0:
			continue
		match stype:
			"burning", "on_fire", "fire":
				(ambient["fire"] as Array).append("%s (intens. %.0f)" % [where, inten])
			"smoky", "smoke":
				(ambient["smoke"] as Array).append("%s (intens. %.0f)" % [where, inten])
			"wet":
				(ambient["wet"] as Array).append("%s (intens. %.0f)" % [where, inten])

	if temp >= 45.0:
		(ambient["heat"] as Array).append("%s (%.0f°C)" % [where, temp])


func _append_cone_from_tile(in_cone: Array, cell: Vector2i, info: Dictionary) -> void:
	var tile_type := String(info.get("type", ""))
	var look := String(info.get("look", "")).strip_edges()
	if look == "":
		look = world_view.describe_tile(cell).split("\n")[0]
		# describe_tile prefixa "(x,y) " — remove para prosa curta.
		var sp := look.find(" ")
		if sp > 0 and look.begins_with("("):
			look = look.substr(sp + 1).strip_edges()

	var states: Array = info.get("states", [])
	var notable := tile_type != "floor" and tile_type != ""
	if not notable:
		for s in states:
			if typeof(s) == TYPE_DICTIONARY and float(s.get("intensity", 0)) > 0.0:
				notable = true
				break
	if not notable and look.contains("com "):
		notable = true
	if not notable and float(info.get("temperature", 20.0)) >= 45.0:
		notable = true
	if not notable:
		return

	var kind := "tile"
	if look.contains("com ") or look.contains("cadeira") or look.contains("mesa") or look.contains("cama"):
		kind = "object" if tile_type == "floor" else "tile"
		if kind == "object":
			in_cone.append({"kind": "object", "text": look})
			return

	in_cone.append({"kind": "tile", "text": look if look != "" else tile_type})


func _on_undo() -> void:
	core.undo_build()


func _on_redo() -> void:
	core.redo_build()


func _on_rotate() -> void:
	if not hud.is_construction():
		return
	var cell := world_view.cell_at_mouse()
	if not world_view.in_bounds_cell(cell):
		return
	core.rotate_object_at(cell.x, cell.y, 90.0)
	hud.set_selection("Girando móvel em (%d,%d)…" % [cell.x, cell.y])


func _on_save() -> void:
	core.save_slot("demo")
	hud.set_selection("Salvando slot demo…")


func _on_load() -> void:
	core.load_slot("demo")
	hud.set_selection("Carregando slot demo…")
