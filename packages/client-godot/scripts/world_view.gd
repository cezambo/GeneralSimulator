## Desenha tiles e objetos a partir do snapshot. Sem lógica de simulação.

class_name WorldView
extends Node2D

@onready var tiles_root: Node2D = $Tiles
@onready var objects_root: Node2D = $Objects

var _grid_w: int = 0
var _grid_h: int = 0
var _tile_nodes: Dictionary = {} # "x,y" -> Polygon2D
var _fire_nodes: Dictionary = {} # "x,y" -> Polygon2D (brilho)
var _object_nodes: Dictionary = {} # id -> Polygon2D
var _construction: bool = false
var _hover_cell: Vector2i = Vector2i(-1, -1)
var _tile_data: Dictionary = {} # "x,y" -> Dictionary


func apply_snapshot(payload: Dictionary) -> void:
	_clear_children(tiles_root)
	_clear_children(objects_root)
	_tile_nodes.clear()
	_fire_nodes.clear()
	_object_nodes.clear()
	_tile_data.clear()
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
		_upsert_object(o)
	queue_redraw()


func apply_delta(payload: Dictionary) -> void:
	var tiles: Array = payload.get("tiles", [])
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		_upsert_tile(t)
	var upsert: Array = payload.get("objectsUpsert", [])
	for o in upsert:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		_upsert_object(o)
	var remove: Array = payload.get("objectsRemove", [])
	for id_v in remove:
		var id := String(id_v)
		if _object_nodes.has(id):
			(_object_nodes[id] as Node).queue_free()
			_object_nodes.erase(id)


func world_size_px() -> Vector2:
	return Vector2(float(_grid_w), float(_grid_h)) * WorldScale.PIXELS_PER_TILE


func set_construction_overlay(on: bool) -> void:
	_construction = on
	if not on:
		_hover_cell = Vector2i(-1, -1)
	queue_redraw()


func set_hover_cell(cell: Vector2i) -> void:
	if cell == _hover_cell:
		return
	_hover_cell = cell
	queue_redraw()


func in_bounds_cell(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < _grid_w and cell.y < _grid_h


func tile_info_at(cell: Vector2i) -> Dictionary:
	if not in_bounds_cell(cell):
		return {}
	var key := "%d,%d" % [cell.x, cell.y]
	return _tile_data.get(key, {}) as Dictionary


func describe_tile(cell: Vector2i) -> String:
	var t := tile_info_at(cell)
	if t.is_empty():
		if in_bounds_cell(cell):
			return "(%d,%d) — sem dados" % [cell.x, cell.y]
		return "fora do mapa"
	var tile_type := String(t.get("type", "?"))
	var material_id := String(t.get("materialId", "?"))
	var parts: PackedStringArray = ["(%d,%d) %s · %s" % [cell.x, cell.y, tile_type, material_id]]
	if t.has("integrity"):
		parts.append("int %d" % int(t.get("integrity", 100)))
	var states: Array = t.get("states", [])
	var state_bits: PackedStringArray = []
	for s in states:
		if typeof(s) != TYPE_DICTIONARY:
			continue
		var st := String(s.get("type", ""))
		var inten := int(s.get("intensity", 0))
		if st != "" and inten > 0:
			state_bits.append("%s:%d" % [st, inten])
	if state_bits.size() > 0:
		parts.append(" · ".join(state_bits))
	return " · ".join(parts)


func _draw() -> void:
	if _grid_w <= 0:
		return
	var s := WorldScale.PIXELS_PER_TILE
	if _construction:
		var grid_color := Color(1, 1, 1, 0.18)
		for x in range(_grid_w + 1):
			var px := float(x) * s
			draw_line(Vector2(px, 0), Vector2(px, float(_grid_h) * s), grid_color, 1.0)
		for y in range(_grid_h + 1):
			var py := float(y) * s
			draw_line(Vector2(0, py), Vector2(float(_grid_w) * s, py), grid_color, 1.0)
	if in_bounds_cell(_hover_cell):
		var r := Rect2(Vector2(_hover_cell) * s, Vector2(s, s))
		var fill := Color(1.0, 0.85, 0.2, 0.22) if _construction else Color(0.7, 0.85, 1.0, 0.14)
		var edge := Color(1.0, 0.9, 0.3, 0.7) if _construction else Color(0.75, 0.9, 1.0, 0.55)
		draw_rect(r, fill, true)
		draw_rect(r, edge, false, 2.0)


func _upsert_object(obj: Dictionary) -> void:
	var id := String(obj.get("id", ""))
	if id == "":
		return
	var def_id := String(obj.get("defId", ""))
	var marker: Polygon2D
	if _object_nodes.has(id):
		marker = _object_nodes[id]
	else:
		marker = Polygon2D.new()
		objects_root.add_child(marker)
		_object_nodes[id] = marker
	var half := 10.0
	if def_id.contains("mesa") or def_id.contains("cama"):
		half = 16.0
	marker.polygon = PackedVector2Array([
		Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)
	])
	var h := float(def_id.hash() % 360) / 360.0
	marker.color = Color.from_hsv(h, 0.35, 0.85)
	marker.position = WorldScale.tile_to_px(obj.get("pos", {}))
	marker.rotation_degrees = float(obj.get("rotation", 0.0))


