## Painel de construção: seções Materiais / Estruturas / Mobília (PT-BR).
## Só UI — o Hud traduz cliques em ferramentas e sinais existentes.

class_name ConstructionPanel
extends PanelContainer

signal material_selected(material_id: String)
signal structure_selected(tool_id: String)
signal furniture_selected(def_id: String)
signal furniture_tool_selected(tool_id: String)
signal rotate_requested
signal undo_requested
signal redo_requested
signal exit_requested

## Cores de botão (ainda locais — UiTheme cobre painel/texto).
const _COL_BTN := Color(0.14, 0.16, 0.17, 1)
const _COL_BTN_HOVER := Color(0.2, 0.23, 0.24, 1)
const _COL_BTN_ON := Color(0.32, 0.38, 0.3, 1)
const _COL_BTN_ON_BORDER := Color(0.85, 0.78, 0.45, 0.85)

var _material: String = "pedra"
var _tool: String = "wall"
var _furniture_def: String = "cadeira_madeira"

var _mat_buttons: Dictionary = {} # material_id → Button
var _struct_buttons: Dictionary = {} # tool_id → Button
var _furn_item_buttons: Dictionary = {} # def_id → Button
var _furn_tool_buttons: Dictionary = {} # tool_id → Button
var _status_label: Label


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_apply_panel_style()
	_build_ui()
	visible = false
	_refresh_selection()


func show_panel(on: bool) -> void:
	visible = on
	if on:
		_refresh_selection()


func sync_state(tool_id: String, material_id: String, furniture_def: String) -> void:
	_tool = tool_id
	_material = material_id
	_furniture_def = furniture_def
	_refresh_selection()


func _apply_panel_style() -> void:
	var style := UiTheme.make_panel_style(true)
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_top = 12
	style.content_margin_right = 14
	style.content_margin_bottom = 12
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 6
	style.shadow_offset = Vector2(0, 2)
	add_theme_stylebox_override("panel", style)


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	root.add_child(_make_header())
	root.add_child(_make_divider())

	root.add_child(_make_section_title("Materiais"))
	root.add_child(_make_hint("Define o material da parede / janela"))
	var mats := HBoxContainer.new()
	mats.add_theme_constant_override("separation", 6)
	_mat_buttons["pedra"] = _make_tool_button("Pedra", "B", func() -> void:
		material_selected.emit("pedra")
	)
	_mat_buttons["pinho"] = _make_tool_button("Pinho", "N", func() -> void:
		material_selected.emit("pinho")
	)
	mats.add_child(_mat_buttons["pedra"])
	mats.add_child(_mat_buttons["pinho"])
	root.add_child(mats)

	root.add_child(_make_divider())
	root.add_child(_make_section_title("Estruturas"))
	root.add_child(_make_hint("Clique no mapa para pintar · Dir. apaga tile"))
	var structs := GridContainer.new()
	structs.columns = 2
	structs.add_theme_constant_override("h_separation", 6)
	structs.add_theme_constant_override("v_separation", 6)
	_struct_buttons["wall"] = _make_tool_button("Parede", "", func() -> void:
		structure_selected.emit("wall")
	)
	_struct_buttons["door"] = _make_tool_button("Porta", "R", func() -> void:
		structure_selected.emit("door")
	)
	_struct_buttons["window"] = _make_tool_button("Janela", "", func() -> void:
		structure_selected.emit("window")
	)
	_struct_buttons["floor"] = _make_tool_button("Chão", "F", func() -> void:
		structure_selected.emit("floor")
	)
	_struct_buttons["erase"] = _make_tool_button("Remover", "E", func() -> void:
		structure_selected.emit("erase")
	)
	for id in ["wall", "door", "window", "floor", "erase"]:
		structs.add_child(_struct_buttons[id])
	root.add_child(structs)

	root.add_child(_make_divider())
	root.add_child(_make_section_title("Mobília"))
	var furn_items := HBoxContainer.new()
	furn_items.add_theme_constant_override("separation", 6)
	_furn_item_buttons["cadeira_madeira"] = _make_tool_button("Cadeira", "T", func() -> void:
		furniture_selected.emit("cadeira_madeira")
	)
	_furn_item_buttons["mesa_madeira"] = _make_tool_button("Mesa", "", func() -> void:
		furniture_selected.emit("mesa_madeira")
	)
	_furn_item_buttons["cama_palha"] = _make_tool_button("Cama", "", func() -> void:
		furniture_selected.emit("cama_palha")
	)
	for id in ["cadeira_madeira", "mesa_madeira", "cama_palha"]:
		furn_items.add_child(_furn_item_buttons[id])
	root.add_child(furn_items)

	var furn_ops := HBoxContainer.new()
	furn_ops.add_theme_constant_override("separation", 6)
	_furn_tool_buttons["move_furniture"] = _make_tool_button("Mover", "M", func() -> void:
		furniture_tool_selected.emit("move_furniture")
	)
	var rotate_btn := _make_tool_button("Girar", ".", func() -> void:
		rotate_requested.emit()
	)
	_furn_tool_buttons["del_object"] = _make_tool_button("Tirar", "X", func() -> void:
		furniture_tool_selected.emit("del_object")
	)
	furn_ops.add_child(_furn_tool_buttons["move_furniture"])
	furn_ops.add_child(rotate_btn)
	furn_ops.add_child(_furn_tool_buttons["del_object"])
	root.add_child(furn_ops)

	root.add_child(_make_divider())
	var hist := HBoxContainer.new()
	hist.add_theme_constant_override("separation", 6)
	hist.add_child(_make_tool_button("Desfazer", "Z", func() -> void:
		undo_requested.emit()
	))
	hist.add_child(_make_tool_button("Refazer", "Y", func() -> void:
		redo_requested.emit()
	))
	root.add_child(hist)

	_status_label = Label.new()
	_status_label.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	_status_label.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status_label)


