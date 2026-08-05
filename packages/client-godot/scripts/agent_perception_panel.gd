## Painel lateral: o que o agente selecionado “vê” (PT-BR).
## Consome um Dictionary no formato de res.agent.detail (+ perception opcional).
## Só UI — Main/Hud pedem o detalhe e montam o payload.
## Layout: cabeçalho fixo + ScrollContainer (texto longo envolve / rola, não sai do ecrã).

class_name AgentPerceptionPanel
extends PanelContainer

signal closed

const _REFRESH_HINT := "Atualiza ao selecionar e enquanto o agente está activo"
const _PANEL_WIDTH := 320.0

var _agent_id: String = ""
var _loading: bool = false

var _title_label: Label
var _who_name: Label
var _who_id: Label
var _vision_meta: Label
var _vision_list: Label
var _ambient_fire: Label
var _ambient_smoke: Label
var _ambient_wet: Label
var _ambient_heat: Label
var _ambient_doors: Label
var _status_label: Label
var _close_btn: Button
var _scroll: ScrollContainer
var _body: VBoxContainer


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	custom_minimum_size = Vector2(_PANEL_WIDTH, 120)
	_apply_panel_style()
	_build_ui()
	visible = false


func show_for(agent_id: String, display_name: String = "") -> void:
	_agent_id = agent_id
	_loading = true
	visible = true
	_who_name.text = display_name if display_name != "" else agent_id
	_who_id.text = agent_id
	_vision_meta.text = "A carregar visão…"
	_vision_list.text = "A pedir o que está no cone…"
	_clear_ambient_loading()
	_status_label.text = "A carregar percepção…"
	_status_label.modulate = UiTheme.TEXT_INFO


func hide_panel() -> void:
	visible = false
	_agent_id = ""
	_loading = false


func is_open() -> bool:
	return visible and _agent_id != ""


func current_agent_id() -> String:
	return _agent_id


## Aplica payload montado pelo Main a partir de res.agent.perception / detail.
## Preferido (núcleo):
## {
##   id, name,
##   vision: { angle, range },
##   perception: {
##     report, included[], notable[], visible: { tiles, agents, objects },
##     # fallback local: inCone[], ambient{}
##   }
## }
func apply_detail(data: Dictionary) -> void:
	if data.is_empty():
		_apply_empty("Sem dados do núcleo")
		return

	var id := String(data.get("id", data.get("agentId", _agent_id)))
	if id != "" and _agent_id != "" and id != _agent_id:
		# Resposta atrasada de outro agente — ignora.
		return
	if id != "":
		_agent_id = id

	_loading = false
	var name := String(data.get("name", ""))
	_who_name.text = name if name != "" else (_agent_id if _agent_id != "" else "—")
	_who_id.text = _agent_id if _agent_id != "" else "—"

	var perception: Dictionary = {}
	var perc_raw: Variant = data.get("perception", {})
	if typeof(perc_raw) == TYPE_DICTIONARY:
		perception = perc_raw
	# Aceita também o payload cru de res.agent.perception no topo.
	elif data.has("included") or data.has("notable") or data.has("report"):
		perception = data

	var vision: Dictionary = {}
	var vis_raw: Variant = data.get("vision", {})
	if typeof(vis_raw) == TYPE_DICTIONARY and not (vis_raw as Dictionary).is_empty():
		vision = vis_raw
	elif perception.has("vision") and typeof(perception["vision"]) == TYPE_DICTIONARY:
		vision = perception["vision"]

	_apply_vision(vision, perception)
	_apply_cone_list(perception)
	_apply_ambient_from_perception(perception)

	var has_core := (
		not String(perception.get("report", "")).is_empty()
		or not (perception.get("included", []) as Array).is_empty()
		or not (perception.get("notable", []) as Array).is_empty()
		or perception.has("visible")
	)
	if perception.is_empty() and vision.is_empty():
		_status_label.text = "Percepção ainda não disponível — a esperar o núcleo"
		_status_label.modulate = UiTheme.TEXT_MUTED
	elif has_core:
		_status_label.text = "Do núcleo · " + _REFRESH_HINT
		_status_label.modulate = UiTheme.TEXT_MUTED
	else:
		_status_label.text = "Estimativa local · " + _REFRESH_HINT
		_status_label.modulate = UiTheme.TEXT_MUTED


