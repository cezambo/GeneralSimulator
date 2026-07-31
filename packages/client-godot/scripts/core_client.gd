## CoreClient — transporte WebSocket com o sim-core.
## Não decide nada sobre o mundo: só envia e recebe envelopes (05-PROTOCOLO.md).

class_name CoreClient
extends Node

signal connected
signal disconnected
signal snapshot_received(payload: Dictionary)
signal agents_updated(payload: Dictionary)
signal clock_updated(payload: Dictionary)
signal delta_received(payload: Dictionary)
signal protocol_error(payload: Dictionary)
signal status_changed(text: String)

@export var host: String = "127.0.0.1"
@export var port: int = 8787
@export var auto_reconnect: bool = true
@export var reconnect_seconds: float = 1.0

var _socket: WebSocketPeer
var _seq: int = 0
var _last_sim_time: float = 0.0
var _was_open: bool = false
var _reconnect_left: float = 0.0
var _want_connect: bool = true
var _last_status: String = ""


func _ready() -> void:
	_want_connect = true
	_try_connect()


func _process(delta: float) -> void:
	if _socket == null:
		_schedule_reconnect(delta)
		return

	_socket.poll()
	var state := _socket.get_ready_state()

	match state:
		WebSocketPeer.STATE_OPEN:
			if not _was_open:
				_was_open = true
				_set_status("conectado")
				connected.emit()
			while _socket.get_available_packet_count() > 0:
				var packet := _socket.get_packet()
				_handle_text(packet.get_string_from_utf8())
		WebSocketPeer.STATE_CONNECTING:
			_set_status("conectando…")
		WebSocketPeer.STATE_CLOSING:
			pass
		WebSocketPeer.STATE_CLOSED:
			var code := _socket.get_close_code()
			var reason := _socket.get_close_reason()
			if _was_open:
				_was_open = false
				disconnected.emit()
			_socket = null
			_set_status("fechado (%s %s) — reconectando…" % [str(code), reason])
			_reconnect_left = 0.0
			_schedule_reconnect(delta)


func is_core_connected() -> bool:
	return _socket != null and _socket.get_ready_state() == WebSocketPeer.STATE_OPEN


func set_speed(speed: int) -> void:
	send_command("cmd.sim.setSpeed", {"speed": speed})


func set_mode(mode: String) -> void:
	send_command("cmd.sim.setMode", {"mode": mode})


func move_agent(agent_id: String, x: int, y: int) -> void:
	send_command("cmd.agent.move", {"agentId": agent_id, "x": x, "y": y})


func paint_tiles(tile_type: String, material_id: String, cells: Array) -> void:
	send_command("cmd.build.paintTile", {
		"tileType": tile_type,
		"materialId": material_id,
		"cells": cells,
	})


func remove_tiles(cells: Array) -> void:
	# Mesmo efeito que pintar chão — caminho idêntico ao paint (mais confiável no cliente).
	paint_tiles("floor", "pinho", cells)


func remove_object_at(x: int, y: int) -> void:
	send_command("cmd.build.remove", {"target": "object", "cells": [{"x": x, "y": y}]})


func place_object(def_id: String, x: int, y: int, rotation: float = 0.0) -> void:
	send_command("cmd.build.placeObject", {
		"objectDefId": def_id,
		"pos": {"x": x, "y": y},
		"rotation": rotation,
	})


func move_object_at(from_x: int, from_y: int, to_x: int, to_y: int) -> void:
	send_command("cmd.build.moveObject", {
		"cells": [{"x": from_x, "y": from_y}],
		"pos": {"x": to_x, "y": to_y},
	})


func rotate_object_at(x: int, y: int, degrees: float = 90.0) -> void:
	send_command("cmd.build.rotate", {
		"cells": [{"x": x, "y": y}],
		"degrees": degrees,
		"delta": true,
	})


func undo_build() -> void:
	send_command("cmd.build.undo", {})


func redo_build() -> void:
	send_command("cmd.build.redo", {})


func apply_tool(effect: String, cells: Array) -> void:
	send_command("cmd.tool.apply", {"effect": effect, "cells": cells})


func toggle_door(x: int, y: int) -> void:
	send_command("cmd.world.toggleDoor", {"x": x, "y": y})


func save_slot(slot: String = "demo") -> void:
	send_command("cmd.sim.save", {"slot": slot})


func load_slot(slot: String = "demo") -> void:
	send_command("cmd.sim.load", {"slot": slot})


func send_command(type: String, payload: Dictionary, req_id: String = "") -> void:
	if not is_core_connected():
		return
	_seq += 1
	var env: Dictionary = {
		"v": 1,
		"type": type,
		"seq": _seq,
		"simTime": _last_sim_time,
		"payload": payload,
	}
	if req_id != "":
		env["reqId"] = req_id
	_socket.send_text(JSON.stringify(env))


func _schedule_reconnect(delta: float) -> void:
	if not _want_connect or not auto_reconnect:
		return
	_reconnect_left -= delta
	if _reconnect_left <= 0.0:
		_reconnect_left = reconnect_seconds
		_try_connect()


func _try_connect() -> void:
	# Godot 4: depois de CLOSED o peer não serve de novo — precisa de instância nova.
	_socket = WebSocketPeer.new()
	# Sem query string: alguns builds do Godot falham o handshake com "?…".
	var url := "ws://%s:%d" % [host, port]
	var err := _socket.connect_to_url(url)
	if err != OK:
		push_warning("CoreClient: falha ao conectar em %s (%s)" % [url, error_string(err)])
		_set_status("erro %s em %s" % [error_string(err), url])
		_socket = null
		_reconnect_left = reconnect_seconds
	else:
		_set_status("conectando a %s…" % url)


func _set_status(text: String) -> void:
	if text == _last_status:
		return
	_last_status = text
	status_changed.emit(text)


func _handle_text(text: String) -> void:
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("CoreClient: mensagem não-objeto ignorada")
		return
	var env: Dictionary = data
	if int(env.get("v", -1)) != 1:
		protocol_error.emit({"code": "VERSION_MISMATCH", "message": "v incompatível"})
		return
	_last_sim_time = float(env.get("simTime", _last_sim_time))
	var type := String(env.get("type", ""))
	var payload: Dictionary = env.get("payload", {})
	match type:
		"world.snapshot":
			snapshot_received.emit(payload)
		"world.delta":
			delta_received.emit(payload)
		"agents.update":
			agents_updated.emit(payload)
		"clock.update":
			clock_updated.emit(payload)
		"res.error":
			protocol_error.emit(payload)
		_:
			pass
