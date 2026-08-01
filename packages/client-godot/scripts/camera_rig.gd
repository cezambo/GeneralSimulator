## Câmera top-down: pan (WASD / setas / arrastar botão do meio) e zoom na roda.

class_name CameraRig
extends Camera2D

@export var pan_speed: float = 420.0
@export var zoom_min: float = 0.35
@export var zoom_max: float = 2.5
@export var zoom_step: float = 0.08

var _dragging: bool = false
var _drag_last: Vector2 = Vector2.ZERO
var _bounds: Rect2 = Rect2()


func _ready() -> void:
	make_current()
	zoom = Vector2(1.1, 1.1)


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_action_pressed("cam_pan_up"):
		dir.y -= 1.0
	if Input.is_action_pressed("cam_pan_down"):
		dir.y += 1.0
	if Input.is_action_pressed("cam_pan_left"):
		dir.x -= 1.0
	if Input.is_action_pressed("cam_pan_right"):
		dir.x += 1.0
	if dir != Vector2.ZERO:
		position += dir.normalized() * pan_speed * delta / zoom.x
		_clamp_to_bounds()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_MIDDLE:
			_dragging = mb.pressed
			_drag_last = mb.position
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_zoom(zoom.x + zoom_step)
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_zoom(zoom.x - zoom_step)
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		var delta_px := mm.position - _drag_last
		_drag_last = mm.position
		position -= delta_px / zoom.x
		_clamp_to_bounds()


func focus_world_center(size_px: Vector2) -> void:
	position = size_px * 0.5
	_clamp_to_bounds()


func set_bounds(size_px: Vector2) -> void:
	_bounds = Rect2(Vector2.ZERO, size_px)
	_clamp_to_bounds()


func _clamp_to_bounds() -> void:
	if _bounds.size == Vector2.ZERO:
		return
	position.x = clampf(position.x, _bounds.position.x, _bounds.end.x)
	position.y = clampf(position.y, _bounds.position.y, _bounds.end.y)


func _set_zoom(value: float) -> void:
	var z := clampf(value, zoom_min, zoom_max)
	zoom = Vector2(z, z)
