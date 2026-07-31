## Converte coordenadas do núcleo (tiles contínuos) em pixels do cliente.
## O núcleo é autoridade; aqui só há escala de desenho.

class_name WorldScale
extends RefCounted

const PIXELS_PER_TILE := 48.0


static func tile_to_px(pos: Dictionary) -> Vector2:
	return Vector2(float(pos.get("x", 0.0)), float(pos.get("y", 0.0))) * PIXELS_PER_TILE


static func cell_to_px(x: int, y: int) -> Vector2:
	return Vector2(float(x), float(y)) * PIXELS_PER_TILE


static func tile_color(tile_type: String, burning: bool = false) -> Color:
	var c: Color
	match tile_type:
		"wall":
			c = Color("2c333a")
		"floor":
			c = Color("8b7355")
		"door":
			c = Color("5c4033")
		"water":
			c = Color("3a6ea5")
		"road":
			c = Color("6a6e72")
		"roof":
			c = Color("7a5c4a")
		_:
			c = Color("4a5560")
	if burning:
		c = c.lerp(Color("e85d04"), 0.55)
	return c
