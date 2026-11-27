class_name RoadNetwork
extends RefCounted

enum RoadType {
	TWO_LANE = 0,
	FOUR_LANE = 1,
	SIX_LANE_HIGHWAY = 2
}

const ROAD_SPECS := {
	RoadType.TWO_LANE: {
		"name": "2차선 도시 도로", "asphalt_w": 8.0, "sidewalk_w": 3.2,
		"lanes": 2, "speed": 14.0, "capacity": 16.0, "cost_10m": 70, "upkeep_10m": 2, "sidewalks": true
	},
	RoadType.FOUR_LANE: {
		"name": "4차선 가로수 대로", "asphalt_w": 14.5, "sidewalk_w": 4.0,
		"lanes": 4, "speed": 20.0, "capacity": 34.0, "cost_10m": 180, "upkeep_10m": 5, "sidewalks": true
	},
	RoadType.SIX_LANE_HIGHWAY: {
		"name": "6차선 고속도로", "asphalt_w": 20.0, "sidewalk_w": 1.4,
		"lanes": 6, "speed": 31.0, "capacity": 65.0, "cost_10m": 320, "upkeep_10m": 9, "sidewalks": false
	}
}

var nodes: Dictionary = {}      # int -> Dictionary
var segments: Dictionary = {}   # int -> Dictionary
var _next_node_id: int = 1
var _next_seg_id: int = 1

func clear() -> void:
	nodes.clear()
	segments.clear()
	_next_node_id = 1
	_next_seg_id = 1

func find_nearest_node(pos: Vector3, snap_radius: float) -> Dictionary:
	var best: Dictionary = {}
	var best_sq: float = snap_radius * snap_radius
	for n in nodes.values():
		var p: Vector3 = n["pos"]
		var dx: float = p.x - pos.x
		var dz: float = p.z - pos.z
		var dsq: float = dx * dx + dz * dz
		if dsq <= best_sq:
			best_sq = dsq
			best = n
	return best

func get_or_create_node(pos: Vector3, snap_radius: float = 12.0, is_hw_conn: bool = false) -> Dictionary:
	var existing := find_nearest_node(pos, snap_radius)
	if not existing.is_empty():
		if is_hw_conn:
			existing["hw_conn"] = true
		return existing
	var node := {
		"id": _next_node_id,
		"pos": pos,
		"hw_conn": is_hw_conn,
		"segments": [] as Array[int]
	}
	nodes[_next_node_id] = node
	_next_node_id += 1
	return node

func add_segment(start_pos: Vector3, end_pos: Vector3, road_type: int, curve_mid = null, snap_radius: float = 12.0) -> Dictionary:
	var n_start := get_or_create_node(start_pos, snap_radius)
	var n_end := get_or_create_node(end_pos, snap_radius)
	if n_start["id"] == n_end["id"]:
		return {}

	for sid in n_start["segments"]:
		if segments.has(sid):
			var ex: Dictionary = segments[sid]
			if (ex["start_id"] == n_start["id"] and ex["end_id"] == n_end["id"]) or \
			   (ex["start_id"] == n_end["id"] and ex["end_id"] == n_start["id"]):
				ex["type"] = road_type
				return ex

	var p0: Vector3 = n_start["pos"]
	var p3: Vector3 = n_end["pos"]
	var p1: Vector3
	var p2: Vector3

	if curve_mid != null and curve_mid is Vector3:
		var m: Vector3 = curve_mid
		p1 = p0 + (m - p0) * (2.0 / 3.0)
		p2 = p3 + (m - p3) * (2.0 / 3.0)
	else:
		p1 = p0.lerp(p3, 1.0 / 3.0)
		p2 = p0.lerp(p3, 2.0 / 3.0)

	# Auto-detect river crossings and arch the bridge deck gracefully above water!
	var crosses_water := false
	for i in range(1, 12):
		var t: float = float(i) / 12.0
		var sp: Vector3 = eval_cubic(p0, p1, p2, p3, t)
		if TerrainField.sample_height(sp.x, sp.z) < TerrainField.WATER_LEVEL + 0.6:
			crosses_water = true
			break

	if crosses_water:
		var peak_y: float = maxf(maxf(p0.y, p3.y), TerrainField.WATER_LEVEL) + TerrainField.BRIDGE_CLEARANCE
		p1.y = maxf(p1.y, peak_y)
		p2.y = maxf(p2.y, peak_y)
	else:
		p1.y = TerrainField.sample_height(p1.x, p1.z) + 0.25
		p2.y = TerrainField.sample_height(p2.x, p2.z) + 0.25

	var seg := {
		"id": _next_seg_id,
		"start_id": n_start["id"],
		"end_id": n_end["id"],
		"p1": p1,
		"p2": p2,
		"type": road_type,
		"is_bridge": crosses_water,
		"length": estimate_length(p0, p1, p2, p3, 20),
		"traffic": 0.0,
		"congestion": 0.0
	}
	segments[_next_seg_id] = seg
	n_start["segments"].append(_next_seg_id)
	n_end["segments"].append(_next_seg_id)
	_next_seg_id += 1
	return seg

