## Menu de contexto do tile (modo normal, PT-BR).
## Abre no clique direito / tecla Menu ou F2; envia ações ao Main via sinal.

class_name ContextMenu
extends CanvasLayer

signal action_selected(action_id: String, cell: Vector2i)

const ACTION_WET := "wet"
const ACTION_EXTINGUISH := "extinguish"
const ACTION_IGNITE := "ignite"
const ACTION_SMOKE := "smoke"
const ACTION_DRY := "dry"
const ACTION_INSPECT := "inspect"
const ACTION_TOGGLE_DOOR := "toggle_door"

const _COL_BTN := Color(0.14, 0.16, 0.17, 1)
const _COL_BTN_HOVER := Color(0.2, 0.23, 0.24, 1)
const _COL_BTN_PRESS := Color(0.28, 0.32, 0.26, 1)

var _open: bool = false
var _cell: Vector2i = Vector2i(-1, -1)
var _pending_pos: Vector2 = Vector2.ZERO
var _blocker: ColorRect
var _panel: PanelContainer
var _vbox: VBoxContainer
var _title: Label


func _ready() -> void:
	layer = 15
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build_ui()
	visible = false


func is_open() -> bool:
	return _open


func cell() -> Vector2i:
	return _cell


func open_at(screen_pos: Vector2, cell: Vector2i, tile_info: Dictionary = {}) -> void:
	_cell = cell
	_pending_pos = screen_pos
	_rebuild_items(tile_info)
	_open = true
	visible = true
	# Ignora o clique direito que abriu o menu (evita fechar no mesmo frame).
	_blocker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place_panel(screen_pos)
	_panel.move_to_front()
	# Re-mede após o layout dos botões e reclama às bordas.
	call_deferred("_place_panel_deferred")


func close() -> void:
	if not _open:
		return
	_open = false
	visible = false
	_cell = Vector2i(-1, -1)
	_blocker.mouse_filter = Control.MOUSE_FILTER_IGNORE


func _build_ui() -> void:
	_blocker = ColorRect.new()
	_blocker.name = "OutsideClick"
	_blocker.color = Color(0, 0, 0, 0.001)
	_blocker.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_blocker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_blocker.gui_input.connect(_on_blocker_input)
	add_child(_blocker)

	_panel = PanelContainer.new()
	_panel.name = "Panel"
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.clip_contents = true
	_panel.custom_minimum_size = Vector2(196, 0)
	var style := UiTheme.make_panel_style()
	style.bg_color = Color(
		UiTheme.PANEL_BG_SOLID.r, UiTheme.PANEL_BG_SOLID.g, UiTheme.PANEL_BG_SOLID.b, 0.96
	)
	style.set_corner_radius_all(5)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	_panel.add_theme_stylebox_override("panel", style)
	add_child(_panel)

	_vbox = VBoxContainer.new()
	_vbox.add_theme_constant_override("separation", 4)
	_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_panel.add_child(_vbox)

	_title = Label.new()
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	UiTheme.apply_accent_label(_title)
	_vbox.add_child(_title)


func _rebuild_items(tile_info: Dictionary) -> void:
	var stale: Array[Node] = []
	for child in _vbox.get_children():
		if child != _title:
			stale.append(child)
	for child in stale:
		_vbox.remove_child(child)
		child.free()

	_title.text = "Tile (%d,%d)" % [_cell.x, _cell.y]

	_add_button("Molhar", ACTION_WET)
	_add_button("Extinguir", ACTION_EXTINGUISH)
	_add_button("Atear fogo", ACTION_IGNITE)
	_add_button("Emitir fumaça", ACTION_SMOKE)
	_add_button("Secar", ACTION_DRY)
	_add_button("Inspecionar", ACTION_INSPECT)

	if String(tile_info.get("type", "")) == "door":
		var state: Dictionary = tile_info.get("state", {})
		var is_open := bool(state.get("isOpen", false))
		var door_label := "Fechar porta" if is_open else "Abrir porta"
		_add_divider()
		_add_button(door_label, ACTION_TOGGLE_DOOR)

	var hint := Label.new()
	hint.text = "Esc · clique fora fecha"
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	UiTheme.apply_muted_label(hint)
	hint.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	_vbox.add_child(hint)


