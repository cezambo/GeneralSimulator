## HUD: status do núcleo, relógio e atalhos de velocidade.

class_name Hud
extends CanvasLayer

signal speed_requested(speed: int)
signal vision_toggled(on: bool)

@onready var status_label: Label = $Margin/VBox/Status
@onready var clock_label: Label = $Margin/VBox/Clock
@onready var help_label: Label = $Margin/VBox/Help

var _vision_on: bool = true
var _connected: bool = false
var _last_speed: int = 1
var _paused: bool = false


func _ready() -> void:
	help_label.text = "Espaço: pausa · 1/2/3/4: vel · V: cone · WASD/meio: câmera · roda: zoom"
	set_connected(false)


func set_connected(ok: bool) -> void:
	_connected = ok
	if ok:
		status_label.text = "Núcleo conectado (ws://127.0.0.1:8787)"
		status_label.modulate = Color("8fbc8f")
	else:
		status_label.text = "Núcleo desconectado — tentando reconectar…"
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
	clock_label.text = "Dia %d · Est. %d · Ano %d · %02d:%02d · %s" % [day, season, year, hour, minute, speed_txt]


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
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