func set_loading(on: bool = true) -> void:
	_loading = on
	if on:
		_status_label.text = "A actualizar…"
		_status_label.modulate = UiTheme.TEXT_INFO


## Hud chama após medir o viewport: largura/altura fixas para caber no ecrã.
## Altura limitada → o ScrollContainer rola em vez de o painel crescer para fora.
func apply_viewport_bounds(max_width: float, max_height: float) -> void:
	var w := clampf(max_width, 240.0, 420.0)
	var h := maxf(160.0, max_height)
	if _body != null:
		_body.custom_minimum_size = Vector2(maxf(200.0, w - 40.0), 0)
	# Min = size: PanelContainer livre sob CanvasLayer não cresce com o conteúdo.
	custom_minimum_size = Vector2(w, h)
	size = Vector2(w, h)


func _apply_empty(reason: String) -> void:
	_loading = false
	_vision_meta.text = "—"
	_vision_list.text = "Nada no cone por agora."
	_set_ambient_group(_ambient_fire, "Fogo", [])
	_set_ambient_group(_ambient_smoke, "Fumo", [])
	_set_ambient_group(_ambient_wet, "Molhado", [])
	_set_ambient_group(_ambient_heat, "Calor", [])
	_set_ambient_group(_ambient_doors, "Portas", [])
	_status_label.text = reason
	_status_label.modulate = UiTheme.TEXT_MUTED


func _apply_vision(vision: Dictionary, perception: Variant) -> void:
	var angle := float(vision.get("angle", 0.0))
	var range_tiles := float(vision.get("range", 0.0))
	if angle <= 0.0 and range_tiles <= 0.0:
		_vision_meta.text = "Ângulo e alcance ainda não chegaram"
		return
	var parts: PackedStringArray = []
	if angle > 0.0:
		parts.append("%d° de abertura" % int(round(angle)))
	if range_tiles > 0.0:
		parts.append("alcance %.0f tiles" % range_tiles)
	_vision_meta.text = " · ".join(parts)

	# Relato de prosa do núcleo, se existir — envolve no painel (scroll).
	if typeof(perception) == TYPE_DICTIONARY:
		var report := String(perception.get("report", "")).strip_edges()
		if report != "":
			_vision_meta.text += "\n" + report


