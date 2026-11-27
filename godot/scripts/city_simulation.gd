class_name CitySimulation
extends RefCounted

signal world_changed

const BUILDING_SPECS := {
	"res_low":   {"name": "저밀도 주택", "cost": 0, "upkeep": 0, "w": 11.5, "d": 11.5, "base_h": 7.5, "step_h": 2.2, "res": 16, "jobs": 0, "pow": -1.2, "wat": -1.4},
	"res_high":  {"name": "고밀도 주거 타워", "cost": 0, "upkeep": 0, "w": 17.5, "d": 17.5, "base_h": 26.0, "step_h": 10.5, "res": 96, "jobs": 4, "pow": -4.5, "wat": -5.2},
	"com_low":   {"name": "근린 상가", "cost": 0, "upkeep": 0, "w": 13.5, "d": 13.5, "base_h": 9.0, "step_h": 3.5, "res": 0, "jobs": 22, "pow": -2.0, "wat": -1.8},
	"com_high":  {"name": "고밀도 상업 마천루", "cost": 0, "upkeep": 0, "w": 19.5, "d": 19.5, "base_h": 36.0, "step_h": 14.5, "res": 0, "jobs": 122, "pow": -6.5, "wat": -4.5},
	"office":    {"name": "IT·금융 오피스 타워", "cost": 0, "upkeep": 0, "w": 21.0, "d": 21.0, "base_h": 44.0, "step_h": 17.5, "res": 0, "jobs": 168, "pow": -7.2, "wat": -3.8},
	"ind":       {"name": "첨단 제조 산업단지", "cost": 0, "upkeep": 0, "w": 21.0, "d": 17.5, "base_h": 11.0, "step_h": 3.0, "res": 0, "jobs": 76, "pow": -6.0, "wat": -4.8},
	"wind":      {"name": "풍력 발전기", "cost": 3200, "upkeep": 45, "w": 9.0, "d": 9.0, "base_h": 40.0, "step_h": 0.0, "res": 0, "jobs": 6, "pow": 110.0, "wat": 0.0},
	"solar":     {"name": "태양광 발전소", "cost": 14000, "upkeep": 160, "w": 26.0, "d": 22.0, "base_h": 7.0, "step_h": 0.0, "res": 0, "jobs": 14, "pow": 440.0, "wat": 0.0},
	"water":     {"name": "취수 펌프장", "cost": 4500, "upkeep": 65, "w": 14.0, "d": 14.0, "base_h": 10.0, "step_h": 0.0, "res": 0, "jobs": 10, "pow": -10.0, "wat": 620.0},
	"fire":      {"name": "소방서", "cost": 8500, "upkeep": 140, "w": 17.0, "d": 15.0, "base_h": 12.0, "step_h": 0.0, "res": 0, "jobs": 24, "pow": -5.0, "wat": -5.0},
	"police":    {"name": "경찰서", "cost": 9000, "upkeep": 150, "w": 17.0, "d": 15.0, "base_h": 13.0, "step_h": 0.0, "res": 0, "jobs": 26, "pow": -5.0, "wat": -4.0},
	"hospital":  {"name": "종합병원", "cost": 18000, "upkeep": 280, "w": 25.0, "d": 21.0, "base_h": 24.0, "step_h": 0.0, "res": 0, "jobs": 65, "pow": -12.0, "wat": -10.0},
	"school":    {"name": "초등학교", "cost": 11000, "upkeep": 160, "w": 21.0, "d": 17.0, "base_h": 11.0, "step_h": 0.0, "res": 0, "jobs": 32, "pow": -6.0, "wat": -6.0},
	"university":{"name": "국립 대학교", "cost": 34000, "upkeep": 460, "w": 32.0, "d": 26.0, "base_h": 20.0, "step_h": 0.0, "res": 0, "jobs": 95, "pow": -18.0, "wat": -14.0},
	"park":      {"name": "센트럴 시티 공원", "cost": 4200, "upkeep": 40, "w": 21.0, "d": 21.0, "base_h": 4.0, "step_h": 0.0, "res": 0, "jobs": 4, "pow": -1.0, "wat": -1.0},
	"landmark":  {"name": "메트로 스카이 랜드마크", "cost": 65000, "upkeep": 520, "w": 26.0, "d": 26.0, "base_h": 112.0, "step_h": 0.0, "res": 0, "jobs": 140, "pow": -20.0, "wat": -12.0}
}

