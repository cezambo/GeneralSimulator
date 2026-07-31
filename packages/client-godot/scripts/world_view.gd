## Desenha tiles e objetos a partir do snapshot. Sem lógica de simulação.

class_name WorldView
extends Node2D

@onready var tiles_root: Node2D = $Tiles
@onready var objects_root: Node2D = $Objects

var _grid_w: int = 0
var _grid_h: int = 0
var _tile_nodes: Dictionary = {} # "x,y" -> Polygon2D


func apply_snapshot(payload: Dictionary) -> void:
	_clear_children(tiles_root)
	_clear_children(objects_root)
	_tile_nodes.clear()
	_grid_w = int(payload.get("width", 0))
	_grid_h = int(payload.get("height", 0))

	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		_upsert_tile(t)

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
	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		_upsert_tile(t)


func world_size_px() -> Vector2:
	return Vector2(float(_grid_w), float(_grid_h)) * WorldScale.PIXELS_PER_TILE


func _upsert_tile(cell: Dictionary) -> void:
	var x := int(cell.get("x", 0))
	var y := int(cell.get("y", 0))
	var key := "%d,%d" % [x, y]
	var tile_type := String(cell.get("type", "floor"))
	var material_id := String(cell.get("materialId", ""))
	var state: Dictionary = cell.get("state", {})
	var states: Array = cell.get("states", [])
	var burning := _has_state(states, "burning")
	var smoky := _has_state(states, "smoky")

	var poly: Polygon2D
	if _tile_nodes.has(key):
		poly = _tile_nodes[key]
	else:
		poly = Polygon2D.new()
		var s := WorldScale.PIXELS_PER_TILE
		poly.polygon = PackedVector2Array([Vector2(0, 0), Vector2(s, 0), Vector2(s, s), Vector2(0, s)])
		poly.position = WorldScale.cell_to_px(x, y)
		tiles_root.add_child(poly)
		_tile_nodes[key] = poly

	poly.color = WorldScale.tile_color(tile_type, burning)
	if material_id == "cinza" or material_id == "carvao" or material_id == "lascas":
		poly.color = Color("3a3a3a") if material_id == "cinza" else Color("2a2420")
	if smoky and not burning:
		poly.color = poly.color.darkened(0.15)
	if tile_type == "door" and bool(state.get("isOpen", false)) and not burning:
		poly.color = WorldScale.tile_color("door").lightened(0.25)


func _has_state(states: Array, type_name: String) -> bool:
	for s in states:
		if typeof(s) == TYPE_DICTIONARY and String(s.get("type", "")) == type_name:
			if float(s.get("intensity", 0)) > 0.0:
				return true
	return false


func _clear_children(node: Node) -> void:
	for c in node.get_children():
		c.queue_free()