func _apply_cone_list(perception: Dictionary) -> void:
	var lines: PackedStringArray = []
	var tiles := 0
	var objects := 0
	var agents_n := 0
	var other := 0

	# 1) Preferir fatos incluídos no relato (res.agent.perception.included).
	var included: Array = perception.get("included", [])
	if not included.is_empty():
		for item in included:
			if typeof(item) != TYPE_DICTIONARY:
				var s := str(item).strip_edges()
				if s != "":
					other += 1
					lines.append("· %s" % s)
				continue
			var d: Dictionary = item
			var text := String(d.get("text", "")).strip_edges()
			if text == "":
				continue
			var kind := String(d.get("subjectKind", d.get("kind", d.get("type", ""))))
			match kind:
				"tile", "célula", "cell":
					tiles += 1
					lines.append("· tile — %s" % text)
				"object", "objeto", "obj":
					objects += 1
					lines.append("· objeto — %s" % text)
				"agent", "agente":
					agents_n += 1
					lines.append("· agente — %s" % text)
				_:
					other += 1
					if kind != "":
						lines.append("· %s — %s" % [kind, text])
					else:
						lines.append("· %s" % text)
	else:
		# 2) visible estruturado do núcleo.
		var visible_raw: Variant = perception.get("visible", {})
		if typeof(visible_raw) == TYPE_DICTIONARY:
			var vis: Dictionary = visible_raw
			for t in vis.get("tiles", []):
				if typeof(t) != TYPE_DICTIONARY:
					continue
				var td: Dictionary = t
				var look := String(td.get("look", "")).strip_edges()
				if look == "":
					look = "%s/%s (%d,%d)" % [
						String(td.get("type", "?")),
						String(td.get("materialId", "?")),
						int(td.get("x", 0)),
						int(td.get("y", 0)),
					]
				tiles += 1
				lines.append("· tile — %s" % look)
			for a in vis.get("agents", []):
				if typeof(a) != TYPE_DICTIONARY:
					continue
				var ad: Dictionary = a
				var aname := String(ad.get("name", ad.get("id", "?")))
				agents_n += 1
				lines.append("· agente — %s" % aname)
			for o in vis.get("objects", []):
				if typeof(o) != TYPE_DICTIONARY:
					continue
				var od: Dictionary = o
				objects += 1
				lines.append("· objeto — %s" % String(od.get("defId", od.get("id", "?"))))

		# 3) Fallback local (inCone).
		if lines.is_empty():
			var items: Array = perception.get("inCone", [])
			if items.is_empty():
				items = perception.get("in_cone", [])
			for item in items:
				var kind := ""
				var text := ""
				if typeof(item) == TYPE_DICTIONARY:
					kind = String(item.get("kind", item.get("type", "")))
					text = String(item.get("text", item.get("label", ""))).strip_edges()
				else:
					text = str(item).strip_edges()
				if text == "":
					continue
				match kind:
					"tile", "célula", "cell":
						tiles += 1
						lines.append("· tile — %s" % text)
					"object", "objeto", "obj":
						objects += 1
						lines.append("· objeto — %s" % text)
					"agent", "agente":
						agents_n += 1
						lines.append("· agente — %s" % text)
					_:
						other += 1
						if kind != "":
							lines.append("· %s — %s" % [kind, text])
						else:
							lines.append("· %s" % text)

	if lines.is_empty():
		_vision_list.text = "Nada distinto no cone." if not _loading else "A pedir o que está no cone…"
		return

	var summary_bits: PackedStringArray = []
	if tiles > 0:
		summary_bits.append("%d tile%s" % [tiles, "s" if tiles != 1 else ""])
	if objects > 0:
		summary_bits.append("%d objeto%s" % [objects, "s" if objects != 1 else ""])
	if agents_n > 0:
		summary_bits.append("%d agente%s" % [agents_n, "s" if agents_n != 1 else ""])
	if other > 0:
		summary_bits.append("%d outro%s" % [other, "s" if other != 1 else ""])

	var head := "No cone:"
	if not summary_bits.is_empty():
		head = "No cone: " + ", ".join(summary_bits)
	# Com scroll, pode mostrar mais linhas; ainda limita prosa extrema.
	var max_lines := 40
	var body_lines: PackedStringArray = []
	var limit := mini(lines.size(), max_lines)
	for i in range(limit):
		body_lines.append(lines[i])
	var body := "\n".join(body_lines)
	if lines.size() > max_lines:
		body += "\n… e mais %d" % (lines.size() - max_lines)
	_vision_list.text = "%s\n%s" % [head, body]


func _apply_ambient_from_perception(perception: Dictionary) -> void:
	# Preferir notable[] do núcleo; senão ambient{} local.
	var notable: Array = perception.get("notable", [])
	if not notable.is_empty():
		var fire_items: PackedStringArray = []
		var smoke_items: PackedStringArray = []
		var wet_items: PackedStringArray = []
		var heat_items: PackedStringArray = []
		var door_items: PackedStringArray = []
		for n in notable:
			if typeof(n) != TYPE_DICTIONARY:
				continue
			var nd: Dictionary = n
			var kind := String(nd.get("kind", ""))
			var where := "(%d,%d)" % [int(nd.get("x", 0)), int(nd.get("y", 0))]
			match kind:
				"burning", "fire", "on_fire":
					var bi := float(nd.get("intensity", 0))
					if bi > 0.0:
						fire_items.append("%s (intens. %.0f)" % [where, bi])
					else:
						fire_items.append(where)
				"smoky", "smoke":
					var si := float(nd.get("intensity", 0))
					if si > 0.0:
						smoke_items.append("%s (intens. %.0f)" % [where, si])
					else:
						smoke_items.append(where)
				"wet":
					var wi := float(nd.get("intensity", 0))
					if wi > 0.0:
						wet_items.append("%s (intens. %.0f)" % [where, wi])
					else:
						wet_items.append(where)
				"hot":
					var temp := float(nd.get("temperature", 0))
					if temp > 0.0:
						heat_items.append("%s (%.0f°C)" % [where, temp])
					else:
						heat_items.append(where)
				"door":
					var open := bool(nd.get("isOpen", false))
					door_items.append("%s %s" % [where, "aberta" if open else "fechada"])
				_:
					pass
		_set_ambient_group(_ambient_fire, "Fogo", fire_items)
		_set_ambient_group(_ambient_smoke, "Fumo", smoke_items)
		_set_ambient_group(_ambient_wet, "Molhado", wet_items)
		_set_ambient_group(_ambient_heat, "Calor", heat_items)
		_set_ambient_group(_ambient_doors, "Portas", door_items)
		return

	_apply_ambient(perception.get("ambient", {}))