var roads := RoadNetwork.new()
var buildings: Array[Dictionary] = []
var vehicles: Array[Dictionary] = []
var rng := RandomNumberGenerator.new()

var state := {
	"city_name": "Neo Metropolia",
	"day": 120,
	"time_hours": 10.5,
	"treasury": 245000,
	"tax_res": 0.09,
	"tax_com": 0.09,
	"tax_ind": 0.09,
	"daily_income": 0,
	"daily_upkeep": 0,
	"daily_net": 0,
	"population": 0,
	"total_jobs": 0,
	"employed": 0,
	"unemployment": 0.0,
	"happiness": 0.85,
	"traffic_flow": 0.90,
	"power_prod": 0.0,
	"power_use": 0.0,
	"water_prod": 0.0,
	"water_use": 0.0,
	"demand_r": 0.65,
	"demand_c": 0.55,
	"demand_i": 0.50,
	"goods_prod": 0.0,
	"goods_demand": 0.0,
	"goods_import": 0.0,
	"goods_export": 0.0,
	"goods_ratio": 1.0,
	"edu_unedu": 0.22,
	"edu_basic": 0.30,
	"edu_well": 0.30,
	"edu_high": 0.18,
	"event_pos": Vector3(316.0, 22.0, 515.0),
	"event_building_id": -1,
	"event_text": ""
}

var _next_b_id: int = 1
var _next_v_id: int = 1
var _day_acc: float = 0.0
var _tick_acc: float = 0.0

func _init() -> void:
	rng.seed = 2026

func _h(x: float, z: float) -> Vector3:
	return Vector3(x, TerrainField.sample_height(x, z) + 0.22, z)