func sample_pos(seg: Dictionary, t: float) -> Vector3:
	var p0: Vector3 = nodes[seg["start_id"]]["pos"]
	var p3: Vector3 = nodes[seg["end_id"]]["pos"]
	return eval_cubic(p0, seg["p1"], seg["p2"], p3, clampf(t, 0.0, 1.0))

func sample_tangent(seg: Dictionary, t: float) -> Vector3:
	var p0: Vector3 = nodes[seg["start_id"]]["pos"]
	var p3: Vector3 = nodes[seg["end_id"]]["pos"]
	var u: float = 1.0 - clampf(t, 0.0, 1.0)
	var tc: float = clampf(t, 0.0, 1.0)
	var d: Vector3 = 3.0 * u * u * (seg["p1"] - p0) + 6.0 * u * tc * (seg["p2"] - seg["p1"]) + 3.0 * tc * tc * (p3 - seg["p2"])
	return d.normalized() if d.length_squared() > 1e-6 else Vector3.FORWARD

func sample_right(seg: Dictionary, t: float) -> Vector3:
	var tan_v := sample_tangent(seg, t)
	var r := Vector3(-tan_v.z, 0.0, tan_v.x)
	return r.normalized() if r.length_squared() > 1e-6 else Vector3.RIGHT

func sample_lane_pose(seg: Dictionary, t: float, forward: bool) -> Dictionary:
	var eval_t: float = clampf(t, 0.0, 1.0) if forward else 1.0 - clampf(t, 0.0, 1.0)
	var center: Vector3 = sample_pos(seg, eval_t)
	var tan_v: Vector3 = sample_tangent(seg, eval_t)
	var dir: Vector3 = tan_v if forward else -tan_v
	var right: Vector3 = Vector3(-dir.z, 0.0, dir.x).normalized()
	var spec: Dictionary = ROAD_SPECS[seg["type"]]
	var lane_off: float = spec["asphalt_w"] * 0.24
	var pos := center + right * lane_off + Vector3(0.0, 0.35, 0.0)
	if not seg["is_bridge"]:
		pos.y = maxf(pos.y, TerrainField.sample_height(pos.x, pos.z) + 0.35)
	return {"pos": pos, "dir": dir}