func _apply_ambient(ambient: Variant) -> void:
	if typeof(ambient) != TYPE_DICTIONARY or (ambient as Dictionary).is_empty():
		_set_ambient_group(_ambient_fire, "Fogo", [])
		_set_ambient_group(_ambient_smoke, "Fumo", [])
		_set_ambient_group(_ambient_wet, "Molhado", [])
		_set_ambient_group(_ambient_heat, "Calor", [])
		_set_ambient_group(_ambient_doors, "Portas", [])
		return
	var a: Dictionary = ambient
	_set_ambient_group(_ambient_fire, "Fogo", _as_string_list(a.get("fire", a.get("fogo", []))))
	_set_ambient_group(_ambient_smoke, "Fumo", _as_string_list(a.get("smoke", a.get("fumo", a.get("smoky", [])))))
	_set_ambient_group(_ambient_wet, "Molhado", _as_string_list(a.get("wet", a.get("molhado", []))))
	_set_ambient_group(_ambient_heat, "Calor", _as_string_list(a.get("heat", a.get("calor", []))))
	_set_ambient_group(_ambient_doors, "Portas", _as_string_list(a.get("doors", a.get("portas", []))))


func _clear_ambient_loading() -> void:
	_ambient_fire.text = "Fogo — a observar…"
	_ambient_smoke.text = "Fumo — a observar…"
	_ambient_wet.text = "Molhado — a observar…"
	_ambient_heat.text = "Calor — a observar…"
	_ambient_doors.text = "Portas — a observar…"
	for lab in [_ambient_fire, _ambient_smoke, _ambient_wet, _ambient_heat, _ambient_doors]:
		lab.modulate = UiTheme.TEXT_MUTED


func _set_ambient_group(label: Label, title: String, items: PackedStringArray) -> void:
	if items.is_empty():
		label.text = "%s — nenhum por perto" % title
		label.modulate = UiTheme.TEXT_MUTED
		return
	label.text = "%s — %s" % [title, "; ".join(items)]
	label.modulate = UiTheme.TEXT_PRIMARY


func _as_string_list(raw: Variant) -> PackedStringArray:
	var out: PackedStringArray = []
	if typeof(raw) != TYPE_ARRAY:
		if typeof(raw) == TYPE_STRING and String(raw) != "":
			out.append(String(raw))
		return out
	for item in raw:
		if typeof(item) == TYPE_DICTIONARY:
			var t := String(item.get("text", item.get("label", ""))).strip_edges()
			if t != "":
				out.append(t)
		else:
			var s := str(item).strip_edges()
			if s != "":
				out.append(s)
	return out


