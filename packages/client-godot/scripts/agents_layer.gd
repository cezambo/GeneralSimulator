## Camada de agentes: cria/atualiza placeholders a partir do protocolo.

class_name AgentsLayer
extends Node2D

const AgentPawnScene := preload("res://scenes/agent_pawn.tscn")

var _pawns: Dictionary = {} # id -> AgentPawn
var vision_debug: bool = true


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


func set_vision_debug(on: bool) -> void:
	vision_debug = on
	for id in _pawns:
		(_pawns[id] as AgentPawn).set_vision_debug(on)


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


func _prune(seen: Dictionary) -> void:
	var to_remove: Array = []
	for id in _pawns.keys():
		if not seen.has(id):
			to_remove.append(id)
	for id in to_remove:
		(_pawns[id] as Node).queue_free()
		_pawns.erase(id)