func reset_and_build_demo() -> void:
	rng.seed = 2026
	roads.clear()
	buildings.clear()
	vehicles.clear()
	_next_b_id = 1
	_next_v_id = 1
	state["day"] = 120
	state["time_hours"] = 10.5
	state["treasury"] = 245000

	# 1. Northern Scenic 6-Lane Highway
	var hw0 := _h(140.0, 700.0)
	var hw1 := _h(360.0, 715.0)
	var hw2 := _h(640.0, 710.0)
	var hw3 := _h(880.0, 690.0)
	roads.get_or_create_node(hw0, 10.0, true)
	roads.get_or_create_node(hw3, 10.0, true)
	roads.add_segment(hw0, hw1, RoadNetwork.RoadType.SIX_LANE_HIGHWAY, _h(250.0, 725.0))
	roads.add_segment(hw1, hw2, RoadNetwork.RoadType.SIX_LANE_HIGHWAY, _h(500.0, 730.0))
	roads.add_segment(hw2, hw3, RoadNetwork.RoadType.SIX_LANE_HIGHWAY, _h(760.0, 705.0))

	# 2. West Downtown Curved Riverfront Boulevards
	var w_n := _h(360.0, 610.0)
	var w_m := _h(385.0, 470.0)
	var w_s := _h(345.0, 320.0)
	var w_o1 := _h(245.0, 590.0)
	var w_o2 := _h(250.0, 465.0)
	var w_o3 := _h(235.0, 330.0)

	roads.add_segment(hw1, w_n, RoadNetwork.RoadType.FOUR_LANE)
	roads.add_segment(w_n, w_m, RoadNetwork.RoadType.FOUR_LANE, _h(398.0, 540.0))
	roads.add_segment(w_m, w_s, RoadNetwork.RoadType.FOUR_LANE, _h(386.0, 395.0))
	roads.add_segment(w_o1, w_n, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(w_o2, w_m, RoadNetwork.RoadType.FOUR_LANE)
	roads.add_segment(w_o3, w_s, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(w_o1, w_o2, RoadNetwork.RoadType.TWO_LANE, _h(230.0, 525.0))
	roads.add_segment(w_o2, w_o3, RoadNetwork.RoadType.TWO_LANE, _h(228.0, 398.0))

	# 3. East Riverbank Curved Boulevard & Hillside Suburbs
	var e_n := _h(640.0, 600.0)
	var e_m := _h(635.0, 465.0)
	var e_s := _h(655.0, 325.0)
	var e_o1 := _h(765.0, 585.0)
	var e_o2 := _h(775.0, 455.0)
	var e_o3 := _h(760.0, 330.0)

	roads.add_segment(hw2, e_n, RoadNetwork.RoadType.FOUR_LANE)
	roads.add_segment(e_n, e_m, RoadNetwork.RoadType.FOUR_LANE, _h(620.0, 535.0))
	roads.add_segment(e_m, e_s, RoadNetwork.RoadType.FOUR_LANE, _h(632.0, 395.0))
	roads.add_segment(e_n, e_o1, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(e_m, e_o2, RoadNetwork.RoadType.FOUR_LANE)
	roads.add_segment(e_s, e_o3, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(e_o1, e_o2, RoadNetwork.RoadType.TWO_LANE, _h(790.0, 520.0))
	roads.add_segment(e_o2, e_o3, RoadNetwork.RoadType.TWO_LANE, _h(785.0, 390.0))

	# 4. Two Sweeping Suspension Bridges across the winding river!
	roads.add_segment(w_m, e_m, RoadNetwork.RoadType.FOUR_LANE)
	roads.add_segment(w_s, e_s, RoadNetwork.RoadType.FOUR_LANE)

	# 5. South-West Industrial Port Loop
	var i1 := _h(210.0, 230.0)
	var i2 := _h(330.0, 220.0)
	roads.add_segment(w_o3, i1, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(w_s, i2, RoadNetwork.RoadType.TWO_LANE)
	roads.add_segment(i1, i2, RoadNetwork.RoadType.TWO_LANE)

	# 6. Iconic Landmarks, Civic Services & Clean Energy
	place_building("landmark", _h(316.0, 515.0), 0.0, 5, true)
	place_building("university", _h(705.0, 520.0), PI * 0.5, 1, true)
	place_building("hospital", _h(310.0, 412.0), 0.0, 1, true)
	place_building("fire", _h(295.0, 355.0), 0.0, 1, true)
	place_building("police", _h(700.0, 400.0), PI, 1, true)
	place_building("school", _h(712.0, 360.0), PI * 0.5, 1, true)
	place_building("park", _h(320.0, 466.0), 0.0, 1, true)
	place_building("park", _h(702.0, 462.0), 0.0, 1, true)
	place_building("solar", _h(172.0, 252.0), 0.0, 1, true)
	place_building("wind", _h(192.0, 650.0), 0.5, 1, true)
	place_building("wind", _h(232.0, 668.0), 0.5, 1, true)
	place_building("wind", _h(815.0, 625.0), -0.4, 1, true)
	place_building("water", _h(435.0, 608.0), 0.0, 1, true)

	# 7. Populate District Buildings aligned cleanly along every curved Bezier road!
	for seg in roads.segments.values():
		var lots := roads.generate_roadside_lots(seg, 23.0)
		for lot in lots:
			var lp: Vector3 = lot["pos"]
			if TerrainField.is_water(lp.x, lp.z):
				continue
			if _is_near_building(lp, 17.5):
				continue
			var pos := Vector3(lp.x, TerrainField.sample_height(lp.x, lp.z), lp.z)
			var btype := "res_low"
			var lvl := 1
			if pos.z < 288.0 and pos.x < 420.0:
				btype = "ind"
				lvl = rng.randi_range(1, 3)
			elif pos.x < 430.0:
				var r := rng.randf()
				if r < 0.42:
					btype = "office"; lvl = rng.randi_range(3, 5)
				elif r < 0.80:
					btype = "com_high"; lvl = rng.randi_range(2, 5)
				else:
					btype = "res_high"; lvl = rng.randi_range(2, 4)
			else:
				var r := rng.randf()
				if r < 0.48:
					btype = "res_high"; lvl = rng.randi_range(2, 4)
				elif r < 0.82:
					btype = "res_low"; lvl = rng.randi_range(1, 3)
				else:
					btype = "com_low"; lvl = rng.randi_range(1, 3)
			place_building(btype, pos, lot["yaw"], lvl, true)

	_spawn_initial_vehicles(72)
	run_tick()
	world_changed.emit()

func build_road(start_pos: Vector3, end_pos: Vector3, road_type: int, curve_mid = null) -> Dictionary:
	var spec: Dictionary = RoadNetwork.ROAD_SPECS[road_type]
	var est_len: float = start_pos.distance_to(end_pos)
	var cost: int = maxi(spec["cost_10m"], int(est_len / 10.0 * spec["cost_10m"]))
	if state["treasury"] < cost:
		return {}
	var seg := roads.add_segment(start_pos, end_pos, road_type, curve_mid)
	if seg.is_empty():
		return {}
	state["treasury"] -= cost
	run_tick()
	world_changed.emit()
	return seg

func place_building(btype: String, pos: Vector3, yaw: float, level: int = 1, free: bool = false) -> Dictionary:
	if not BUILDING_SPECS.has(btype):
		return {}
	var spec: Dictionary = BUILDING_SPECS[btype]
	if not free and state["treasury"] < spec["cost"]:
		return {}
	if not free:
		state["treasury"] -= spec["cost"]
	var lvl: int = clampi(level, 1, 5)
	var b := {
		"id": _next_b_id,
		"type": btype,
		"pos": Vector3(pos.x, TerrainField.sample_height(pos.x, pos.z), pos.z),
		"yaw": yaw,
		"level": lvl,
		"historical": false,
		"style": rng.randi_range(0, 5),
		"w": spec["w"],
		"d": spec["d"],
		"h": spec["base_h"] + float(lvl - 1) * spec["step_h"],
		"residents": int(spec["res"] * (1.0 + float(lvl - 1) * 0.45)),
		"jobs": int(spec["jobs"] * (1.0 + float(lvl - 1) * 0.40)),
		"has_power": true,
		"has_water": true,
		"has_goods": true
	}
	_next_b_id += 1
	buildings.append(b)
	if not free:
		run_tick()
		world_changed.emit()
	return b

func find_building_at(pos: Vector3, radius: float = 18.0) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = radius
	for b in buildings:
		var bp: Vector3 = b["pos"]
		var d: float = Vector2(bp.x - pos.x, bp.z - pos.z).length()
		if d <= best_d:
			best_d = d
			best = b
	return best

func bulldoze_at(pos: Vector3, radius: float = 16.0) -> bool:
	var target := find_building_at(pos, radius)
	if target.is_empty():
		return false
	return bulldoze_by_id(target["id"])

func bulldoze_by_id(bid: int) -> bool:
	for i in range(buildings.size() - 1, -1, -1):
		if buildings[i]["id"] == bid:
			buildings.remove_at(i)
			run_tick()
			world_changed.emit()
			return true
	return false

func step_frame(delta: float, speed_mult: float) -> void:
	var dt: float = delta * maxf(0.0, speed_mult)
	if dt <= 0.0:
		return
	state["time_hours"] = fmod(state["time_hours"] + dt * 0.22, 24.0)
	_day_acc += dt
	if _day_acc >= 12.0:
		_day_acc -= 12.0
		state["day"] += 1
		state["treasury"] += state["daily_net"]
	_update_vehicles(dt)
	_tick_acc += dt
	if _tick_acc >= 2.0:
		_tick_acc -= 2.0
		run_tick()

func run_tick() -> void:
	var pop := 0
	var jobs := 0
	var p_prod := 0.0
	var p_use := 0.0
	var w_prod := 0.0
	var w_use := 0.0
	var ind_goods := 0.0
	var com_demand := 0.0
	var r_tax := 0
	var c_tax := 0
	var i_tax := 0
	var upkeep := 0
	var schools := 0
	var unis := 0
	var hosps := 0
	var parks := 0

	for b in buildings:
		var sp: Dictionary = BUILDING_SPECS[b["type"]]
		pop += b["residents"]
		jobs += b["jobs"]
		upkeep += sp["upkeep"]
		if sp["pow"] > 0.0: p_prod += sp["pow"]
		else: p_use += -sp["pow"]
		if sp["wat"] > 0.0: w_prod += sp["wat"]
		else: w_use += -sp["wat"]

		match b["type"]:
			"ind":
				ind_goods += 14.0 * b["level"]
				i_tax += b["jobs"] * 12
			"com_low", "com_high":
				com_demand += 11.0 * b["level"]
				c_tax += b["jobs"] * 15
			"office":
				c_tax += b["jobs"] * 19
			"res_low", "res_high":
				r_tax += b["residents"] * 10
			"school": schools += 1
			"university": unis += 1
			"hospital": hosps += 1
			"park", "landmark": parks += 1

	for seg in roads.segments.values():
		var rsp: Dictionary = RoadNetwork.ROAD_SPECS[seg["type"]]
		upkeep += maxi(1, int(seg["length"] / 10.0 * rsp["upkeep_10m"]))

	state["goods_prod"] = ind_goods
	state["goods_demand"] = com_demand
	var net_g: float = ind_goods - com_demand
	state["goods_export"] = net_g if net_g > 0.0 else 0.0
	state["goods_import"] = -net_g * 0.85 if net_g < 0.0 else 0.0
	state["goods_ratio"] = 1.0 if com_demand <= 0.1 else minf(1.0, (ind_goods + state["goods_import"]) / com_demand)

	var edu_boost: float = minf(1.0, schools * 0.28 + unis * 0.45)
	state["edu_high"] = 0.08 + edu_boost * 0.26
	state["edu_well"] = 0.18 + edu_boost * 0.24
	state["edu_basic"] = 0.34 - edu_boost * 0.12
	state["edu_unedu"] = maxf(0.04, 1.0 - (state["edu_high"] + state["edu_well"] + state["edu_basic"]))

	var workforce: int = int(pop * 0.62)
	var emp: int = mini(workforce, jobs)
	state["population"] = pop
	state["total_jobs"] = jobs
	state["employed"] = emp
	state["unemployment"] = maxf(0.0, float(workforce - emp) / float(workforce)) if workforce > 0 else 0.0

	state["power_prod"] = p_prod
	state["power_use"] = p_use
	state["water_prod"] = w_prod
	state["water_use"] = w_use
	var p_ok := p_prod >= p_use * 0.90
	var w_ok := w_prod >= w_use * 0.90
	for b in buildings:
		b["has_power"] = p_ok
		b["has_water"] = w_ok
		b["has_goods"] = state["goods_ratio"] > 0.72

	var inc: int = int(r_tax * state["tax_res"] * 2.4 + c_tax * state["tax_com"] * 2.5 + i_tax * state["tax_ind"] * 2.2)
	state["daily_income"] = inc
	state["daily_upkeep"] = upkeep
	state["daily_net"] = inc - upkeep

	var flow_sum := 0.0
	for seg in roads.segments.values():
		var rsp: Dictionary = RoadNetwork.ROAD_SPECS[seg["type"]]
		seg["congestion"] = seg["traffic"] / maxf(1.0, rsp["capacity"])
		flow_sum += maxf(0.25, 1.0 - seg["congestion"] * 0.55)
	state["traffic_flow"] = flow_sum / float(roads.segments.size()) if roads.segments.size() > 0 else 1.0

	var bonus: float = minf(0.18, hosps * 0.05 + parks * 0.04 + edu_boost * 0.09)
	var pen: float = (0.0 if p_ok else 0.22) + (0.0 if w_ok else 0.22) + state["unemployment"] * 0.35
	state["happiness"] = clampf(0.76 + bonus - pen, 0.15, 0.99)
	state["demand_r"] = clampf(0.45 + (0.35 if jobs > workforce else -0.15) + (state["happiness"] - 0.65), 0.08, 1.0)
	state["demand_c"] = clampf(0.42 + (float(pop) / 6000.0) * 0.25, 0.08, 1.0)
	state["demand_i"] = clampf(0.36 + (0.38 if com_demand > ind_goods else 0.08) + state["unemployment"], 0.08, 1.0)

	# Track real 3D hotspot location for the active Chirper / Event alert (click to jump!)
	var focus_pos := Vector3(316.0, 22.0, 515.0)
	var focus_bid := -1
	var focus_msg := "#%s | 인구 %d명 · 실업률 %d%% · 물류 충족 %d%% [클릭하여 도심 이동]" % [
		state["city_name"], pop, int(state["unemployment"] * 100.0), int(state["goods_ratio"] * 100.0)
	]
	for b in buildings:
		if b["type"] == "landmark":
			focus_pos = b["pos"]
			focus_bid = b["id"]
			break
	if not p_ok:
		for b in buildings:
			if b["type"] == "solar" or b["type"] == "wind" or b["type"] == "office":
				focus_pos = b["pos"]; focus_bid = b["id"]; break
		focus_msg = "[전력 경보] 발전 용량이 부족합니다! (클릭하여 해당 위치로 이동)"
	elif not w_ok:
		for b in buildings:
			if b["type"] == "water" or b["type"] == "res_high":
				focus_pos = b["pos"]; focus_bid = b["id"]; break
		focus_msg = "[수도 경보] 취수 용량이 부족합니다! (클릭하여 해당 위치로 이동)"
	elif state["goods_ratio"] < 0.80:
		for b in buildings:
			if b["type"] == "com_high" or b["type"] == "ind":
				focus_pos = b["pos"]; focus_bid = b["id"]; break
		focus_msg = "[물류 소식] 상업지구 상품 수요 급증! (클릭하여 해당 위치로 이동)"
	elif state["traffic_flow"] < 0.78:
		var max_c := -1.0
		for seg in roads.segments.values():
			if seg["congestion"] > max_c:
				max_c = seg["congestion"]
				focus_pos = roads.sample_pos(seg, 0.5)
				focus_bid = -1
		focus_msg = "[교통 혼잡] 간선도로 정체 발생! (클릭하여 혼잡 구간으로 이동)"

	state["event_pos"] = focus_pos
	state["event_building_id"] = focus_bid
	state["event_text"] = focus_msg

func _spawn_initial_vehicles(count: int) -> void:
	var nids := roads.nodes.keys()
	if nids.size() < 2:
		return
	for _i in range(count):
		var a: int = nids[rng.randi_range(0, nids.size() - 1)]
		var b: int = nids[rng.randi_range(0, nids.size() - 1)]
		if a == b:
			continue
		var route := roads.find_route(a, b)
		if not route["found"] or route["segments"].is_empty():
			continue
		var v := {
			"id": _next_v_id,
			"is_truck": rng.randf() < 0.26,
			"color_idx": rng.randi_range(0, 7),
			"nodes": route["nodes"],
			"segs": route["segments"],
			"idx": 0,
			"seg_id": route["segments"][0],
			"forward": roads.segments[route["segments"][0]]["start_id"] == route["nodes"][0],
			"t": rng.randf(),
			"pos": Vector3.ZERO,
			"dir": Vector3.FORWARD
		}
		var pose := roads.sample_lane_pose(roads.segments[v["seg_id"]], v["t"], v["forward"])
		v["pos"] = pose["pos"]
		v["dir"] = pose["dir"]
		_next_v_id += 1
		vehicles.append(v)

func _update_vehicles(dt: float) -> void:
	for seg in roads.segments.values():
		seg["traffic"] = 0.0
	var nids := roads.nodes.keys()
	for v in vehicles:
		if not roads.segments.has(v["seg_id"]):
			continue
		var seg: Dictionary = roads.segments[v["seg_id"]]
		seg["traffic"] += 1.0
		var spec: Dictionary = RoadNetwork.ROAD_SPECS[seg["type"]]
		var spd: float = spec["speed"] * maxf(0.30, 1.0 - seg["congestion"] * 0.45)
		v["t"] += (spd * dt) / maxf(4.0, seg["length"])
		if v["t"] >= 1.0:
			v["t"] = 0.0
			v["idx"] += 1
			if v["idx"] >= v["segs"].size():
				var cur_n: int = v["nodes"][v["nodes"].size() - 1]
				var tgt_n: int = nids[rng.randi_range(0, nids.size() - 1)]
				var r := roads.find_route(cur_n, tgt_n)
				if r["found"] and not r["segments"].is_empty():
					v["nodes"] = r["nodes"]
					v["segs"] = r["segments"]
					v["idx"] = 0
					v["seg_id"] = r["segments"][0]
					seg = roads.segments[v["seg_id"]]
					v["forward"] = seg["start_id"] == v["nodes"][0]
				else:
					v["idx"] = 0
					v["forward"] = not v["forward"]
			else:
				v["seg_id"] = v["segs"][v["idx"]]
				seg = roads.segments[v["seg_id"]]
				v["forward"] = seg["start_id"] == v["nodes"][v["idx"]]
		var pose := roads.sample_lane_pose(seg, v["t"], v["forward"])
		v["pos"] = pose["pos"]
		v["dir"] = pose["dir"]

func _is_near_building(pos: Vector3, min_d: float) -> bool:
	var msq: float = min_d * min_d
	for b in buildings:
		var bp: Vector3 = b["pos"]
		var dx: float = bp.x - pos.x
		var dz: float = bp.z - pos.z
		if dx * dx + dz * dz < msq:
			return true
	return false
