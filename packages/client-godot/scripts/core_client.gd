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

@export var host: String = "127.0.0.1"
@export var port: int = 8787
@export var auto_reconnect: bool = true
@export var reconnect_seconds: float = 2.0

var _socket := WebSocketPeer.new()
var _seq: int = 0
var _last_sim_time: float = 0.0
var _was_open: bool = false
var _reconnect_left: float = 0.0
var _want_connect: bool = true


func _ready() -> void:
	_want_connect = true
	_try_connect()


func _process(delta: float) -> void:
	_socket.poll()
	var state := _socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not _was_open:
			_was_open = true
			connected.emit()
		while _socket.get_available_packet_count() > 0:
			var packet := _socket.get_packet()
			_handle_text(packet.get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSING:
		pass
	elif state == WebSocketPeer.STATE_CLOSED:
		if _was_open:
			_was_open = false
			disconnected.emit()
		if _want_connect and auto_reconnect:
			_reconnect_left -= delta
			if _reconnect_left <= 0.0:
				_reconnect_left = reconnect_seconds
				_try_connect()


func is_core_connected() -> bool:
	return _socket.get_ready_state() == WebSocketPeer.STATE_OPEN


func set_speed(speed: int) -> void:
	send_command("cmd.sim.setSpeed", {"speed": speed})


func set_mode(mode: String) -> void:
	send_command("cmd.sim.setMode", {"mode": mode})


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


func _try_connect() -> void:
	var url := "ws://%s:%d?role=godot" % [host, port]
	var err := _socket.connect_to_url(url)
	if err != OK:
		push_warning("CoreClient: falha ao conectar em %s (%s)" % [url, error_string(err)])
		_reconnect_left = reconnect_seconds


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
			# Tipos só do painel (event.llm etc.) são ignorados de propósito.
			pass
