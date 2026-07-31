## Placeholder visual de agente + cone de visão (debug).

class_name AgentPawn
extends Node2D

var agent_id: String = ""
var agent_name: String = ""
var show_vision: bool = true
var vision_angle_deg: float = 120.0
var vision_range_tiles: float = 8.0

@onready var body: Polygon2D = $Body
@onready var label: Label = $Label
@onready var cone: Polygon2D = $VisionCone


func setup(id: String, display_name: String) -> void:
	agent_id = id
	agent_name = display_name
	if label:
		label.text = display_name
	# Cor estável por id.
	var h := float(id.hash() % 360) / 360.0
	body.color = Color.from_hsv(h, 0.45, 0.85)


func apply_state(data: Dictionary) -> void:
	position = WorldScale.tile_to_px(data.get("pos", {}))
	# Núcleo: graus; Godot: o cone e o corpo giram juntos.
	rotation_degrees = float(data.get("rot", 0.0))
	if label:
		label.rotation = -rotation
	var vision: Dictionary = data.get("vision", {})
	if not vision.is_empty():
		vision_angle_deg = float(vision.get("angle", vision_angle_deg))
		vision_range_tiles = float(vision.get("range", vision_range_tiles))
	_rebuild_cone()
	cone.visible = show_vision


func set_vision_debug(on: bool) -> void:
	show_vision = on
	cone.visible = on


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
