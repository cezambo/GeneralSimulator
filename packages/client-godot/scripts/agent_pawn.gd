## Placeholder visual de agente + cone de visão (debug).
## Segue a posição do núcleo com lerp; desenha motion.path do selecionado.
## A suavidade vem de frames frequentes no serve — não de prever o caminho.

class_name AgentPawn
extends Node2D

var agent_id: String = ""
var agent_name: String = ""
var show_vision: bool = true
var vision_angle_deg: float = 120.0
var vision_range_tiles: float = 8.0
var selected: bool = false

var _auth_pos: Vector2 = Vector2.ZERO
var _has_auth: bool = false
var _path_tiles: Array[Vector2] = []
var _face_from_motion: bool = false
var _last_state: Dictionary = {}

@onready var body: Polygon2D = $Body
@onready var label: Label = $Label
@onready var cone: Polygon2D = $VisionCone
@onready var path_line: Line2D = $PathLine


func setup(id: String, display_name: String) -> void:
	agent_id = id
	agent_name = display_name
	if label:
		label.text = display_name
	var h := float(id.hash() % 360) / 360.0
	body.color = Color.from_hsv(h, 0.45, 0.85)
	if path_line:
		path_line.top_level = true
		path_line.width = 2.0
		path_line.default_color = Color(1.0, 0.92, 0.35, 0.75)
		path_line.visible = false


func set_sim_clock(_sim_time: int, _speed: int, _paused: bool) -> void:
	pass


func _process(delta: float) -> void:
	if _has_auth:
		var prev := position
		# Lerp rápido o bastante para acompanhar frames ~10 Hz sem bounce.
		position = position.lerp(_auth_pos, clampf(delta * 14.0, 0.0, 1.0))
		var moved := position - prev
		if _face_from_motion and moved.length_squared() > 0.25:
			rotation_degrees = rad_to_deg(atan2(moved.y, moved.x))
			if label:
				label.rotation = -rotation
		# Snap final: evita tremer no destino.
		if position.distance_to(_auth_pos) < 0.75:
			position = _auth_pos
	if selected:
		_refresh_path_line()


func apply_state(data: Dictionary) -> void:
	_last_state = data.duplicate(true)
	_auth_pos = WorldScale.tile_to_px(data.get("pos", {}))
	if not _has_auth:
		position = _auth_pos
		_has_auth = true

	var vision: Dictionary = data.get("vision", {})
	if not vision.is_empty():
		vision_angle_deg = float(vision.get("angle", vision_angle_deg))
		vision_range_tiles = float(vision.get("range", vision_range_tiles))
	_rebuild_cone()
	cone.visible = show_vision
	_apply_motion(data.get("motion", {}))

	if not _face_from_motion:
		rotation_degrees = float(data.get("rot", 0.0))
		if label:
			label.rotation = -rotation


func describe() -> String:
	var pos: Dictionary = _last_state.get("pos", {})
	var px := float(pos.get("x", 0.0))
	var py := float(pos.get("y", 0.0))
	var rot := float(_last_state.get("rot", rotation_degrees))
	var motion: Dictionary = _last_state.get("motion", {})
	var moving := bool(motion.get("moving", false)) or _path_tiles.size() > 0
	var bits := "%s (%s) · tile (%.1f,%.1f) · rot %d°" % [
		agent_name, agent_id, px, py, int(round(rot))
	]
	if moving:
		bits += " · a caminho"
	var vision: Dictionary = _last_state.get("vision", {})
	if not vision.is_empty():
		bits += " · visão %d°/%.0f" % [
			int(vision.get("angle", vision_angle_deg)),
			float(vision.get("range", vision_range_tiles)),
		]
	return bits


func set_selected(on: bool) -> void:
	selected = on
	modulate = Color(1.35, 1.35, 1.1, 1.0) if on else Color.WHITE
	_refresh_path_line()


func set_vision_debug(on: bool) -> void:
	show_vision = on
	cone.visible = on


func _apply_motion(motion: Variant) -> void:
	_path_tiles.clear()
	_face_from_motion = false
	if typeof(motion) != TYPE_DICTIONARY:
		_refresh_path_line()
		return
	var path: Array = motion.get("path", [])
	for p in path:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		_path_tiles.append(Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0))))
	_face_from_motion = not _path_tiles.is_empty()
	_refresh_path_line()


func _refresh_path_line() -> void:
	if path_line == null:
		return
	if not selected or _path_tiles.is_empty():
		path_line.clear_points()
		path_line.visible = false
		return
	path_line.clear_points()
	path_line.add_point(global_position)
	for t in _path_tiles:
		path_line.add_point(t * WorldScale.PIXELS_PER_TILE)
	path_line.visible = true


func _rebuild_cone() -> void:
	var range_px := vision_range_tiles * WorldScale.PIXELS_PER_TILE
	var half := deg_to_rad(vision_angle_deg) * 0.5
	var pts := PackedVector2Array()
	pts.append(Vector2.ZERO)
	var steps := 12
	for i in range(steps + 1):
		var t := lerpf(-half, half, float(i) / float(steps))
		pts.append(Vector2(cos(t), sin(t)) * range_px)
	cone.polygon = pts
	cone.color = Color(0.4, 0.75, 1.0, 0.18)
