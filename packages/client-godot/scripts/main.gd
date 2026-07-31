## Cena raiz: liga CoreClient → WorldView / Agents / HUD / Camera.
## Cliente fino: zero pathfinding, zero validação de mundo.

extends Node

@onready var core: CoreClient = $CoreClient
@onready var world_view: WorldView = $World/WorldView
@onready var agents: AgentsLayer = $World/Agents
@onready var camera: CameraRig = $World/CameraRig
@onready var hud: Hud = $Hud


func _ready() -> void:
	core.connected.connect(_on_connected)
	core.disconnected.connect(_on_disconnected)
	core.snapshot_received.connect(_on_snapshot)
	core.agents_updated.connect(_on_agents)
	core.clock_updated.connect(_on_clock)
	core.delta_received.connect(_on_delta)
	core.protocol_error.connect(_on_error)
	hud.speed_requested.connect(_on_speed)
	hud.vision_toggled.connect(_on_vision)


func _on_connected() -> void:
	hud.set_connected(true)


func _on_disconnected() -> void:
	hud.set_connected(false)


func _on_snapshot(payload: Dictionary) -> void:
	world_view.apply_snapshot(payload)
	agents.apply_snapshot(payload)
	camera.focus_world_center(world_view.world_size_px())
	if payload.has("clock"):
		hud.apply_clock(payload["clock"])


func _on_agents(payload: Dictionary) -> void:
	agents.apply_agents_update(payload)


func _on_clock(payload: Dictionary) -> void:
	hud.apply_clock(payload)


func _on_delta(payload: Dictionary) -> void:
	world_view.apply_delta(payload)


func _on_error(payload: Dictionary) -> void:
	push_warning("Protocolo: %s — %s" % [payload.get("code", "?"), payload.get("message", "")])


func _on_speed(speed: int) -> void:
	core.set_speed(speed)


func _on_vision(on: bool) -> void:
	agents.set_vision_debug(on)
