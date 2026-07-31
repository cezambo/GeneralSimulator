## Converte coordenadas do núcleo (tiles contínuos) em pixels do cliente.
## O núcleo é autoridade; aqui só há escala de desenho.

class_name WorldScale
extends RefCounted

const PIXELS_PER_TILE := 48.0


static func tile_to_px(pos: Dictionary) -> Vector2:
	return Vector2(float(pos.get("x", 0.0)), float(pos.get("y", 0.0))) * PIXELS_PER_TILE


static func cell_to_px(x: int, y: int) -> Vector2:
	return Vector2(float(x), float(y)) * PIXELS_PER_TILE


static func px_to_cell(px: Vector2) -> Vector2i:
	return Vector2i(int(floor(px.x / PIXELS_PER_TILE)), int(floor(px.y / PIXELS_PER_TILE)))


static func tile_color(tile_type: String, burning: bool = false, material_id: String = "") -> Color:
	if material_id == "cinza":
		return Color("5a5a5a")
	if material_id == "carvao" or material_id == "lascas":
		return Color("2b2118")

	var c: Color
	match tile_type:
		"wall":
			c = Color("3d4650")
		"floor":
			c = Color("c4a574")
		"door":
			c = Color("8a5a3a")
		"water":
			c = Color("3a6ea5")
		"road":
			c = Color("6a6e72")
		"roof":
			c = Color("7a5c4a")
		_:
			c = Color("4a5560")
	if burning:
		# Chama bem óbvia — não um tint suave.
		return Color("ff5a00")
	return c