func _make_header() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var title := Label.new()
	title.text = "Construção"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	UiTheme.apply_title_label(title)
	title.add_theme_font_size_override("font_size", 15)
	row.add_child(title)

	var exit_btn := _make_tool_button("Sair", "C", func() -> void:
		exit_requested.emit()
	)
	exit_btn.custom_minimum_size = Vector2(72, 0)
	row.add_child(exit_btn)
	return row


func _make_section_title(text: String) -> Label:
	var lab := Label.new()
	lab.text = text.to_upper()
	lab.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	lab.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	lab.add_theme_color_override("font_outline_color", UiTheme.TEXT_OUTLINE)
	lab.add_theme_constant_override("outline_size", UiTheme.OUTLINE_BODY)
	return lab


func _make_hint(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 10)
	lab.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return lab


func _make_divider() -> ColorRect:
	var line := ColorRect.new()
	line.custom_minimum_size = Vector2(0, 1)
	line.color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.18)
	return line


func _make_tool_button(label: String, key: String, on_press: Callable) -> Button:
	var btn := Button.new()
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = Vector2(96, 32)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if key != "":
		btn.text = "%s  ·  %s" % [label, key]
	else:
		btn.text = label
	btn.add_theme_font_size_override("font_size", UiTheme.FONT_BODY)
	_style_button(btn, false)
	btn.pressed.connect(on_press)
	return btn


func _style_button(btn: Button, selected: bool) -> void:
	var normal := StyleBoxFlat.new()
	normal.set_corner_radius_all(UiTheme.PANEL_CORNER)
	normal.set_border_width_all(UiTheme.PANEL_BORDER_WIDTH)
	normal.content_margin_left = 8
	normal.content_margin_right = 8
	normal.content_margin_top = 5
	normal.content_margin_bottom = 5
	if selected:
		normal.bg_color = _COL_BTN_ON
		normal.border_color = _COL_BTN_ON_BORDER
	else:
		normal.bg_color = _COL_BTN
		normal.border_color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.22)

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = _COL_BTN_ON if selected else _COL_BTN_HOVER

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = _COL_BTN_ON

	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", normal)
	btn.add_theme_color_override("font_color", UiTheme.TEXT_TITLE if selected else Color(0.88, 0.88, 0.82, 1))
	btn.add_theme_color_override("font_hover_color", UiTheme.TEXT_TITLE)
	btn.add_theme_color_override("font_pressed_color", UiTheme.TEXT_ACCENT)


func _refresh_selection() -> void:
	for mat_id in _mat_buttons:
		_style_button(_mat_buttons[mat_id], mat_id == _material)

	var struct_active := _tool
	if _tool == "wall_wood":
		struct_active = "wall"
	for sid in _struct_buttons:
		_style_button(_struct_buttons[sid], sid == struct_active)

	var furn_mode := _tool == "furniture"
	for def_id in _furn_item_buttons:
		_style_button(_furn_item_buttons[def_id], furn_mode and def_id == _furniture_def)

	for tid in _furn_tool_buttons:
		_style_button(_furn_tool_buttons[tid], tid == _tool)

	if _status_label:
		_status_label.text = _status_text()


func _status_text() -> String:
	var mat := "pedra" if _material == "pedra" else "pinho"
	match _tool:
		"wall", "wall_wood":
			return "Ativo: parede (%s) — arraste para pintar" % mat
		"door":
			return "Ativo: porta (pinho) — clique no mapa"
		"window":
			return "Ativo: janela (%s) — clique no mapa" % mat
		"floor":
			return "Ativo: chão (pinho) — arraste para pintar"
		"erase":
			return "Ativo: remover tile → chão"
		"furniture":
			return "Ativo: %s — um clique por peça" % _furniture_name(_furniture_def)
		"move_furniture":
			return "Ativo: mover — origem → destino"
		"del_object":
			return "Ativo: remover móvel na célula"
		_:
			return "Ativo: %s" % _tool


func _furniture_name(def_id: String) -> String:
	match def_id:
		"cadeira_madeira":
			return "cadeira"
		"mesa_madeira":
			return "mesa"
		"cama_palha":
			return "cama"
		_:
			return def_id
