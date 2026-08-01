## Camada de agentes: cria/atualiza placeholders a partir do protocolo.

class_name AgentsLayer
extends Node2D

const AgentPawnScene := preload("res://scenes/agent_pawn.tscn")

var _pawns: Dictionary = {} # id -> AgentPawn
var vision_debug: bool = true
var selected_id: String = ""


func apply_snapshot(payload: Dictionary) -> void:
	var seen: Dictionary = {}
	var agents: Array = payload.get("agents", [])
	for a in agents:
		if typeof(a) != TYPE_DICTIONARY:
			continue
		_upsert(a)
		seen[String(a.get("id", ""))] = true
	_prune(seen)


func apply_agents_update(payload: Dictionary) -> void:
	var agents: Array = payload.get("agents", [])
	for a in agents:
		if typeof(a) != TYPE_DICTIONARY:
			continue
		_upsert(a)


func apply_clock(payload: Dictionary) -> void:
	var sim_time := int(payload.get("simTime", 0))
	var speed := int(payload.get("speed", 0))
	var paused := bool(payload.get("paused", false))
	for id in _pawns:
		(_pawns[id] as AgentPawn).set_sim_clock(sim_time, speed, paused)


func set_vision_debug(on: bool) -> void:
	vision_debug = on
	for id in _pawns:
		(_pawns[id] as AgentPawn).set_vision_debug(on)


func pick_nearest(world_pos: Vector2, max_dist: float = 36.0) -> AgentPawn:
	var best: AgentPawn = null
	var best_d := max_dist
	for id in _pawns:
		var pawn := _pawns[id] as AgentPawn
		var d := pawn.global_position.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = pawn
	return best


func set_selected(agent_id: String) -> void:
	selected_id = agent_id
	for id in _pawns:
		(_pawns[id] as AgentPawn).set_selected(id == agent_id)


func get_selected_id() -> String:
	return selected_id


func get_pawn(agent_id: String) -> AgentPawn:
	if agent_id == "" or not _pawns.has(agent_id):
		return null
	return _pawns[agent_id] as AgentPawn


func _upsert(data: Dictionary) -> void:
	var id := String(data.get("id", ""))
	if id == "":
		return
	var pawn: AgentPawn
	if _pawns.has(id):
		pawn = _pawns[id]
	else:
		pawn = AgentPawnScene.instantiate() as AgentPawn
		add_child(pawn)
		pawn.setup(id, String(data.get("name", id)))
		_pawns[id] = pawn
	pawn.set_vision_debug(vision_debug)
	pawn.apply_state(data)
	pawn.set_selected(id == selected_id)


func _prune(seen: Dictionary) -> void:
	var to_remove: Array = []
	for id in _pawns.keys():
		if not seen.has(id):
			to_remove.append(id)
	for id in to_remove:
		(_pawns[id] as Node).queue_free()
		_pawns.erase(id)
	if selected_id != "" and not _pawns.has(selected_id):
		selected_id = ""
