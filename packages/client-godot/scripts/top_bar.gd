## Barra superior direita: velocidade da sim e indicador de pausa.
## Ligação ao núcleo fica no HUD — aqui só orquestra speed/pause.

class_name TopBar
extends CanvasLayer

signal speed_requested(speed: int)

const SPEEDS: Array[int] = [1, 2, 5, 20]

var _speed: int = 1
var _paused: bool = false
var _resume_speed: int = 1

var _status: Label
var _speed_buttons: Dictionary = {} # int -> Button
var _pause_btn: Button


func _ready() -> void:
	layer = 8
	_build_ui()
	_refresh()


func apply_clock(payload: Dictionary) -> void:
	_speed = int(payload.get("speed", _speed))
	_paused = bool(payload.get("paused", false)) or _speed == 0
	if _speed > 0:
		_resume_speed = _speed
	_refresh()


func set_paused_visual(paused: bool) -> void:
	_paused = paused
	_refresh()


func resume_speed() -> int:
	return _resume_speed if _resume_speed > 0 else 1


func _build_ui() -> void:
	var root := MarginContainer.new()
	root.name = "Margin"
	root.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	root.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	root.offset_left = -360
	root.offset_top = 10
	root.offset_right = -12
	root.offset_bottom = 52
	root.add_theme_constant_override("margin_left", 0)
	root.add_theme_constant_override("margin_right", 0)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := UiTheme.make_panel_style()
	style.bg_color = Color(UiTheme.PANEL_BG.r, UiTheme.PANEL_BG.g, UiTheme.PANEL_BG.b, 0.72)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", style)
	root.add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	panel.add_child(row)

	_status = Label.new()
	_status.custom_minimum_size = Vector2(72, 0)
	_status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", UiTheme.FONT_SELECT)
	_status.add_theme_color_override("font_outline_color", UiTheme.TEXT_OUTLINE)
	_status.add_theme_constant_override("outline_size", 3)
	row.add_child(_status)

	_pause_btn = Button.new()
	_pause_btn.text = "❚❚"
	_pause_btn.tooltip_text = "Pausar / retomar (Espaço)"
	_pause_btn.custom_minimum_size = Vector2(36, 28)
	_pause_btn.pressed.connect(_on_pause_pressed)
	row.add_child(_pause_btn)

	for s in SPEEDS:
		var btn := Button.new()
		btn.text = "x%d" % s
		btn.custom_minimum_size = Vector2(40, 28)
		btn.tooltip_text = "Velocidade x%d" % s
		btn.pressed.connect(_on_speed_pressed.bind(s))
		row.add_child(btn)
		_speed_buttons[s] = btn


func _refresh() -> void:
	if _status == null:
		return
	if _paused:
		_status.text = "Pausado"
		_status.modulate = UiTheme.STATUS_PAUSED
	else:
		_status.text = "x%d" % maxi(_speed, 1)
		_status.modulate = UiTheme.STATUS_OK

	if _pause_btn:
		_pause_btn.text = "▶" if _paused else "❚❚"
		_pause_btn.modulate = UiTheme.modulate_paused(_paused)

	for s in SPEEDS:
		var btn: Button = _speed_buttons.get(s)
		if btn == null:
			continue
		var active := (not _paused) and _speed == s
		btn.modulate = Color(0.75, 1.0, 0.7) if active else Color.WHITE
		btn.disabled = false


func _on_pause_pressed() -> void:
	if _paused:
		speed_requested.emit(resume_speed())
	else:
		speed_requested.emit(0)


func _on_speed_pressed(speed: int) -> void:
	speed_requested.emit(speed)
