## CoreClient — transporte WebSocket com o sim-core.
## Não decide nada sobre o mundo: só envia e recebe envelopes (05-PROTOCOLO.md).
##
## Estado da ligação (para agentes Cursor, não só HUD):
##   packages/client-godot/.local/core-connection.json
##   packages/client-godot/.local/core-connection.log

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

const STATUS_FILE := "res://.local/core-connection.json"
const LOG_FILE := "res://.local/core-connection.log"

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
var _last_fail_log_ms: int = 0
var _last_reconnect_log_ms: int = 0
var _url: String = ""
var _attempt: int = 0
var _conn_status: String = "disconnected"
var _last_error: String = ""


func _ready() -> void:
	_want_connect = true
	_url = "ws://%s:%d" % [host, port]
	_persist_connection("disconnected", "", "boot", true)
	_try_connect()


func _exit_tree() -> void:
	_persist_connection("disconnected", "client exited", "exit", true)


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
				_last_error = ""
				print_rich("[color=lime][CoreClient] Conectado a %s[/color]" % _url)
				_set_status("conectado")
				_persist_connection("connected", "", "connected", true)
				connected.emit()
			while _socket.get_available_packet_count() > 0:
				var packet := _socket.get_packet()
				_handle_text(packet.get_string_from_utf8())
		WebSocketPeer.STATE_CONNECTING:
			_set_status("conectando a %s…" % _url)
		WebSocketPeer.STATE_CLOSING:
			pass
		WebSocketPeer.STATE_CLOSED:
			var code := _socket.get_close_code()
			var reason := _socket.get_close_reason()
			var detail := "code=%s reason=%s" % [str(code), reason if reason != "" else "(vazio)"]
			if _was_open:
				_was_open = false
				_last_error = detail
				push_warning("CoreClient: DESCONECTADO de %s (%s) — a reconectar…" % [_url, detail])
				print_rich("[color=orange][CoreClient] Núcleo desconectado — a reconectar… (%s)[/color]" % detail)
				_persist_connection("disconnected", detail, "disconnected", true)
				disconnected.emit()
			else:
				_log_connect_fail("fechado sem handshake (%s)" % detail)
			_socket = null
			_set_status("fechado (%s) — a reconectar…" % detail)
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
	_attempt += 1
	_socket = WebSocketPeer.new()
	# Sem query string: alguns builds do Godot falham o handshake com "?…".
	_url = "ws://%s:%d" % [host, port]
	# JSON a cada tentativa; log de reconnect no máximo ~a cada 3s.
	var now := Time.get_ticks_msec()
	var log_reconnect := _last_reconnect_log_ms == 0 or now - _last_reconnect_log_ms >= 3000
	if log_reconnect:
		_last_reconnect_log_ms = now
	_persist_connection("connecting", _last_error, "reconnect_attempt", log_reconnect)
	var err := _socket.connect_to_url(_url)
	if err != OK:
		_log_connect_fail("erro local %s" % error_string(err))
		_set_status("erro %s em %s — a reconectar…" % [error_string(err), _url])
		_socket = null
		_reconnect_left = reconnect_seconds
	else:
		_set_status("conectando a %s…" % _url)


func _log_connect_fail(detail: String) -> void:
	_last_error = detail
	# Evita spam no Output / log a cada segundo durante retries.
	var now := Time.get_ticks_msec()
	if now - _last_fail_log_ms < 3000 and _last_fail_log_ms != 0:
		# Status JSON ainda atualiza (última tentativa / erro).
		_write_status_json("disconnected")
		return
	_last_fail_log_ms = now
	push_warning("CoreClient: sem núcleo em %s — %s (a tentar de novo…)" % [_url, detail])
	print_rich("[color=salmon][CoreClient] Núcleo indisponível — a reconectar… (%s)[/color]" % detail)
	_persist_connection("disconnected", detail, "error", true)


func _set_status(text: String) -> void:
	if text == _last_status:
		return
	_last_status = text
	status_changed.emit(text)


func _persist_connection(status: String, error: String, event: String, write_log: bool) -> void:
	_conn_status = status
	if error != "":
		_last_error = error
	_write_status_json(status)
	if write_log:
		_append_connection_log(event, status, error)


func _write_status_json(status: String) -> void:
	var abs_path := ProjectSettings.globalize_path(STATUS_FILE)
	_ensure_local_dir(abs_path)
	var payload := {
		"status": status,
		"url": _url,
		"lastError": _last_error,
		"lastChangeAt": _iso_now(),
		"attempt": _attempt,
		"pid": OS.get_process_id(),
	}
	var f := FileAccess.open(abs_path, FileAccess.WRITE)
	if f == null:
		push_warning("CoreClient: não escreveu status em %s (%s)" % [abs_path, error_string(FileAccess.get_open_error())])
		return
	f.store_string(JSON.stringify(payload))
	f.close()


func _append_connection_log(event: String, status: String, error: String) -> void:
	var abs_path := ProjectSettings.globalize_path(LOG_FILE)
	_ensure_local_dir(abs_path)
	var line := JSON.stringify({
		"at": _iso_now(),
		"event": event,
		"status": status,
		"url": _url,
		"attempt": _attempt,
		"lastError": error if error != "" else _last_error,
		"pid": OS.get_process_id(),
	})
	var f := FileAccess.open(abs_path, FileAccess.READ_WRITE)
	if f == null:
		f = FileAccess.open(abs_path, FileAccess.WRITE)
	if f == null:
		push_warning("CoreClient: não escreveu log em %s (%s)" % [abs_path, error_string(FileAccess.get_open_error())])
		return
	f.seek_end()
	f.store_line(line)
	f.close()


func _ensure_local_dir(abs_file: String) -> void:
	var dir_path := abs_file.get_base_dir()
	if DirAccess.dir_exists_absolute(dir_path):
		return
	var err := DirAccess.make_dir_recursive_absolute(dir_path)
	if err != OK:
		push_warning("CoreClient: não criou %s (%s)" % [dir_path, error_string(err)])


func _iso_now() -> String:
	return Time.get_datetime_string_from_system(true) + "Z"


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
