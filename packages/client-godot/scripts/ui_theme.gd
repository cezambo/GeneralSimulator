## Shared UI colors / type sizes for menus (Construction, pause, help overlays).
## Pure style helper — no scene ownership. Hud / Construction panel / pause should
## call UiTheme instead of hardcoding panel colors or font sizes.
##
## Usage (class_name — no Autoload needed, same pattern as WorldScale):
##   panel.add_theme_stylebox_override("panel", UiTheme.make_panel_style())
##   label.add_theme_font_size_override("font_size", UiTheme.FONT_BODY)
##   label.add_theme_color_override("font_color", UiTheme.TEXT_PRIMARY)
##   UiTheme.apply_body_label(label)
##   status.modulate = UiTheme.STATUS_OK

class_name UiTheme
extends RefCounted

# --- Surfaces ---------------------------------------------------------------

const PANEL_BG := Color(0.07, 0.08, 0.09, 0.9)
const PANEL_BG_SOLID := Color(0.07, 0.08, 0.09, 1.0)
const PANEL_BORDER := Color(0.85, 0.85, 0.8, 0.35)
const PANEL_BORDER_STRONG := Color(0.9, 0.88, 0.72, 0.55)
## Full-screen dim when paused (draw as ColorRect behind menu).
const PAUSE_SCRIM := Color(0.04, 0.05, 0.06, 0.55)
## Construction mode panel tint / accent edge.
const CONSTRUCTION_ACCENT := Color(1.0, 0.85, 0.22, 1.0)
const CONSTRUCTION_PANEL_BG := Color(0.1, 0.09, 0.06, 0.92)
const CONSTRUCTION_PANEL_BORDER := Color(1.0, 0.9, 0.35, 0.45)

# --- Text -------------------------------------------------------------------

const TEXT_PRIMARY := Color(0.9, 0.9, 0.84, 1.0)
const TEXT_MUTED := Color(0.85, 0.85, 0.8, 0.85)
const TEXT_TITLE := Color(0.96, 0.94, 0.86, 1.0)
const TEXT_ACCENT := Color(0.95, 0.9, 0.7, 1.0)
const TEXT_INFO := Color(0.75, 0.88, 0.95, 1.0)
const TEXT_OUTLINE := Color(0, 0, 0, 1)

const STATUS_OK := Color("8fbc8f")
const STATUS_WARN := Color("f4a261")
const STATUS_ERROR := Color("e07a5f")
const STATUS_PAUSED := Color("e9c46a")

# --- Type scale -------------------------------------------------------------

const FONT_TITLE := 18
const FONT_STATUS := 16
const FONT_CLOCK := 14
const FONT_SELECT := 13
const FONT_BODY := 12
const FONT_CAPTION := 11

const OUTLINE_BODY := 2
const OUTLINE_STRONG := 4

# --- Layout clearances (menus should respect these) -------------------------

const MARGIN_EDGE := 16
const MARGIN_PANEL_H := 12
const MARGIN_PANEL_V := 10
const PANEL_CORNER := 4
const PANEL_BORDER_WIDTH := 1
## Vertical offset below the top HUD strip before floating panels.
const HUD_STACK_CLEARANCE := 148


static func make_panel_style(construction: bool = false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	if construction:
		style.bg_color = CONSTRUCTION_PANEL_BG
		style.border_color = CONSTRUCTION_PANEL_BORDER
	else:
		style.bg_color = PANEL_BG
		style.border_color = PANEL_BORDER
	style.set_border_width_all(PANEL_BORDER_WIDTH)
	style.set_corner_radius_all(PANEL_CORNER)
	style.content_margin_left = MARGIN_PANEL_H
	style.content_margin_top = MARGIN_PANEL_V
	style.content_margin_right = MARGIN_PANEL_H + 2
	style.content_margin_bottom = MARGIN_PANEL_V
	return style


static func apply_panel(panel: PanelContainer, construction: bool = false) -> void:
	panel.add_theme_stylebox_override("panel", make_panel_style(construction))


static func apply_title_label(label: Label) -> void:
	label.add_theme_font_size_override("font_size", FONT_TITLE)
	label.add_theme_color_override("font_color", TEXT_TITLE)
	label.add_theme_color_override("font_outline_color", TEXT_OUTLINE)
	label.add_theme_constant_override("outline_size", OUTLINE_STRONG)


static func apply_body_label(label: Label) -> void:
	label.add_theme_font_size_override("font_size", FONT_BODY)
	label.add_theme_color_override("font_color", TEXT_PRIMARY)
	label.add_theme_color_override("font_outline_color", TEXT_OUTLINE)
	label.add_theme_constant_override("outline_size", OUTLINE_BODY)


static func apply_muted_label(label: Label) -> void:
	label.add_theme_font_size_override("font_size", FONT_BODY)
	label.add_theme_color_override("font_color", TEXT_MUTED)
	label.add_theme_color_override("font_outline_color", TEXT_OUTLINE)
	label.add_theme_constant_override("outline_size", OUTLINE_BODY)


static func apply_accent_label(label: Label) -> void:
	label.add_theme_font_size_override("font_size", FONT_SELECT)
	label.add_theme_color_override("font_color", TEXT_ACCENT)
	label.add_theme_color_override("font_outline_color", TEXT_OUTLINE)
	label.add_theme_constant_override("outline_size", OUTLINE_BODY + 1)


## Soften a control when the sim is paused (menus stay readable).
static func modulate_paused(active: bool) -> Color:
	return Color(1.0, 0.96, 0.85, 1.0) if active else Color.WHITE


static func status_color(connected: bool, retrying: bool = false) -> Color:
	if connected:
		return STATUS_OK
	if retrying:
		return STATUS_WARN
	return STATUS_ERROR
