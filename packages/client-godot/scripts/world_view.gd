## Desenha tiles e objetos a partir do snapshot. Sem lógica de simulação.

class_name WorldView
extends Node2D

@onready var tiles_root: Node2D = $Tiles
@onready var objects_root: Node2D = $Objects

var _grid_w: int = 0
var _grid_h: int = 0


func apply_snapshot(payload: Dictionary) -> void:
	_clear_children(tiles_root)
	_clear_children(objects_root)
	_grid_w = int(payload.get("width", 0))
	_grid_h = int(payload.get("height", 0))

	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var cell: Dictionary = t
		var x := int(cell.get("x", 0))
		var y := int(cell.get("y", 0))
		var tile_type := String(cell.get("type", "floor"))
		var state: Dictionary = cell.get("state", {})
		var burning := false
		# Overlay futuro: estados no snapshot. Por ora só isOpen de porta.
		var poly := Polygon2D.new()
		var s := WorldScale.PIXELS_PER_TILE
		poly.polygon = PackedVector2Array([Vector2(0, 0), Vector2(s, 0), Vector2(s, s), Vector2(0, s)])
		poly.position = WorldScale.cell_to_px(x, y)
		poly.color = WorldScale.tile_color(tile_type, burning)
		tiles_root.add_child(poly)
		if tile_type == "door" and bool(state.get("isOpen", false)):
			poly.color = WorldScale.tile_color("door").lightened(0.25)

	var objects: Array = payload.get("objects", [])
	for o in objects:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		var obj: Dictionary = o
		var marker := Polygon2D.new()
		marker.polygon = PackedVector2Array([
			Vector2(-10, -10), Vector2(10, -10), Vector2(10, 10), Vector2(-10, 10)
		])
		marker.color = Color("c4a35a")
		marker.position = WorldScale.tile_to_px(obj.get("pos", {}))
		objects_root.add_child(marker)


func apply_delta(payload: Dictionary) -> void:
	# V1: delta de tiles/objetos pode reaplicar snapshot parcial depois.
	# Por agora o núcleo manda snapshot em mudanças de modo; ignore delta fino.
	pass


func world_size_px() -> Vector2:
	return Vector2(float(_grid_w), float(_grid_h)) * WorldScale.PIXELS_PER_TILE


func _clear_children(node: Node) -> void:
	for c in node.get_children():
		c.queue_free()