func _add_divider() -> void:
	var line := ColorRect.new()
	line.custom_minimum_size = Vector2(0, 1)
	line.color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.22)
	_vbox.add_child(line)


func _add_button(label: String, action_id: String) -> void:
	var btn := Button.new()
	btn.text = label
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = Vector2(0, 30)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.add_theme_font_size_override("font_size", UiTheme.FONT_BODY)
	_style_button(btn)
	btn.pressed.connect(_on_item_pressed.bind(action_id))
	_vbox.add_child(btn)


func _style_button(btn: Button) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = _COL_BTN
	normal.border_color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.22)
	normal.set_border_width_all(UiTheme.PANEL_BORDER_WIDTH)
	normal.set_corner_radius_all(UiTheme.PANEL_CORNER)
	normal.content_margin_left = 10
	normal.content_margin_right = 10
	normal.content_margin_top = 5
	normal.content_margin_bottom = 5

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = _COL_BTN_HOVER
	hover.border_color = Color(UiTheme.PANEL_BORDER_STRONG.r, UiTheme.PANEL_BORDER_STRONG.g, UiTheme.PANEL_BORDER_STRONG.b, 0.45)

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = _COL_BTN_PRESS

	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", normal)
	btn.add_theme_color_override("font_color", UiTheme.TEXT_PRIMARY)
	btn.add_theme_color_override("font_hover_color", UiTheme.TEXT_TITLE)
	btn.add_theme_color_override("font_pressed_color", UiTheme.TEXT_ACCENT)


func _place_panel_deferred() -> void:
	if not _open:
		return
	_place_panel(_pending_pos)
	# Reativa o blocker no frame seguinte (após o clique direito que abriu).
	_blocker.mouse_filter = Control.MOUSE_FILTER_STOP


func _place_panel(screen_pos: Vector2) -> void:
	# Força medição antes de clampar às bordas do viewport.
	_panel.reset_size()
	var sz := _panel.get_combined_minimum_size()
	if _panel.size.x > sz.x:
		sz.x = _panel.size.x
	if _panel.size.y > sz.y:
		sz.y = _panel.size.y
	var vp := get_viewport().get_visible_rect().size
	var margin := float(UiTheme.MARGIN_EDGE)
	var pos := screen_pos + Vector2(4, 4)
	# Se não cabe à direita/baixo do cursor, abre para o outro lado.
	if pos.x + sz.x + margin > vp.x:
		pos.x = screen_pos.x - sz.x - 4.0
	if pos.y + sz.y + margin > vp.y:
		pos.y = screen_pos.y - sz.y - 4.0
	pos.x = clampf(pos.x, margin, maxf(margin, vp.x - sz.x - margin))
	pos.y = clampf(pos.y, margin, maxf(margin, vp.y - sz.y - margin))
	_panel.position = pos
	_panel.reset_size()


func _on_blocker_input(event: InputEvent) -> void:
	if not _open:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and (
			mb.button_index == MOUSE_BUTTON_LEFT
			or mb.button_index == MOUSE_BUTTON_RIGHT
		):
			# Clique fora do painel — o painel tem STOP e engole os seus.
			if not _panel.get_global_rect().has_point(mb.global_position):
				close()
				_blocker.accept_event()


func _on_item_pressed(action_id: String) -> void:
	var cell := _cell
	close()
	if cell.x < 0:
		return
	action_selected.emit(action_id, cell)


func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	if event is InputEventKey:
		var key := event as InputEventKey
		if not key.pressed or key.echo:
			return
		var code: Key = key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
		if code == KEY_ESCAPE:
			close()
			get_viewport().set_input_as_handled()
