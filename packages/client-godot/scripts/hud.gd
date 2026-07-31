## HUD: status do núcleo, relógio, inspeção e atalhos.

class_name Hud
extends CanvasLayer

signal speed_requested(speed: int)
signal vision_toggled(on: bool)
signal construction_toggled(on: bool)
signal build_tool_changed(tool_id: String)
signal build_undo_requested
signal build_redo_requested
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
## wall | wall_wood | floor | door | erase | furniture | del_object
var _build_tool: String = "wall"
var _furniture_def: String = "cadeira_madeira"
## "" | wet | extinguish — ferramentas RT fora da construção
var _sandbox_tool: String = ""
var _selection_text: String = "Nenhum agente selecionado"


func _ready() -> void:
	_refresh_help()
	if select_label:
		select_label.text = _selection_text
	if inspect_label:
		inspect_label.text = "Tile: —"
	set_connected(false)


func set_connected(ok: bool, detail: String = "") -> void:
	_connected = ok
	if ok:
		status_label.text = "Núcleo conectado (ws://127.0.0.1:8787)"
		status_label.modulate = Color("8fbc8f")
	else:
		var extra := (" — " + detail) if detail != "" else ""
		status_label.text = "Núcleo desconectado — tentando reconectar…" + extra
		status_label.modulate = Color("e07a5f")


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
	if select_label:
		if _construction:
			select_label.text = "Ferramenta: %s" % _tool_label(_build_tool)
		elif _sandbox_tool != "":
			select_label.text = "Ferramenta RT: %s · %s" % [_sandbox_label(_sandbox_tool), text]
		else:
			select_label.text = text


func set_inspect(text: String) -> void:
	if inspect_label:
		inspect_label.text = text


func set_construction(on: bool) -> void:
	_construction = on
	if on:
		_sandbox_tool = ""
	_refresh_help()
	if _construction:
		if not clock_label.text.ends_with("CONSTRUÇÃO"):
			clock_label.text += " · CONSTRUÇÃO"
	else:
		clock_label.text = clock_label.text.replace(" · CONSTRUÇÃO", "")
	set_selection(_selection_text)


func is_construction() -> bool:
	return _construction


func current_build_tool() -> String:
	return _build_tool


func current_furniture_def() -> String:
	return _furniture_def


func current_sandbox_tool() -> String:
	return _sandbox_tool


func clear_sandbox_tool() -> void:
	if _sandbox_tool == "":
		return
	_sandbox_tool = ""
	_refresh_help()
	sandbox_tool_changed.emit(_sandbox_tool)


func _refresh_help() -> void:
	if _construction:
		help_label.text = "C·sair · B parede pedra · N parede madeira · F/R chão/porta · E apagar · T cadeira · X móvel · Z/Y undo/redo"
		set_selection(_selection_text)
	else:
		help_label.text = "Clique: sel./andar · porta · G água · Q apagar fogo · F6 salvar · F7 carregar · C construir · Espaço pausa · 1–4 vel · V cone · WASD"
		set_selection(_selection_text)


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
		"erase":
			return "apagar tile → chão"
		"furniture":
			return "móvel: %s" % _furniture_def
		"del_object":
			return "remover móvel"
		_:
			return tool_id


func _sandbox_label(tool_id: String) -> String:
	match tool_id:
		"wet":
			return "água (molha / apaga fogo)"
		"extinguish":
			return "apagar fogo"
		_:
			return tool_id


func _set_tool(tool_id: String) -> void:
	_build_tool = tool_id
	_refresh_help()
	build_tool_changed.emit(_build_tool)


func _set_sandbox_tool(tool_id: String) -> void:
	if _sandbox_tool == tool_id:
		_sandbox_tool = ""
	else:
		_sandbox_tool = tool_id
	_refresh_help()
	sandbox_tool_changed.emit(_sandbox_tool)


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action_pressed("toggle_construction"):
		_construction = not _construction
		set_construction(_construction)
		construction_toggled.emit(_construction)
		return
	if _construction:
		if event.is_action_pressed("build_tool_wall"):
			_set_tool("wall")
		elif event.is_action_pressed("build_tool_wall_wood"):
			_set_tool("wall_wood")
		elif event.is_action_pressed("build_tool_floor"):
			_set_tool("floor")
		elif event.is_action_pressed("build_tool_door"):
			_set_tool("door")
		elif event.is_action_pressed("build_tool_erase"):
			_set_tool("erase")
		elif event.is_action_pressed("build_tool_furniture"):
			_set_tool("furniture")
		elif event.is_action_pressed("build_tool_del_object"):
			_set_tool("del_object")
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