func _apply_panel_style() -> void:
	var style := UiTheme.make_panel_style()
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_top = 12
	style.content_margin_right = 14
	style.content_margin_bottom = 12
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 6
	style.shadow_offset = Vector2(0, 2)
	# Acento frio (visão), distinto do amarelo de construção.
	style.border_color = Color(UiTheme.TEXT_INFO.r, UiTheme.TEXT_INFO.g, UiTheme.TEXT_INFO.b, 0.4)
	add_theme_stylebox_override("panel", style)


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(root)

	root.add_child(_make_header())
	root.add_child(_make_divider())

	_scroll = ScrollContainer.new()
	_scroll.name = "Scroll"
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_scroll.clip_contents = true
	root.add_child(_scroll)

	_body = VBoxContainer.new()
	_body.name = "Body"
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	# Largura mínima para labels com autowrap medirem dentro do scroll.
	_body.custom_minimum_size = Vector2(_PANEL_WIDTH - 36.0, 0)
	_scroll.add_child(_body)

	_body.add_child(_make_section_title("Quem"))
	_who_name = _make_body_label("—")
	_who_name.add_theme_font_size_override("font_size", UiTheme.FONT_SELECT)
	_who_name.add_theme_color_override("font_color", UiTheme.TEXT_TITLE)
	_body.add_child(_who_name)
	_who_id = _make_caption_label("—")
	_body.add_child(_who_id)

	_body.add_child(_make_divider())
	_body.add_child(_make_section_title("Visão"))
	_vision_meta = _make_body_label("—")
	_vision_meta.add_theme_color_override("font_color", UiTheme.TEXT_INFO)
	_body.add_child(_vision_meta)
	_vision_list = _make_body_label("—")
	_body.add_child(_vision_list)

	_body.add_child(_make_divider())
	_body.add_child(_make_section_title("Ambiente imediato"))
	_body.add_child(_make_hint("Fogo · fumo · molhado · calor · portas"))
	_ambient_fire = _make_body_label("Fogo — —")
	_ambient_smoke = _make_body_label("Fumo — —")
	_ambient_wet = _make_body_label("Molhado — —")
	_ambient_heat = _make_body_label("Calor — —")
	_ambient_doors = _make_body_label("Portas — —")
	for lab in [_ambient_fire, _ambient_smoke, _ambient_wet, _ambient_heat, _ambient_doors]:
		_body.add_child(lab)

	_body.add_child(_make_divider())
	_status_label = Label.new()
	_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status_label.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	_status_label.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.text = _REFRESH_HINT
	_body.add_child(_status_label)


func _make_header() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_title_label = Label.new()
	_title_label.text = "Percepção"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	UiTheme.apply_title_label(_title_label)
	_title_label.add_theme_font_size_override("font_size", 15)
	row.add_child(_title_label)

	_close_btn = Button.new()
	_close_btn.focus_mode = Control.FOCUS_NONE
	_close_btn.text = "Fechar"
	_close_btn.custom_minimum_size = Vector2(72, 0)
	_close_btn.add_theme_font_size_override("font_size", UiTheme.FONT_BODY)
	_style_close_button(_close_btn)
	_close_btn.pressed.connect(func() -> void:
		hide_panel()
		closed.emit()
	)
	row.add_child(_close_btn)
	return row


func _style_close_button(btn: Button) -> void:
	var normal := StyleBoxFlat.new()
	normal.set_corner_radius_all(UiTheme.PANEL_CORNER)
	normal.set_border_width_all(UiTheme.PANEL_BORDER_WIDTH)
	normal.content_margin_left = 8
	normal.content_margin_right = 8
	normal.content_margin_top = 5
	normal.content_margin_bottom = 5
	normal.bg_color = Color(0.14, 0.16, 0.17, 1)
	normal.border_color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.22)

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.2, 0.23, 0.24, 1)

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.18, 0.22, 0.26, 1)

	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", normal)
	btn.add_theme_color_override("font_color", UiTheme.TEXT_PRIMARY)
	btn.add_theme_color_override("font_hover_color", UiTheme.TEXT_TITLE)
	btn.add_theme_color_override("font_pressed_color", UiTheme.TEXT_INFO)


func _make_section_title(text: String) -> Label:
	var lab := Label.new()
	lab.text = text.to_upper()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	lab.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	lab.add_theme_color_override("font_outline_color", UiTheme.TEXT_OUTLINE)
	lab.add_theme_constant_override("outline_size", UiTheme.OUTLINE_BODY)
	return lab


func _make_hint(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", 10)
	lab.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return lab


func _make_body_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	UiTheme.apply_body_label(lab)
	return lab


func _make_caption_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_font_size_override("font_size", UiTheme.FONT_CAPTION)
	lab.add_theme_color_override("font_color", UiTheme.TEXT_MUTED)
	lab.add_theme_color_override("font_outline_color", UiTheme.TEXT_OUTLINE)
	lab.add_theme_constant_override("outline_size", UiTheme.OUTLINE_BODY)
	return lab


func _make_divider() -> ColorRect:
	var line := ColorRect.new()
	line.custom_minimum_size = Vector2(0, 1)
	line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.color = Color(UiTheme.PANEL_BORDER.r, UiTheme.PANEL_BORDER.g, UiTheme.PANEL_BORDER.b, 0.18)
	return line