func generate_roadside_lots(seg: Dictionary, spacing: float = 23.0) -> Array[Dictionary]:
	var lots: Array[Dictionary] = []
	if seg["is_bridge"] or seg["type"] == RoadType.SIX_LANE_HIGHWAY:
		return lots
	var spec: Dictionary = ROAD_SPECS[seg["type"]]
	var total_w: float = spec["asphalt_w"] + spec["sidewalk_w"] * 2.0
	var lat_off: float = total_w * 0.5 + 11.5
	var steps: int = maxi(1, int(floor((seg["length"] - 18.0) / spacing)))
	for i in range(steps):
		var t: float = (float(i) + 0.5) / float(steps)
		if t < 0.12 or t > 0.88:
			continue
		var center := sample_pos(seg, t)
		var tan_v := sample_tangent(seg, t)
		var right := Vector3(-tan_v.z, 0.0, tan_v.x).normalized()
		var yaw: float = atan2(tan_v.x, tan_v.z)
		lots.append({"pos": center + right * lat_off, "yaw": yaw - PI * 0.5})
		lots.append({"pos": center - right * lat_off, "yaw": yaw + PI * 0.5})
	return lots

# Speed-limit & congestion-weighted A* pathfinding across Bezier road graph
func find_route(start_id: int, goal_id: int) -> Dictionary:
	if start_id == goal_id or not nodes.has(start_id) or not nodes.has(goal_id):
		return {"found": false}
	var goal_pos: Vector3 = nodes[goal_id]["pos"]
	var open_list: Array[int] = [start_id]
	var in_open: Dictionary = {start_id: true}
	var closed: Dictionary = {}
	var came_node: Dictionary = {}
	var came_seg: Dictionary = {}
	var g_score: Dictionary = {start_id: 0.0}
	var f_score: Dictionary = {start_id: nodes[start_id]["pos"].distance_to(goal_pos) / 31.0}

	while open_list.size() > 0:
		var best_idx: int = 0
		var cur_id: int = open_list[0]
		var best_f: float = f_score[cur_id]
		for i in range(1, open_list.size()):
			var cid: int = open_list[i]
			if f_score[cid] < best_f:
				best_f = f_score[cid]
				cur_id = cid
				best_idx = i

		if cur_id == goal_id:
			var r_nodes: Array[int] = [cur_id]
			var r_segs: Array[int] = []
			var c: int = cur_id
			while c != start_id and came_node.has(c):
				r_segs.append(came_seg[c])
				c = came_node[c]
				r_nodes.append(c)
			r_nodes.reverse()
			r_segs.reverse()
			return {"found": true, "nodes": r_nodes, "segments": r_segs, "time": g_score[goal_id]}

		open_list.remove_at(best_idx)
		in_open.erase(cur_id)
		closed[cur_id] = true

		for sid in nodes[cur_id]["segments"]:
			var seg: Dictionary = segments[sid]
			var nb: int = seg["end_id"] if seg["start_id"] == cur_id else seg["start_id"]
			if closed.has(nb):
				continue
			var spec: Dictionary = ROAD_SPECS[seg["type"]]
			var penalty: float = 1.0 + maxf(0.0, seg["congestion"]) * 1.4
			var cost: float = (seg["length"] / maxf(4.0, spec["speed"])) * penalty
			var tent_g: float = g_score[cur_id] + cost
			if not g_score.has(nb) or tent_g < g_score[nb]:
				came_node[nb] = cur_id
				came_seg[nb] = sid
				g_score[nb] = tent_g
				f_score[nb] = tent_g + nodes[nb]["pos"].distance_to(goal_pos) / 31.0
				if not in_open.has(nb):
					open_list.append(nb)
					in_open[nb] = true

	return {"found": false}

static func eval_cubic(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: float) -> Vector3:
	var u: float = 1.0 - t
	return (u * u * u) * p0 + (3.0 * u * u * t) * p1 + (3.0 * u * t * t) * p2 + (t * t * t) * p3

static func estimate_length(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, samples: int = 20) -> float:
	var length: float = 0.0
	var prev: Vector3 = p0
	for i in range(1, samples + 1):
		var cur := eval_cubic(p0, p1, p2, p3, float(i) / float(samples))
		length += prev.distance_to(cur)
		prev = cur
	return length
