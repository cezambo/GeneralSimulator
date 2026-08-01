## Overlay de pausa (Esc / P): retomar e ajuda. Não congela a árvore — só UI + sim.

class_name PauseMenu
extends CanvasLayer

signal resume_requested
signal help_requested

var _open: bool = false
var _dim: ColorRect
var _panel: PanelContainer
var _title: Label


func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build_ui()
	visible = false


func is_open() -> bool:
	return _open


func open() -> void:
	if _open:
		return
	_open = true
	visible = true


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false


func toggle() -> void:
	if _open:
		close()
		resume_requested.emit()
	else:
		open()


func _build_ui() -> void:
	_dim = ColorRect.new()
	_dim.name = "Dim"
	_dim.color = UiTheme.PAUSE_SCRIM
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_dim)

	var center := CenterContainer.new()
	center.name = "Center"
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_panel = PanelContainer.new()
	_panel.name = "Panel"
	_panel.custom_minimum_size = Vector2(280, 0)
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := UiTheme.make_panel_style()
	style.bg_color = Color(
		UiTheme.PANEL_BG_SOLID.r, UiTheme.PANEL_BG_SOLID.g, UiTheme.PANEL_BG_SOLID.b, 0.94
	)
	style.set_corner_radius_all(6)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	_panel.add_theme_stylebox_override("panel", style)
	center.add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	_panel.add_child(vbox)

	_title = Label.new()
	_title.text = "Pausa"
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	UiTheme.apply_title_label(_title)
	_title.add_theme_font_size_override("font_size", 20)
	vbox.add_child(_title)

	var hint := Label.new()
	hint.text = "Esc ou P para fechar"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	UiTheme.apply_muted_label(hint)
	vbox.add_child(hint)

	vbox.add_child(_make_button("Retomar", _on_resume_pressed))
	vbox.add_child(_make_button("Ajuda", _on_help_pressed))


func _make_button(text: String, handler: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 36)
	btn.pressed.connect(handler)
	return btn


func _on_resume_pressed() -> void:
	close()
	resume_requested.emit()


func _on_help_pressed() -> void:
	help_requested.emit()