func _upsert_tile(cell: Dictionary) -> void:
	var x := int(cell.get("x", 0))
	var y := int(cell.get("y", 0))
	var key := "%d,%d" % [x, y]
	_tile_data[key] = cell.duplicate(true)
	var tile_type := String(cell.get("type", "floor"))
	var material_id := String(cell.get("materialId", ""))
	var state: Dictionary = cell.get("state", {})
	var states: Array = cell.get("states", [])
	var burning := _has_state(states, "burning")
	var smoky := _has_state(states, "smoky")
	var wet := _has_state(states, "wet")

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

	poly.color = WorldScale.tile_color(tile_type, burning, material_id)
	if wet and not burning:
		poly.color = poly.color.lerp(Color("3a6ea5"), 0.55)
	if smoky and not burning:
		poly.color = poly.color.darkened(0.2)
	if tile_type == "door" and bool(state.get("isOpen", false)) and not burning:
		poly.color = WorldScale.tile_color("door", false, material_id).lightened(0.2)
		if wet:
			poly.color = poly.color.lerp(Color("3a6ea5"), 0.4)
	if cell.has("integrity") and not burning:
		var integ := clampf(float(cell.get("integrity", 100.0)) / 100.0, 0.0, 1.0)
		poly.color = poly.color.darkened((1.0 - integ) * 0.55)

	_set_fire_glow(key, x, y, burning)


func _set_fire_glow(key: String, x: int, y: int, burning: bool) -> void:
	if burning:
		var glow: Polygon2D
		if _fire_nodes.has(key):
			glow = _fire_nodes[key]
		else:
			glow = Polygon2D.new()
			var s := WorldScale.PIXELS_PER_TILE
			var m := 10.0
			glow.polygon = PackedVector2Array([
				Vector2(m, m), Vector2(s - m, m), Vector2(s - m, s - m), Vector2(m, s - m)
			])
			glow.position = WorldScale.cell_to_px(x, y)
			glow.z_index = 1
			tiles_root.add_child(glow)
			_fire_nodes[key] = glow
		glow.color = Color(1.0, 0.92, 0.2, 0.85)
		glow.visible = true
	elif _fire_nodes.has(key):
		(_fire_nodes[key] as Polygon2D).visible = false


func _has_state(states: Array, type_name: String) -> bool:
	for s in states:
		if typeof(s) == TYPE_DICTIONARY and String(s.get("type", "")) == type_name:
			if float(s.get("intensity", 0)) > 0.0:
				return true
	return false


func _clear_children(node: Node) -> void:
	for c in node.get_children():
		c.queue_free()
