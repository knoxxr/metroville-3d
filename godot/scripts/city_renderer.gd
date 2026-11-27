class_name CityRenderer
extends Node3D

var roads_root: Node3D
var buildings_root: Node3D
var forest_root: Node3D

var vehicles_body_mm: MultiMeshInstance3D
var vehicles_cabin_mm: MultiMeshInstance3D
var vehicles_wheels_mm: MultiMeshInstance3D
var vehicles_head_mm: MultiMeshInstance3D
var vehicles_tail_mm: MultiMeshInstance3D
var preview_mesh_inst: MeshInstance3D

var _mat_road_2: ShaderMaterial
var _mat_road_4: ShaderMaterial
var _mat_road_6: ShaderMaterial
var _mat_junction: ShaderMaterial
var _mat_sidewalk: StandardMaterial3D
var _mat_bridge_steel: StandardMaterial3D
var _mat_concrete: StandardMaterial3D
var _mat_granite_dark: StandardMaterial3D
var _mat_aluminum: StandardMaterial3D
var _mat_roof_dark: StandardMaterial3D
var _mat_solar: StandardMaterial3D
var _mat_park_turf: StandardMaterial3D
var _mat_water_blue: StandardMaterial3D
var _mat_red_accent: StandardMaterial3D
var _mat_blue_accent: StandardMaterial3D
var _mat_white_mark: StandardMaterial3D
var _mat_wood_bench: StandardMaterial3D
var _mat_signal_green: StandardMaterial3D
var _mat_signal_amber: StandardMaterial3D
var _mat_signal_red: StandardMaterial3D
var _mat_lamp_glow: StandardMaterial3D
var _mat_beacon_red: StandardMaterial3D
var _mat_industrial: StandardMaterial3D
var _mat_glass_blue: ShaderMaterial
var _mat_glass_gold: ShaderMaterial
var _mat_glass_emerald: ShaderMaterial
var _mat_stone_white: ShaderMaterial
var _mat_terracotta: ShaderMaterial
var _mat_brick_red: ShaderMaterial
var _mat_trunk: StandardMaterial3D
var _mat_pine: StandardMaterial3D
var _mat_oak: StandardMaterial3D
var _mat_street_tree: StandardMaterial3D
var _mat_preview: StandardMaterial3D
var _mat_awnings: Array[StandardMaterial3D] = []

var _wind_rotors: Array[Node3D] = []
var _road_mesh_entries: Array[Dictionary] = []

const CAR_PALETTE := [
	Color(0.94, 0.96, 0.98),
	Color(0.14, 0.19, 0.27),
	Color(0.76, 0.16, 0.19),
	Color(0.16, 0.40, 0.72),
	Color(0.92, 0.72, 0.14),
	Color(0.58, 0.62, 0.68),
	Color(0.15, 0.48, 0.36),
	Color(0.84, 0.38, 0.15),
	Color(0.28, 0.32, 0.38)
]

const PINE_PALETTE := [
	Color(0.10, 0.25, 0.12),
	Color(0.13, 0.30, 0.15),
	Color(0.08, 0.22, 0.14),
	Color(0.16, 0.33, 0.14),
	Color(0.11, 0.27, 0.16)
]

const OAK_PALETTE := [
	Color(0.19, 0.40, 0.15),
	Color(0.24, 0.45, 0.16),
	Color(0.16, 0.36, 0.14),
	Color(0.30, 0.46, 0.17),
	Color(0.42, 0.44, 0.16)
]

func _ready() -> void:
	_init_materials()
	roads_root = Node3D.new(); roads_root.name = "RoadsRoot"; add_child(roads_root)
	buildings_root = Node3D.new(); buildings_root.name = "BuildingsRoot"; add_child(buildings_root)
	forest_root = Node3D.new(); forest_root.name = "ForestRoot"; add_child(forest_root)

	preview_mesh_inst = MeshInstance3D.new()
	preview_mesh_inst.name = "RoadPreview"
	preview_mesh_inst.material_override = _mat_preview
	preview_mesh_inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(preview_mesh_inst)

	_init_vehicle_multimeshes()

func _process(delta: float) -> void:
	for rotor in _wind_rotors:
		if is_instance_valid(rotor):
			rotor.rotate_z(delta * 2.2)

func set_night_factor(night_val: float) -> void:
	_mat_glass_blue.set_shader_parameter("night_factor", night_val)
	_mat_glass_gold.set_shader_parameter("night_factor", night_val)
	_mat_glass_emerald.set_shader_parameter("night_factor", night_val)
	_mat_stone_white.set_shader_parameter("night_factor", night_val)
	_mat_terracotta.set_shader_parameter("night_factor", night_val)
	_mat_brick_red.set_shader_parameter("night_factor", night_val)
	if _mat_lamp_glow != null:
		_mat_lamp_glow.emission_energy_multiplier = lerpf(0.65, 4.2, night_val)

func set_traffic_overlay(enabled: bool, sim: CitySimulation) -> void:
	for entry in _road_mesh_entries:
		var mat: ShaderMaterial = entry["mat"]
		var sid: int = entry["seg_id"]
		if enabled and sim.roads.segments.has(sid):
			var cong: float = clampf(sim.roads.segments[sid]["congestion"], 0.05, 1.0)
			mat.set_shader_parameter("congestion_tint", cong)
		else:
			mat.set_shader_parameter("congestion_tint", 0.0)

func rebuild_world(sim: CitySimulation) -> void:
	_clear_children(roads_root)
	_clear_children(buildings_root)
	_wind_rotors.clear()
	_road_mesh_entries.clear()

	_build_all_roads(sim.roads)
	_build_all_buildings(sim)
	if forest_root.get_child_count() == 0:
		_build_valley_forest(sim)
	sync_vehicles(sim)

func sync_vehicles(sim: CitySimulation) -> void:
	if vehicles_body_mm == null:
		return
	var count: int = mini(sim.vehicles.size(), 160)
	vehicles_body_mm.multimesh.visible_instance_count = count
	vehicles_cabin_mm.multimesh.visible_instance_count = count
	vehicles_wheels_mm.multimesh.visible_instance_count = count * 4
	vehicles_head_mm.multimesh.visible_instance_count = count * 2
	vehicles_tail_mm.multimesh.visible_instance_count = count * 2

	for i in range(count):
		var v: Dictionary = sim.vehicles[i]
		var pos: Vector3 = v["pos"]
		var dir: Vector3 = v["dir"]
		if dir.length_squared() < 1e-4:
			dir = Vector3.FORWARD
		dir = dir.normalized()
		var yaw: float = atan2(dir.x, dir.z)
		var is_truck: bool = v["is_truck"]
		var basis := Basis(Vector3.UP, yaw)
		var right := basis.x

		# 1. Sculpted Vehicle Chassis (raised above tires!)
		var b_scale := Vector3(2.25, 1.05, 6.4) if is_truck else Vector3(1.88, 0.78, 4.35)
		var b_pos := pos + Vector3(0.0, 0.34 + b_scale.y * 0.5, 0.0)
		vehicles_body_mm.multimesh.set_instance_transform(i, Transform3D(basis.scaled(b_scale), b_pos))
		vehicles_body_mm.multimesh.set_instance_color(i, CAR_PALETTE[v["color_idx"] % CAR_PALETTE.size()])

		# 2. Tinted Glass Greenhouse (Cars) or Crisp Insulated Cargo Box (Trucks)
		if is_truck:
			var c_scale := Vector3(2.30, 1.95, 4.45)
			var c_pos := pos - dir * 0.85 + Vector3(0.0, 1.20 + c_scale.y * 0.5, 0.0)
			vehicles_cabin_mm.multimesh.set_instance_transform(i, Transform3D(basis.scaled(c_scale), c_pos))
			vehicles_cabin_mm.multimesh.set_instance_color(i, Color(0.92, 0.94, 0.96))
		else:
			var c_scale := Vector3(1.56, 0.62, 2.18)
			var c_pos := pos - dir * 0.18 + Vector3(0.0, 1.05 + c_scale.y * 0.45, 0.0)
			vehicles_cabin_mm.multimesh.set_instance_transform(i, Transform3D(basis.scaled(c_scale), c_pos))
			vehicles_cabin_mm.multimesh.set_instance_color(i, Color(0.11, 0.16, 0.24))

		# 3. Four Cylindrical Rubber Tires tucked into Wheel Arches
		var w_lat: float = 1.08 if is_truck else 0.90
		var w_fwd: float = 2.05 if is_truck else 1.32
		var w_rad: float = 0.44 if is_truck else 0.34
		var w_basis := (basis * Basis(Vector3.FORWARD, PI * 0.5)).scaled(Vector3(w_rad * 2.0, 0.28, w_rad * 2.0))
		var w_idx := i * 4
		vehicles_wheels_mm.multimesh.set_instance_transform(w_idx + 0, Transform3D(w_basis, pos + dir * w_fwd + right * w_lat + Vector3(0, w_rad, 0)))
		vehicles_wheels_mm.multimesh.set_instance_transform(w_idx + 1, Transform3D(w_basis, pos + dir * w_fwd - right * w_lat + Vector3(0, w_rad, 0)))
		vehicles_wheels_mm.multimesh.set_instance_transform(w_idx + 2, Transform3D(w_basis, pos - dir * w_fwd + right * w_lat + Vector3(0, w_rad, 0)))
		vehicles_wheels_mm.multimesh.set_instance_transform(w_idx + 3, Transform3D(w_basis, pos - dir * w_fwd - right * w_lat + Vector3(0, w_rad, 0)))

		# 4. Twin Warm-White LED Headlights & Twin Ruby-Red Taillights
		var l_lat: float = 0.78 if is_truck else 0.64
		var front_z: float = b_scale.z * 0.505
		var light_y: float = 0.78 if is_truck else 0.68
		var l_basis := basis.scaled(Vector3(0.34, 0.20, 0.14))
		var l_idx := i * 2
		vehicles_head_mm.multimesh.set_instance_transform(l_idx + 0, Transform3D(l_basis, pos + dir * front_z + right * l_lat + Vector3(0, light_y, 0)))
		vehicles_head_mm.multimesh.set_instance_transform(l_idx + 1, Transform3D(l_basis, pos + dir * front_z - right * l_lat + Vector3(0, light_y, 0)))
		vehicles_tail_mm.multimesh.set_instance_transform(l_idx + 0, Transform3D(l_basis, pos - dir * front_z + right * l_lat + Vector3(0, light_y, 0)))
		vehicles_tail_mm.multimesh.set_instance_transform(l_idx + 1, Transform3D(l_basis, pos - dir * front_z - right * l_lat + Vector3(0, light_y, 0)))

func update_road_preview(points: Array[Vector3]) -> void:
	if points.size() < 2:
		preview_mesh_inst.mesh = null
		return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var half_w := 4.5
	for i in range(points.size() - 1):
		var a := points[i] + Vector3(0, 1.0, 0)
		var b := points[i + 1] + Vector3(0, 1.0, 0)
		var d := (b - a).normalized()
		var r := Vector3(-d.z, 0.0, d.x).normalized() * half_w
		st.add_vertex(a - r); st.add_vertex(a + r); st.add_vertex(b + r)
		st.add_vertex(a - r); st.add_vertex(b + r); st.add_vertex(b - r)
	st.generate_normals()
	preview_mesh_inst.mesh = st.commit()

func _build_all_roads(net: RoadNetwork) -> void:
	var node_trim: Dictionary = {}
	var node_max_w: Dictionary = {}
	var node_has_sidewalk: Dictionary = {}
	for node in net.nodes.values():
		var nid: int = node["id"]
		var deg: int = node["segments"].size()
		var max_w := 8.0
		var any_sw := false
		for sid in node["segments"]:
			var sp: Dictionary = RoadNetwork.ROAD_SPECS[net.segments[sid]["type"]]
			max_w = maxf(max_w, sp["asphalt_w"])
			if sp["sidewalks"]:
				any_sw = true
		node_max_w[nid] = max_w
		node_has_sidewalk[nid] = any_sw
		if deg >= 3:
			node_trim[nid] = max_w * 0.56 + 1.8
		elif deg == 2:
			node_trim[nid] = max_w * 0.42
		else:
			node_trim[nid] = 0.0

	for seg in net.segments.values():
		var spec: Dictionary = RoadNetwork.ROAD_SPECS[seg["type"]]
		var seg_len: float = maxf(8.0, seg["length"])
		var start_id: int = seg["start_id"]
		var end_id: int = seg["end_id"]
		var start_deg: int = net.nodes[start_id]["segments"].size()
		var end_deg: int = net.nodes[end_id]["segments"].size()

		var trim_s: float = minf(node_trim.get(start_id, 0.0), seg_len * 0.32)
		var trim_e: float = minf(node_trim.get(end_id, 0.0), seg_len * 0.32)
		var t_start: float = trim_s / seg_len
		var t_end: float = 1.0 - (trim_e / seg_len)
		if t_end <= t_start + 0.04:
			t_start = 0.0
			t_end = 1.0
		var trimmed_len: float = maxf(4.0, seg_len * (t_end - t_start))

		var slices: int = clampi(int(ceil(trimmed_len / 4.0)), 8, 56)
		var base_mat: ShaderMaterial = _mat_road_2 if seg["type"] == 0 else (_mat_road_4 if seg["type"] == 1 else _mat_road_6)
		var seg_mat: ShaderMaterial = base_mat.duplicate()
		seg_mat.set_shader_parameter("seg_length", trimmed_len)
		seg_mat.set_shader_parameter("has_start_xwalk", 1.0 if (start_deg >= 3 and spec["sidewalks"]) else 0.0)
		seg_mat.set_shader_parameter("has_end_xwalk", 1.0 if (end_deg >= 3 and spec["sidewalks"]) else 0.0)
		_road_mesh_entries.append({"seg_id": seg["id"], "mat": seg_mat})

		var asph_mesh := _extrude_ribbon(net, seg, slices, -spec["asphalt_w"] * 0.5, spec["asphalt_w"] * 0.5, 0.16, 0.55, t_start, t_end)
		_add_mesh_node(roads_root, "Road_%d" % seg["id"], asph_mesh, seg_mat)

		if spec["sidewalks"]:
			var hw: float = spec["asphalt_w"] * 0.5
			var outer: float = hw + spec["sidewalk_w"]
			_add_mesh_node(roads_root, "WalkR_%d" % seg["id"], _extrude_ribbon(net, seg, slices, hw, outer, 0.32, 0.70, t_start, t_end), _mat_sidewalk)
			_add_mesh_node(roads_root, "WalkL_%d" % seg["id"], _extrude_ribbon(net, seg, slices, -outer, -hw, 0.32, 0.70, t_start, t_end), _mat_sidewalk)

		if seg["is_bridge"]:
			_build_suspension_bridge(net, seg, spec)
		elif spec["sidewalks"]:
			_build_streetlamps(net, seg, spec, t_start, t_end)

	# Clean unmarked weathered-asphalt intersection aprons + curbs + detailed 3-color traffic signal poles
	for node in net.nodes.values():
		var deg: int = node["segments"].size()
		if deg < 2:
			continue
		var nid: int = node["id"]
		var apron_r: float = node_trim[nid] + 1.4

		var j_mat: ShaderMaterial = _mat_junction.duplicate()
		var cyl := CylinderMesh.new()
		cyl.top_radius = apron_r
		cyl.bottom_radius = apron_r + 0.5
		cyl.height = 0.52
		cyl.radial_segments = 28
		var pad := _add_mesh_node(roads_root, "Junction_%d" % nid, cyl, j_mat)
		pad.position = Vector3(node["pos"].x, maxf(node["pos"].y, TerrainField.sample_height(node["pos"].x, node["pos"].z)) - 0.115, node["pos"].z)

		if deg >= 3 and node_has_sidewalk[nid]:
			var curb_cyl := CylinderMesh.new()
			curb_cyl.top_radius = apron_r + 3.2
			curb_cyl.bottom_radius = apron_r + 3.8
			curb_cyl.height = 0.44
			curb_cyl.radial_segments = 28
			var curb_pad := _add_mesh_node(roads_root, "JunctionCurb_%d" % nid, curb_cyl, _mat_sidewalk)
			curb_pad.position = Vector3(pad.position.x, pad.position.y - 0.10, pad.position.z)

			# Detailed 3-Light Cantilever Traffic Signal Poles on diagonal corners
			var corner: float = apron_r + 1.15
			for sgn in [1.0, -1.0]:
				var pole_pos := Vector3(pad.position.x + corner * 0.72 * sgn, pad.position.y + 0.25, pad.position.z + corner * 0.72 * sgn)
				var mast := _make_cyl(0.14, 0.22, 6.8)
				var mn := _add_mesh_node(roads_root, "SigMast", mast, _mat_roof_dark)
				mn.position = pole_pos + Vector3(0, 3.4, 0)
				_spawn_box(roads_root, pole_pos + Vector3(-1.7 * sgn, 6.55, 0), Vector3(3.5, 0.20, 0.20), 0.0, _mat_roof_dark)
				# 3-aspect vertical signal head (Red / Amber / Green lenses inside dark housing!)
				var hx: float = pole_pos.x - 2.6 * float(sgn)
				_spawn_box(roads_root, Vector3(hx, pole_pos.y + 6.05, pole_pos.z), Vector3(0.42, 1.15, 0.34), 0.0, _mat_granite_dark)
				_spawn_box(roads_root, Vector3(hx, pole_pos.y + 6.38, pole_pos.z), Vector3(0.24, 0.22, 0.38), 0.0, _mat_signal_red)
				_spawn_box(roads_root, Vector3(hx, pole_pos.y + 6.05, pole_pos.z), Vector3(0.24, 0.22, 0.38), 0.0, _mat_signal_amber)
				_spawn_box(roads_root, Vector3(hx, pole_pos.y + 5.72, pole_pos.z), Vector3(0.24, 0.22, 0.38), 0.0, _mat_signal_green)
				# Pedestrian walk indicator box lower on the pole
				_spawn_box(roads_root, pole_pos + Vector3(0, 3.1, 0), Vector3(0.32, 0.48, 0.36), 0.0, _mat_granite_dark)

func _extrude_ribbon(net: RoadNetwork, seg: Dictionary, slices: int, off_l: float, off_r: float, top_y: float, skirt_d: float, t_start: float = 0.0, t_end: float = 1.0) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var dist_acc := 0.0
	var prev_c := Vector3.ZERO
	var ring_p: Array[Array] = []

	for i in range(slices + 1):
		var t: float = lerpf(t_start, t_end, float(i) / float(slices))
		var c: Vector3 = net.sample_pos(seg, t)
		if not seg["is_bridge"]:
			c.y = maxf(c.y, TerrainField.sample_height(c.x, c.z) + 0.16)
		var r: Vector3 = net.sample_right(seg, t)
		if i > 0:
			dist_acc += prev_c.distance_to(c)
		prev_c = c
		var p_l := c + r * off_l + Vector3(0, top_y, 0)
		var p_r := c + r * off_r + Vector3(0, top_y, 0)
		var p_lb := p_l - Vector3(0, skirt_d, 0)
		var p_rb := p_r - Vector3(0, skirt_d, 0)
		ring_p.append([p_l, p_r, p_lb, p_rb, dist_acc * 0.1])

	for i in range(1, ring_p.size()):
		var a := ring_p[i - 1]
		var b := ring_p[i]
		var va: float = a[4]
		var vb: float = b[4]
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[1])
		st.set_uv(Vector2(1, va)); st.add_vertex(a[1])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[1])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		st.set_uv(Vector2(1, va)); st.add_vertex(a[1])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[3])
		st.set_uv(Vector2(1, va)); st.add_vertex(a[3])
		st.set_uv(Vector2(1, va)); st.add_vertex(a[1])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[1])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[3])

	st.generate_normals()
	return st.commit()

func _build_suspension_bridge(net: RoadNetwork, seg: Dictionary, spec: Dictionary) -> void:
	var total_w: float = spec["asphalt_w"] + spec["sidewalk_w"] * 2.0
	var hw: float = total_w * 0.5
	var tops_l: Array[Vector3] = []
	var tops_r: Array[Vector3] = []

	for t in [0.27, 0.73]:
		var c := net.sample_pos(seg, t)
		var tan_v := net.sample_tangent(seg, t)
		var r := net.sample_right(seg, t)
		var yaw := atan2(tan_v.x, tan_v.z)
		var gy := TerrainField.sample_height(c.x, c.z)
		var pier_h := maxf(4.0, c.y - gy + 2.0)

		# Stepped concrete bridge pier & waterline collar
		_spawn_box(roads_root, Vector3(c.x, gy + pier_h * 0.5 - 1.5, c.z), Vector3(total_w * 0.82, pier_h, 3.8), yaw, _mat_concrete)
		_spawn_box(roads_root, Vector3(c.x, TerrainField.WATER_LEVEL + 0.8, c.z), Vector3(total_w * 0.90, 2.2, 4.6), yaw, _mat_granite_dark)

		# Iconic H-Frame cross-braced steel pylons with aviation beacons
		var tower_h := 28.5
		var pl := c - r * (hw - 0.65) + Vector3(0, tower_h * 0.5, 0)
		var pr := c + r * (hw - 0.65) + Vector3(0, tower_h * 0.5, 0)
		_spawn_box(roads_root, pl, Vector3(1.25, tower_h, 1.45), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, pr, Vector3(1.25, tower_h, 1.45), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, c + Vector3(0, tower_h - 1.5, 0), Vector3(total_w, 1.20, 1.20), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, c + Vector3(0, tower_h * 0.56, 0), Vector3(total_w, 0.90, 0.95), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, c - r * (hw - 0.65) + Vector3(0, tower_h + 0.55, 0), Vector3(0.45, 0.45, 0.45), yaw, _mat_beacon_red)
		_spawn_box(roads_root, c + r * (hw - 0.65) + Vector3(0, tower_h + 0.55, 0), Vector3(0.45, 0.45, 0.45), yaw, _mat_beacon_red)

		tops_l.append(c - r * (hw - 0.65) + Vector3(0, tower_h - 0.9, 0))
		tops_r.append(c + r * (hw - 0.65) + Vector3(0, tower_h - 0.9, 0))

	if tops_l.size() == 2:
		_build_cable_span(tops_l[0], tops_l[1], 8.2, net, seg, -hw + 0.65)
		_build_cable_span(tops_r[0], tops_r[1], 8.2, net, seg, hw - 0.65)

func _build_cable_span(a: Vector3, b: Vector3, sag: float, net: RoadNetwork, seg: Dictionary, lat_off: float) -> void:
	var steps := 12
	var prev := a
	for i in range(1, steps + 1):
		var u := float(i) / float(steps)
		var cur := a.lerp(b, u)
		cur.y -= 4.0 * sag * u * (1.0 - u)
		_spawn_beam(roads_root, prev, cur, 0.44, _mat_bridge_steel)
		if i < steps:
			var t_seg := lerpf(0.27, 0.73, u)
			var deck_p := net.sample_pos(seg, t_seg) + net.sample_right(seg, t_seg) * lat_off
			if cur.y > deck_p.y + 1.0:
				_spawn_beam(roads_root, cur, deck_p, 0.16, _mat_bridge_steel)
		prev = cur

func _build_streetlamps(net: RoadNetwork, seg: Dictionary, spec: Dictionary, t_start: float, t_end: float) -> void:
	var usable_len: float = seg["length"] * (t_end - t_start)
	var count := maxi(1, int(floor(usable_len / 28.0)))
	var side_off: float = spec["asphalt_w"] * 0.5 + spec["sidewalk_w"] * 0.58
	var is_four: bool = (seg["type"] == RoadNetwork.RoadType.FOUR_LANE)

	for i in range(1, count):
		var t := lerpf(t_start, t_end, float(i) / float(count))
		var c := net.sample_pos(seg, t)
		c.y = maxf(c.y, TerrainField.sample_height(c.x, c.z) + 0.30)
		var r := net.sample_right(seg, t)
		var tan_v := net.sample_tangent(seg, t)
		var yaw := atan2(tan_v.x, tan_v.z)

		_spawn_arched_lamp(c + r * side_off, -r, yaw)
		if is_four:
			_spawn_arched_lamp(c - r * side_off, r, yaw)

		# Neat Boulevard Street Trees tucked neatly between lamps on 4-lane avenues!
		if is_four and i % 2 == 1:
			var tp := c + r * (side_off + 0.75)
			_spawn_street_tree(tp)
			_spawn_street_tree(c - r * (side_off + 0.75))

func _spawn_arched_lamp(base_pos: Vector3, inward: Vector3, yaw: float) -> void:
	var pole := _make_cyl(0.09, 0.16, 7.4)
	var pn := _add_mesh_node(roads_root, "LampPole", pole, _mat_aluminum)
	pn.position = base_pos + Vector3(0, 3.7, 0)
	_spawn_box(roads_root, base_pos + Vector3(0, 0.4, 0), Vector3(0.42, 0.8, 0.42), yaw, _mat_granite_dark)
	_spawn_beam(roads_root, base_pos + Vector3(0, 7.25, 0), base_pos + Vector3(0, 7.65, 0) + inward * 1.9, 0.14, _mat_aluminum)
	_spawn_box(roads_root, base_pos + Vector3(0, 7.55, 0) + inward * 1.95, Vector3(0.55, 0.18, 0.90), yaw, _mat_lamp_glow)

func _spawn_street_tree(pos: Vector3) -> void:
	_spawn_box(roads_root, pos + Vector3(0, 0.18, 0), Vector3(1.5, 0.32, 1.5), 0.0, _mat_granite_dark)
	var tr := _add_mesh_node(roads_root, "StTreeTrk", _make_cyl(0.14, 0.22, 2.4), _mat_trunk)
	tr.position = pos + Vector3(0, 1.2, 0)
	var sp := SphereMesh.new(); sp.radius = 1.65; sp.height = 2.9; sp.radial_segments = 8; sp.rings = 5
	var cn := _add_mesh_node(roads_root, "StTreeCan", sp, _mat_street_tree)
	cn.position = pos + Vector3(0, 3.3, 0)

func _build_all_buildings(sim: CitySimulation) -> void:
	for b in sim.buildings:
		var root := Node3D.new()
		root.position = b["pos"]
		root.rotation.y = b["yaw"]
		buildings_root.add_child(root)

		var w: float = b["w"]
		var d: float = b["d"]
		var h: float = b["h"]
		var btype: String = b["type"]
		var style: int = b["style"]

		# Beveled urban granite/concrete plaza foundation pad flush with ground
		_spawn_box(root, Vector3(0, 0.16, 0), Vector3(w + 2.6, 0.56, d + 2.6), 0.0, _mat_concrete)

		match btype:
			"park":
				_build_park_detail(root, w, d)
				continue
			"wind":
				_build_wind_turbine_detail(root)
				continue
			"solar":
				_build_solar_farm_detail(root, w, d)
				continue
			"water":
				_build_water_station_detail(root, w, d)
				continue
			"hospital":
				_build_hospital_detail(root, w, d, h)
				continue
			"fire":
				_build_fire_station_detail(root, w, d, h)
				continue
			"police":
				_build_police_hq_detail(root, w, d, h)
				continue
			"university", "school":
				_build_campus_detail(root, w, d, h, btype == "university")
				continue
			"ind":
				_build_factory_detail(root, w, d, h, style)
				continue

		var fmat: Material = _pick_facade_mat(b)
		if h > 22.0:
			if btype == "res_high":
				_build_apartment_tower(root, w, d, h, fmat, style)
			else:
				_build_skyscraper_detail(root, w, d, h, fmat, btype, b["level"], style)
		elif btype == "res_low":
			_build_house_detail(root, w, d, h, fmat, style)
		else:
			_build_low_shop_detail(root, w, d, h, fmat, style)

func _build_skyscraper_detail(root: Node3D, w: float, d: float, h: float, fmat: Material, btype: String, lvl: int, style: int) -> void:
	var variant: int = 0 if btype == "landmark" else (style % 4)
	var pod_h: float = minf(9.0, h * 0.22)

	# 1. Ground-floor dark granite podium + glass lobby entrance vestibule & cantilevered canopy
	_spawn_box(root, Vector3(0, 1.8, 0), Vector3(w + 0.5, 3.6, d + 0.5), 0.0, _mat_granite_dark)
	_spawn_box(root, Vector3(0, pod_h * 0.5 + 1.2, 0), Vector3(w, pod_h - 1.2, d), 0.0, fmat)
	_spawn_box(root, Vector3(0, pod_h + 0.45, 0), Vector3(w + 1.2, 0.85, d + 1.2), 0.0, _mat_concrete)
	# Cantilevered glass/steel lobby canopy + entrance frame
	_spawn_box(root, Vector3(0, 4.1, d * 0.5 + 1.1), Vector3(w * 0.46, 0.32, 2.4), 0.0, _mat_aluminum)
	_spawn_box(root, Vector3(0, 2.0, d * 0.5 + 0.35), Vector3(w * 0.36, 3.8, 0.6), 0.0, _mat_glass_blue)

	# 2. Architectural Silhouette by Style
	if variant == 0:
		# Art-Deco / Iconic Stepped Setback Spire Tower
		var s1_h := h * 0.48
		_spawn_box(root, Vector3(0, pod_h + s1_h * 0.5, 0), Vector3(w * 0.86, s1_h, d * 0.86), 0.0, fmat)
		_spawn_corner_pilasters(root, w * 0.86, d * 0.86, pod_h, s1_h, _mat_aluminum)
		_spawn_box(root, Vector3(0, pod_h + s1_h + 0.35, 0), Vector3(w * 0.92, 0.72, d * 0.92), 0.0, _mat_concrete)

		var s2_h := maxf(6.0, h - pod_h - s1_h)
		_spawn_box(root, Vector3(0, pod_h + s1_h + s2_h * 0.5, 0), Vector3(w * 0.64, s2_h, d * 0.64), 0.0, fmat)
		_spawn_box(root, Vector3(0, h + 0.45, 0), Vector3(w * 0.68, 0.85, d * 0.68), 0.0, _mat_aluminum)
		_spawn_box(root, Vector3(0, h + 2.1, 0), Vector3(w * 0.38, 2.6, d * 0.38), 0.0, _mat_granite_dark)
		_spawn_rooftop_hvac(root, w * 0.62, d * 0.62, h + 0.9)

		var spire_h := 24.0 if btype == "landmark" else 16.0
		var spire := _add_mesh_node(root, "Spire", _make_cyl(0.10, 0.52, spire_h), _mat_bridge_steel)
		spire.position = Vector3(0, h + 3.0 + spire_h * 0.5, 0)
		_spawn_box(root, Vector3(0, h + 3.2 + spire_h, 0), Vector3(0.45, 0.45, 0.45), 0.0, _mat_beacon_red)

	elif variant == 1:
		# Modern Twin-Wing Offset Glass Tower + Rooftop Helipad!
		var main_h := h - pod_h
		_spawn_box(root, Vector3(-w * 0.10, pod_h + main_h * 0.5, -d * 0.06), Vector3(w * 0.72, main_h, d * 0.76), 0.0, fmat)
		var wing_h := main_h * 0.72
		_spawn_box(root, Vector3(w * 0.24, pod_h + wing_h * 0.5, d * 0.14), Vector3(w * 0.44, wing_h, d * 0.56), 0.0, _mat_glass_emerald)
		_spawn_box(root, Vector3(w * 0.24, pod_h + wing_h + 0.4, d * 0.14), Vector3(w * 0.48, 0.8, d * 0.60), 0.0, _mat_aluminum)
		_spawn_corner_pilasters(root, w * 0.72, d * 0.76, pod_h, main_h, _mat_aluminum, Vector3(-w * 0.10, 0, -d * 0.06))
		# Rooftop Helipad with H-Marking on Main Roof!
		_spawn_helipad(root, Vector3(-w * 0.10, h + 0.28, -d * 0.06), minf(w, d) * 0.26)

	elif variant == 2:
		# Corporate Sloped-Crown Tower with Mechanical Penthouse & Comms Dish
		var shaft_h := h - pod_h - 5.5
		_spawn_box(root, Vector3(0, pod_h + shaft_h * 0.5, 0), Vector3(w * 0.84, shaft_h, d * 0.84), 0.0, fmat)
		_spawn_corner_pilasters(root, w * 0.84, d * 0.84, pod_h, shaft_h, _mat_granite_dark)
		var crown_prism := PrismMesh.new()
		crown_prism.left_to_right = 0.25
		crown_prism.size = Vector3(w * 0.84, 5.8, d * 0.84)
		var cn := _add_mesh_node(root, "SlopedCrown", crown_prism, fmat)
		cn.position = Vector3(0, pod_h + shaft_h + 2.9, 0)
		_spawn_box(root, Vector3(w * 0.16, pod_h + shaft_h + 1.8, -d * 0.14), Vector3(w * 0.30, 3.2, d * 0.30), 0.0, _mat_roof_dark)
		var mast := _add_mesh_node(root, "CommsMast", _make_cyl(0.08, 0.22, 10.0), _mat_aluminum)
		mast.position = Vector3(-w * 0.18, pod_h + shaft_h + 8.5, 0)

	else:
		# Financial Curtain-Wall Tower with Mid-Tower Louver Band & Cantilevered Roof
		var mid_y := pod_h + (h - pod_h) * 0.52
		var lower_h := mid_y - pod_h
		var upper_h := h - mid_y - 2.6
		_spawn_box(root, Vector3(0, pod_h + lower_h * 0.5, 0), Vector3(w * 0.86, lower_h, d * 0.86), 0.0, fmat)
		# Dark recessed mechanical floor louver band
		_spawn_box(root, Vector3(0, mid_y + 1.3, 0), Vector3(w * 0.82, 2.6, d * 0.82), 0.0, _mat_granite_dark)
		_spawn_box(root, Vector3(0, mid_y + 2.6 + upper_h * 0.5, 0), Vector3(w * 0.84, upper_h, d * 0.84), 0.0, fmat)
		_spawn_corner_pilasters(root, w * 0.86, d * 0.86, pod_h, h - pod_h, _mat_aluminum)
		# Cantilevered roof cornice & HVAC chiller bank
		_spawn_box(root, Vector3(0, h + 0.5, 0), Vector3(w * 0.94, 1.0, d * 0.94), 0.0, _mat_concrete)
		_spawn_rooftop_hvac(root, w * 0.78, d * 0.78, h + 1.0)
		if lvl >= 4:
			for sx in [-w * 0.22, w * 0.22]:
				var ant := _add_mesh_node(root, "Ant", _make_cyl(0.06, 0.16, 11.0), _mat_aluminum)
				ant.position = Vector3(sx, h + 6.5, -d * 0.18)

func _build_apartment_tower(root: Node3D, w: float, d: float, h: float, fmat: Material, style: int) -> void:
	var pod_h := 4.8
	_spawn_box(root, Vector3(0, pod_h * 0.5, 0), Vector3(w * 0.94, pod_h, d * 0.94), 0.0, _mat_granite_dark)
	_spawn_box(root, Vector3(0, pod_h + 0.3, 0), Vector3(w, 0.6, d), 0.0, _mat_concrete)
	var body_h := h - pod_h
	_spawn_box(root, Vector3(0, pod_h + body_h * 0.5, 0), Vector3(w * 0.84, body_h, d * 0.84), 0.0, fmat)

	# Projecting Horizontal Balcony Slabs every ~7m!
	var step_y := 7.2
	var y_cur := pod_h + 5.2
	var side_flip := style % 2
	while y_cur < h - 3.0:
		var bw := w * 0.52
		var off_x := (w * 0.14) if (side_flip % 2 == 0) else (-w * 0.14)
		_spawn_box(root, Vector3(off_x, y_cur, d * 0.45), Vector3(bw, 0.42, 1.45), 0.0, _mat_concrete)
		_spawn_box(root, Vector3(-off_x, y_cur, -d * 0.45), Vector3(bw, 0.42, 1.45), 0.0, _mat_concrete)
		y_cur += step_y
		side_flip += 1

	# Rooftop parapet, stairwell penthouse & cylindrical rooftop water tank
	_spawn_box(root, Vector3(0, h + 0.45, 0), Vector3(w * 0.88, 0.9, d * 0.88), 0.0, _mat_concrete)
	_spawn_box(root, Vector3(-w * 0.16, h + 1.9, -d * 0.12), Vector3(w * 0.34, 2.8, d * 0.32), 0.0, _mat_roof_dark)
	var tank := _add_mesh_node(root, "RoofTank", _make_cyl(1.15, 1.15, 2.6), _mat_aluminum)
	tank.position = Vector3(w * 0.20, h + 2.2, d * 0.14)

func _build_house_detail(root: Node3D, w: float, d: float, h: float, fmat: Material, style: int) -> void:
	# Front & backyard lawn strip
	_spawn_box(root, Vector3(0, 0.28, 0), Vector3(w + 1.4, 0.20, d + 1.4), 0.0, _mat_park_turf)
	_spawn_box(root, Vector3(0, h * 0.5 + 0.25, 0), Vector3(w * 0.78, h, d * 0.76), 0.0, fmat)
	# Overhanging Gabled Pitched Roof + Brick Chimney!
	var roof := PrismMesh.new()
	roof.size = Vector3(w * 0.88, 3.4, d * 0.86)
	var roof_mat: Material = _mat_terracotta if (style % 3 == 0) else _mat_roof_dark
	var rn := _add_mesh_node(root, "GableRoof", roof, roof_mat)
	rn.position = Vector3(0, h + 1.9, 0)
	_spawn_box(root, Vector3(w * 0.22, h + 2.6, -d * 0.15), Vector3(0.95, 2.8, 0.95), 0.0, _mat_red_accent)
	# Front Porch Awning & Steps
	_spawn_box(root, Vector3(0, 3.0, d * 0.43), Vector3(w * 0.38, 0.28, 1.6), 0.0, _mat_wood_bench)
	_spawn_box(root, Vector3(0, 0.45, d * 0.44), Vector3(w * 0.34, 0.45, 1.3), 0.0, _mat_concrete)

func _build_low_shop_detail(root: Node3D, w: float, d: float, h: float, fmat: Material, style: int) -> void:
	_spawn_box(root, Vector3(0, h * 0.5, 0), Vector3(w * 0.88, h, d * 0.88), 0.0, fmat)
	_spawn_box(root, Vector3(0, h + 0.45, 0), Vector3(w * 0.92, 0.9, d * 0.92), 0.0, _mat_concrete)
	# Colorful Sloped Storefront Awning!
	var aw_mat: StandardMaterial3D = _mat_awnings[style % _mat_awnings.size()]
	var aw := _spawn_box(root, Vector3(0, 3.3, d * 0.48), Vector3(w * 0.78, 0.26, 1.85), 0.0, aw_mat)
	aw.rotation.x = 0.32
	# Rooftop AC Chiller Unit
	_spawn_box(root, Vector3(w * 0.22, h + 1.35, -d * 0.16), Vector3(2.2, 1.3, 1.8), 0.0, _mat_aluminum)

func _build_factory_detail(root: Node3D, w: float, d: float, h: float, style: int) -> void:
	var hall_h := maxf(8.5, h * 0.78)
	_spawn_box(root, Vector3(-w * 0.08, hall_h * 0.5, 0), Vector3(w * 0.76, hall_h, d * 0.84), 0.0, _mat_industrial)
	# 3-Bay Sawtooth Factory Roof Skylights
	for k in range(-1, 2):
		var saw := PrismMesh.new()
		saw.left_to_right = 0.18
		saw.size = Vector3(w * 0.76, 2.6, d * 0.26)
		var sn := _add_mesh_node(root, "SawRoof", saw, _mat_roof_dark)
		sn.position = Vector3(-w * 0.08, hall_h + 1.3, k * d * 0.27)
	# Tall Tapered Industrial Smokestack with Red & White Safety Bands!
	var stack_h := hall_h + 15.0 + float(style % 3) * 3.0
	var stack_x := w * 0.34
	var stack := _add_mesh_node(root, "Smokestack", _make_cyl(0.85, 1.45, stack_h), _mat_concrete)
	stack.position = Vector3(stack_x, stack_h * 0.5, -d * 0.28)
	var band := _add_mesh_node(root, "StackBand", _make_cyl(0.95, 1.02, 2.4), _mat_red_accent)
	band.position = Vector3(stack_x, stack_h - 3.2, -d * 0.28)
	# Twin Metallic Storage Silos + Connecting Pipe
	for sz in [0.08, 0.30]:
		var silo := _add_mesh_node(root, "Silo", _make_cyl(2.1, 2.1, hall_h * 0.85), _mat_aluminum)
		silo.position = Vector3(w * 0.34, hall_h * 0.425, d * sz)
	_spawn_beam(root, Vector3(w * 0.28, hall_h * 0.72, d * 0.08), Vector3(w * 0.12, hall_h * 0.72, d * 0.08), 0.45, _mat_aluminum)

func _build_water_station_detail(root: Node3D, w: float, d: float) -> void:
	# Concrete riverfront deck + blue-roofed control station + dual turquoise filtration tanks + steel pipes!
	_spawn_box(root, Vector3(-w * 0.22, 3.6, -d * 0.12), Vector3(w * 0.44, 7.2, d * 0.62), 0.0, _mat_stone_white)
	var roof := PrismMesh.new(); roof.size = Vector3(w * 0.48, 2.4, d * 0.68)
	var rn := _add_mesh_node(root, "PumpRoof", roof, _mat_blue_accent)
	rn.position = Vector3(-w * 0.22, 8.4, -d * 0.12)
	# Dual Cylindrical Blue Filtration Tanks
	for tz in [-d * 0.22, d * 0.20]:
		var tk := _add_mesh_node(root, "WaterTank", _make_cyl(3.2, 3.2, 6.2), _mat_water_blue)
		tk.position = Vector3(w * 0.22, 3.3, tz)
		var cap := _add_mesh_node(root, "TankCap", _make_cyl(2.2, 3.25, 0.9), _mat_aluminum)
		cap.position = Vector3(w * 0.22, 6.85, tz)
	# Overhead Steel Intake Pipe Manifold
	_spawn_beam(root, Vector3(-w * 0.05, 5.2, -d * 0.22), Vector3(w * 0.22, 5.2, -d * 0.22), 0.52, _mat_aluminum)
	_spawn_beam(root, Vector3(-w * 0.05, 5.2, d * 0.20), Vector3(w * 0.22, 5.2, d * 0.20), 0.52, _mat_aluminum)

func _build_hospital_detail(root: Node3D, w: float, d: float, h: float) -> void:
	_spawn_box(root, Vector3(0, h * 0.28, 0), Vector3(w * 0.94, h * 0.56, d * 0.88), 0.0, _mat_stone_white)
	_spawn_box(root, Vector3(-w * 0.10, h * 0.68, -d * 0.08), Vector3(w * 0.64, h * 0.64, d * 0.62), 0.0, _mat_stone_white)
	# Blue Glass Medical Atrium + Ambulance Canopy
	_spawn_box(root, Vector3(w * 0.24, 5.2, d * 0.30), Vector3(w * 0.34, 10.0, d * 0.36), 0.0, _mat_glass_blue)
	_spawn_box(root, Vector3(w * 0.24, 3.6, d * 0.52), Vector3(w * 0.36, 0.38, 2.8), 0.0, _mat_aluminum)
	# Bold Red Cross Medical Emblem on Upper Facade
	_spawn_box(root, Vector3(-w * 0.10, h * 0.82, d * 0.24), Vector3(3.4, 0.95, 0.32), 0.0, _mat_red_accent)
	_spawn_box(root, Vector3(-w * 0.10, h * 0.82, d * 0.24), Vector3(0.95, 3.4, 0.32), 0.0, _mat_red_accent)
	# Rooftop Medical Helipad
	_spawn_helipad(root, Vector3(-w * 0.10, h + 0.30, -d * 0.08), 4.6)

func _build_fire_station_detail(root: Node3D, w: float, d: float, h: float) -> void:
	_spawn_box(root, Vector3(-w * 0.08, h * 0.48, 0), Vector3(w * 0.80, h * 0.96, d * 0.84), 0.0, _mat_brick_red)
	_spawn_box(root, Vector3(-w * 0.08, h * 0.98, 0), Vector3(w * 0.84, 0.8, d * 0.88), 0.0, _mat_concrete)
	# Three Recessed Fire Engine Garage Bays
	for gx in [-w * 0.30, -w * 0.08, w * 0.14]:
		_spawn_box(root, Vector3(gx, 2.4, d * 0.43), Vector3(w * 0.17, 4.4, 0.38), 0.0, _mat_granite_dark)
		_spawn_box(root, Vector3(gx, 4.75, d * 0.44), Vector3(w * 0.19, 0.35, 0.45), 0.0, _mat_red_accent)
	# Hose-Drying Watch Tower + Red Emergency Beacon
	var tw_h := h + 7.5
	_spawn_box(root, Vector3(w * 0.32, tw_h * 0.5, -d * 0.24), Vector3(4.2, tw_h, 4.2), 0.0, _mat_brick_red)
	_spawn_box(root, Vector3(w * 0.32, tw_h + 0.45, -d * 0.24), Vector3(0.7, 0.7, 0.7), 0.0, _mat_beacon_red)

func _build_police_hq_detail(root: Node3D, w: float, d: float, h: float) -> void:
	_spawn_box(root, Vector3(0, h * 0.5, 0), Vector3(w * 0.88, h, d * 0.84), 0.0, _mat_stone_white)
	_spawn_box(root, Vector3(0, h + 0.4, 0), Vector3(w * 0.92, 0.85, d * 0.88), 0.0, _mat_granite_dark)
	# Authoritative Blue Trim Sign Band & Entrance Portico Columns
	_spawn_box(root, Vector3(0, 4.4, d * 0.44), Vector3(w * 0.56, 0.95, 0.45), 0.0, _mat_blue_accent)
	for cx in [-w * 0.20, 0.0, w * 0.20]:
		var col := _add_mesh_node(root, "Col", _make_cyl(0.32, 0.36, 4.2), _mat_concrete)
		col.position = Vector3(cx, 2.1, d * 0.46)
	# Rooftop Police Radio Comms Mast
	var mast := _add_mesh_node(root, "RadioMast", _make_cyl(0.10, 0.28, 9.5), _mat_aluminum)
	mast.position = Vector3(w * 0.24, h + 5.2, -d * 0.18)

func _build_campus_detail(root: Node3D, w: float, d: float, h: float, is_uni: bool) -> void:
	_spawn_box(root, Vector3(0, 0.28, 0), Vector3(w + 1.4, 0.22, d + 1.4), 0.0, _mat_park_turf)
	var mat := _mat_brick_red if is_uni else _mat_terracotta
	# Main Academic Hall + Twin Campus Wings
	_spawn_box(root, Vector3(0, h * 0.44, -d * 0.16), Vector3(w * 0.86, h * 0.88, d * 0.42), 0.0, mat)
	_spawn_box(root, Vector3(-w * 0.30, h * 0.36, d * 0.18), Vector3(w * 0.26, h * 0.72, d * 0.46), 0.0, mat)
	_spawn_box(root, Vector3(w * 0.30, h * 0.36, d * 0.18), Vector3(w * 0.26, h * 0.72, d * 0.46), 0.0, mat)
	# Pitched Main Roof
	var mr := PrismMesh.new(); mr.size = Vector3(w * 0.90, 3.2, d * 0.46)
	var mn := _add_mesh_node(root, "CampusRoof", mr, _mat_roof_dark)
	mn.position = Vector3(0, h * 0.88 + 1.6, -d * 0.16)
	# Iconic Central Clock Tower with Pointed Spire!
	var tw_h := h + (12.0 if is_uni else 6.5)
	_spawn_box(root, Vector3(0, tw_h * 0.5, -d * 0.16), Vector3(4.6, tw_h, 4.6), 0.0, _mat_stone_white)
	var sp := _add_mesh_node(root, "ClockSpire", _make_cone(2.8, 6.2), _mat_roof_dark)
	sp.position = Vector3(0, tw_h + 3.1, -d * 0.16)
	# Courtyard Flagpole
	var fp := _add_mesh_node(root, "Flagpole", _make_cyl(0.08, 0.12, 9.0), _mat_aluminum)
	fp.position = Vector3(0, 4.5, d * 0.26)
	_spawn_box(root, Vector3(0.95, 8.2, d * 0.26), Vector3(1.8, 1.1, 0.10), 0.0, _mat_blue_accent)

func _build_park_detail(root: Node3D, w: float, d: float) -> void:
	_spawn_box(root, Vector3(0, 0.36, 0), Vector3(w, 0.26, d), 0.0, _mat_park_turf)
	# Cross-Shaped Paved Stone Walkways
	_spawn_box(root, Vector3(0, 0.51, 0), Vector3(w, 0.08, 2.8), 0.0, _mat_sidewalk)
	_spawn_box(root, Vector3(0, 0.51, 0), Vector3(2.8, 0.08, d), 0.0, _mat_sidewalk)
	# Two-Tier Central Stone Fountain with Turquoise Water Basin!
	var f_rim := _add_mesh_node(root, "FountainRim", _make_cyl(3.4, 3.7, 0.85), _mat_concrete)
	f_rim.position = Vector3(0, 0.82, 0)
	var f_wat := _add_mesh_node(root, "FountainWater", _make_cyl(2.95, 2.95, 0.25), _mat_water_blue)
	f_wat.position = Vector3(0, 1.18, 0)
	var f_ped := _add_mesh_node(root, "FountainPed", _make_cyl(0.65, 0.95, 2.1), _mat_concrete)
	f_ped.position = Vector3(0, 1.85, 0)
	var f_bowl := _add_mesh_node(root, "FountainBowl", _make_cyl(1.45, 0.55, 0.55), _mat_concrete)
	f_bowl.position = Vector3(0, 2.65, 0)
	# 4 Wooden Park Benches + 4 Lush Ornamental Trees + 2 Glowing Park Lamps
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_spawn_box(root, Vector3(sx * 4.8, 0.92, sz * 2.4), Vector3(1.9, 0.45, 0.65), 0.0, _mat_wood_bench)
			var tx: float = float(sx) * (w * 0.34)
			var tz: float = float(sz) * (d * 0.34)
			var tr := _add_mesh_node(root, "ParkTrk", _make_cyl(0.22, 0.34, 3.0), _mat_trunk)
			tr.position = Vector3(tx, 1.8, tz)
			var sp := SphereMesh.new(); sp.radius = 2.4; sp.height = 4.0; sp.radial_segments = 9; sp.rings = 5
			var cn := _add_mesh_node(root, "ParkCan", sp, _mat_street_tree)
			cn.position = Vector3(tx, 4.4, tz)
	for lx in [-w * 0.26, w * 0.26]:
		var lp := _add_mesh_node(root, "ParkLamp", _make_cyl(0.08, 0.12, 4.4), _mat_granite_dark)
		lp.position = Vector3(lx, 2.5, 2.2)
		var lb := SphereMesh.new(); lb.radius = 0.34; lb.height = 0.68
		var lbn := _add_mesh_node(root, "ParkBulb", lb, _mat_lamp_glow)
		lbn.position = Vector3(lx, 4.85, 2.2)

func _build_wind_turbine_detail(root: Node3D) -> void:
	var base := _add_mesh_node(root, "TurbBase", _make_cyl(2.6, 3.2, 1.2), _mat_concrete)
	base.position = Vector3(0, 0.6, 0)
	var mast := _add_mesh_node(root, "Mast", _make_cyl(0.55, 1.25, 40.0), _mat_bridge_steel)
	mast.position = Vector3(0, 20.5, 0)
	var band := _add_mesh_node(root, "SafetyBand", _make_cyl(0.75, 0.80, 2.2), _mat_red_accent)
	band.position = Vector3(0, 28.0, 0)
	_spawn_box(root, Vector3(0, 40.8, 0.9), Vector3(2.0, 2.0, 4.8), 0.0, _mat_bridge_steel)
	_spawn_box(root, Vector3(0, 42.1, -0.8), Vector3(0.45, 0.45, 0.45), 0.0, _mat_beacon_red)
	var nose := _add_mesh_node(root, "Nose", _make_cone(1.0, 2.2), _mat_bridge_steel)
	nose.position = Vector3(0, 40.8, 3.8); nose.rotation.x = PI * 0.5
	var hub := Node3D.new(); hub.position = Vector3(0, 40.8, 3.5); root.add_child(hub)
	for k in range(3):
		var blade_p := Node3D.new(); blade_p.rotation.z = k * (TAU / 3.0); hub.add_child(blade_p)
		_spawn_box(blade_p, Vector3(0, 7.6, 0), Vector3(0.72, 15.2, 0.22), 0.0, _mat_bridge_steel)
		_spawn_box(blade_p, Vector3(0, 14.4, 0), Vector3(0.48, 2.2, 0.24), 0.0, _mat_red_accent)
	_wind_rotors.append(hub)

func _build_solar_farm_detail(root: Node3D, w: float, d: float) -> void:
	# Transformer substation cabin
	_spawn_box(root, Vector3(-w * 0.36, 1.8, -d * 0.32), Vector3(4.2, 3.2, 3.6), 0.0, _mat_industrial)
	for rx in [-6.8, 0.5, 7.8]:
		for rz in [-6.2, 0.4, 7.0]:
			if rx < -4.0 and rz < -3.0:
				continue
			_spawn_box(root, Vector3(rx, 1.25, rz), Vector3(0.35, 2.2, 0.35), 0.0, _mat_aluminum)
			var frame := _spawn_box(root, Vector3(rx, 2.35, rz), Vector3(6.4, 0.16, 4.9), 0.0, _mat_aluminum)
			frame.rotation.x = 0.32
			var panel := _spawn_box(root, Vector3(rx, 2.48, rz), Vector3(6.1, 0.14, 4.6), 0.0, _mat_solar)
			panel.rotation.x = 0.32

func _spawn_corner_pilasters(root: Node3D, w: float, d: float, base_y: float, h: float, mat: Material, off := Vector3.ZERO) -> void:
	for sx in [-0.5, 0.5]:
		for sz in [-0.5, 0.5]:
			_spawn_box(root, off + Vector3(sx * w, base_y + h * 0.5, sz * d), Vector3(0.85, h, 0.85), 0.0, mat)

func _spawn_rooftop_hvac(root: Node3D, w: float, d: float, y: float) -> void:
	_spawn_box(root, Vector3(w * 0.20, y + 0.85, d * 0.16), Vector3(2.8, 1.6, 2.2), 0.0, _mat_aluminum)
	_spawn_box(root, Vector3(-w * 0.22, y + 0.65, -d * 0.18), Vector3(2.2, 1.2, 1.8), 0.0, _mat_aluminum)
	var fan := _add_mesh_node(root, "ChillerFan", _make_cyl(0.82, 0.82, 0.35), _mat_granite_dark)
	fan.position = Vector3(w * 0.20, y + 1.72, d * 0.16)

func _spawn_helipad(root: Node3D, pos: Vector3, r: float) -> void:
	var pad := _add_mesh_node(root, "HeliPad", _make_cyl(r, r + 0.2, 0.42), _mat_granite_dark)
	pad.position = pos
	var ring := _add_mesh_node(root, "HeliRing", _make_cyl(r * 0.84, r * 0.84, 0.46), _mat_white_mark)
	ring.position = pos + Vector3(0, 0.01, 0)
	var inner := _add_mesh_node(root, "HeliInner", _make_cyl(r * 0.72, r * 0.72, 0.48), _mat_granite_dark)
	inner.position = pos + Vector3(0, 0.02, 0)
	# Crisp White 'H' Helipad Crossbar
	_spawn_box(root, pos + Vector3(-r * 0.26, 0.28, 0), Vector3(r * 0.16, 0.08, r * 0.86), 0.0, _mat_white_mark)
	_spawn_box(root, pos + Vector3(r * 0.26, 0.28, 0), Vector3(r * 0.16, 0.08, r * 0.86), 0.0, _mat_white_mark)
	_spawn_box(root, pos + Vector3(0, 0.28, 0), Vector3(r * 0.56, 0.08, r * 0.16), 0.0, _mat_white_mark)

func _build_valley_forest(sim: CitySimulation) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 9091
	var pine_transforms: Array[Transform3D] = []
	var pine_colors: Array[Color] = []
	var oak_transforms: Array[Transform3D] = []
	var oak_colors: Array[Color] = []

	var attempts := 0
	while (pine_transforms.size() + oak_transforms.size()) < 4200 and attempts < 18000:
		attempts += 1
		var x := rng.randf_range(220.0, TerrainField.WORLD_SIZE - 220.0)
		var z := rng.randf_range(220.0, TerrainField.WORLD_SIZE - 460.0)
		var y := TerrainField.sample_height(x, z)
		if y < TerrainField.WATER_LEVEL + 1.5 or y > 118.0:
			continue
		var grove_n := sin(x * 0.0042) * cos(z * 0.0045) + sin((x + z) * 0.008) * 0.5
		if y < 38.0 and grove_n < -0.25:
			continue

		var blocked := false
		for b in sim.buildings:
			var bp: Vector3 = b["pos"]
			if (bp.x - x) * (bp.x - x) + (bp.z - z) * (bp.z - z) < 26.0 * 26.0:
				blocked = true; break
		if blocked:
			continue
		for seg in sim.roads.segments.values():
			for t in [0.15, 0.38, 0.62, 0.85]:
				var rp := sim.roads.sample_pos(seg, t)
				if (rp.x - x) * (rp.x - x) + (rp.z - z) * (rp.z - z) < 28.0 * 28.0:
					blocked = true; break
			if blocked:
				break
		if blocked:
			continue

		var sc := rng.randf_range(0.92, 1.92)
		var tilt_x := rng.randf_range(-0.04, 0.04)
		var tilt_z := rng.randf_range(-0.04, 0.04)
		var b_xf := Basis(Vector3.UP, rng.randf_range(0.0, TAU)) * Basis(Vector3.RIGHT, tilt_x) * Basis(Vector3.FORWARD, tilt_z)
		var xf := Transform3D(b_xf.scaled(Vector3(sc, sc * rng.randf_range(0.92, 1.15), sc)), Vector3(x, y - 0.35, z))
		if y > 30.0 or rng.randf() < 0.68:
			pine_transforms.append(xf)
			pine_colors.append(PINE_PALETTE[rng.randi() % PINE_PALETTE.size()])
		else:
			oak_transforms.append(xf)
			oak_colors.append(OAK_PALETTE[rng.randi() % OAK_PALETTE.size()])

	# 4-Tier Organic Conifer Spruces with per-instance botanical color variation!
	_spawn_forest_multimesh("PineTrunks", _make_cyl(0.38, 0.68, 4.8), _mat_trunk, pine_transforms, [], Vector3(0, 2.4, 0))
	_spawn_forest_multimesh("PineTier1", _make_cone(4.0, 5.6), _mat_pine, pine_transforms, pine_colors, Vector3(0, 5.0, 0), 0.0)
	_spawn_forest_multimesh("PineTier2", _make_cone(3.2, 5.0), _mat_pine, pine_transforms, pine_colors, Vector3(0.15, 7.9, -0.10), 0.7)
	_spawn_forest_multimesh("PineTier3", _make_cone(2.3, 4.4), _mat_pine, pine_transforms, pine_colors, Vector3(-0.12, 10.6, 0.12), 1.4)
	_spawn_forest_multimesh("PineTier4", _make_cone(1.3, 3.6), _mat_pine, pine_transforms, pine_colors, Vector3(0.06, 13.0, -0.05), 2.1)

	# Multi-Crown Organic Temperate Oaks with clustered asymmetric foliage puffs!
	_spawn_forest_multimesh("OakTrunks", _make_cyl(0.42, 0.72, 5.0), _mat_trunk, oak_transforms, [], Vector3(0, 2.5, 0))
	var sp_main := SphereMesh.new(); sp_main.radius = 3.5; sp_main.height = 5.4; sp_main.radial_segments = 9; sp_main.rings = 5
	var sp_sub := SphereMesh.new(); sp_sub.radius = 2.6; sp_sub.height = 4.2; sp_sub.radial_segments = 8; sp_sub.rings = 4
	_spawn_forest_multimesh("OakCanopyMain", sp_main, _mat_oak, oak_transforms, oak_colors, Vector3(0, 7.0, 0))
	_spawn_forest_multimesh("OakCanopySideA", sp_sub, _mat_oak, oak_transforms, oak_colors, Vector3(1.9, 6.2, 1.1))
	_spawn_forest_multimesh("OakCanopySideB", sp_sub, _mat_oak, oak_transforms, oak_colors, Vector3(-1.7, 6.4, -1.2))

func _spawn_forest_multimesh(node_name: String, mesh: Mesh, mat: Material, xfs: Array[Transform3D], cols: Array[Color], local_off: Vector3, twist_y: float = 0.0) -> void:
	if xfs.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = not cols.is_empty()
	mm.mesh = mesh
	mm.instance_count = xfs.size()
	var twist_b := Basis(Vector3.UP, twist_y)
	for i in range(xfs.size()):
		var xf := xfs[i]
		xf.origin += xf.basis * local_off
		if absf(twist_y) > 0.01:
			xf.basis = xf.basis * twist_b
		mm.set_instance_transform(i, xf)
		if mm.use_colors:
			mm.set_instance_color(i, cols[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	mmi.multimesh = mm
	mmi.material_override = mat
	forest_root.add_child(mmi)

func _init_vehicle_multimeshes() -> void:
	# 1. Painted Metallic Vehicle Chassis
	var body_mm := MultiMesh.new()
	body_mm.transform_format = MultiMesh.TRANSFORM_3D
	body_mm.use_colors = true
	body_mm.mesh = BoxMesh.new()
	body_mm.instance_count = 160
	body_mm.visible_instance_count = 0
	vehicles_body_mm = MultiMeshInstance3D.new()
	vehicles_body_mm.multimesh = body_mm
	var car_mat := StandardMaterial3D.new()
	car_mat.vertex_color_use_as_albedo = true
	car_mat.metallic = 0.58
	car_mat.roughness = 0.20
	vehicles_body_mm.material_override = car_mat
	add_child(vehicles_body_mm)

	# 2. Reflective Tinted Glass Cabins / White Cargo Containers
	var cab_mm := MultiMesh.new()
	cab_mm.transform_format = MultiMesh.TRANSFORM_3D
	cab_mm.use_colors = true
	cab_mm.mesh = BoxMesh.new()
	cab_mm.instance_count = 160
	cab_mm.visible_instance_count = 0
	vehicles_cabin_mm = MultiMeshInstance3D.new()
	vehicles_cabin_mm.multimesh = cab_mm
	var glass_mat := StandardMaterial3D.new()
	glass_mat.vertex_color_use_as_albedo = true
	glass_mat.metallic = 0.52
	glass_mat.roughness = 0.16
	vehicles_cabin_mm.material_override = glass_mat
	add_child(vehicles_cabin_mm)

	# 3. Four Rubber Tires per Vehicle (640 instances!)
	var wheel_mm := MultiMesh.new()
	wheel_mm.transform_format = MultiMesh.TRANSFORM_3D
	var w_cyl := CylinderMesh.new(); w_cyl.top_radius = 0.5; w_cyl.bottom_radius = 0.5; w_cyl.height = 1.0; w_cyl.radial_segments = 10
	wheel_mm.mesh = w_cyl
	wheel_mm.instance_count = 640
	wheel_mm.visible_instance_count = 0
	vehicles_wheels_mm = MultiMeshInstance3D.new()
	vehicles_wheels_mm.multimesh = wheel_mm
	vehicles_wheels_mm.material_override = _std_mat(Color(0.08, 0.09, 0.10), 0.88, 0.08)
	add_child(vehicles_wheels_mm)

	# 4. Warm-White Glowing Headlights
	var head_mm := MultiMesh.new()
	head_mm.transform_format = MultiMesh.TRANSFORM_3D
	head_mm.mesh = BoxMesh.new()
	head_mm.instance_count = 320
	head_mm.visible_instance_count = 0
	vehicles_head_mm = MultiMeshInstance3D.new()
	vehicles_head_mm.multimesh = head_mm
	var h_mat := _std_mat(Color(1.0, 0.96, 0.82), 0.15, 0.0)
	h_mat.emission_enabled = true; h_mat.emission = Color(1.0, 0.95, 0.78); h_mat.emission_energy_multiplier = 2.4
	vehicles_head_mm.material_override = h_mat
	vehicles_head_mm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(vehicles_head_mm)

	# 5. Ruby-Red Glowing Taillights
	var tail_mm := MultiMesh.new()
	tail_mm.transform_format = MultiMesh.TRANSFORM_3D
	tail_mm.mesh = BoxMesh.new()
	tail_mm.instance_count = 320
	tail_mm.visible_instance_count = 0
	vehicles_tail_mm = MultiMeshInstance3D.new()
	vehicles_tail_mm.multimesh = tail_mm
	var t_mat := _std_mat(Color(0.95, 0.12, 0.12), 0.18, 0.0)
	t_mat.emission_enabled = true; t_mat.emission = Color(1.0, 0.12, 0.10); t_mat.emission_energy_multiplier = 2.2
	vehicles_tail_mm.material_override = t_mat
	vehicles_tail_mm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(vehicles_tail_mm)

func _pick_facade_mat(b: Dictionary) -> Material:
	var st: int = b["style"]
	match b["type"]:
		"office", "landmark":
			if st % 3 == 0: return _mat_glass_blue
			elif st % 3 == 1: return _mat_glass_gold
			else: return _mat_glass_emerald
		"com_high":
			return _mat_glass_gold if st % 2 == 0 else _mat_glass_blue
		"res_high":
			if st % 3 == 0: return _mat_stone_white
			elif st % 3 == 1: return _mat_terracotta
			else: return _mat_brick_red
		"res_low", "com_low":
			if st % 3 == 0: return _mat_terracotta
			elif st % 3 == 1: return _mat_stone_white
			else: return _mat_brick_red
		"ind":
			return _mat_industrial
		_:
			return _mat_stone_white

func _init_materials() -> void:
	var road_sh: Shader = load("res://shaders/road_pbr.gdshader")
	_mat_road_2 = ShaderMaterial.new(); _mat_road_2.shader = road_sh; _mat_road_2.set_shader_parameter("lane_count", 2)
	_mat_road_4 = ShaderMaterial.new(); _mat_road_4.shader = road_sh; _mat_road_4.set_shader_parameter("lane_count", 4)
	_mat_road_6 = ShaderMaterial.new(); _mat_road_6.shader = road_sh; _mat_road_6.set_shader_parameter("lane_count", 6)
	var junc_sh: Shader = load("res://shaders/junction_asphalt.gdshader")
	_mat_junction = ShaderMaterial.new(); _mat_junction.shader = junc_sh

	var glass_sh: Shader = load("res://shaders/skyscraper_interior.gdshader")
	_mat_glass_blue = ShaderMaterial.new(); _mat_glass_blue.shader = glass_sh
	_mat_glass_blue.set_shader_parameter("facade_color", Color(0.80, 0.84, 0.89))
	_mat_glass_blue.set_shader_parameter("glass_tint", Color(0.28, 0.50, 0.72))
	_mat_glass_blue.set_shader_parameter("mullion_width", 0.13)

	_mat_glass_gold = ShaderMaterial.new(); _mat_glass_gold.shader = glass_sh
	_mat_glass_gold.set_shader_parameter("facade_color", Color(0.84, 0.80, 0.72))
	_mat_glass_gold.set_shader_parameter("glass_tint", Color(0.64, 0.54, 0.38))
	_mat_glass_gold.set_shader_parameter("mullion_width", 0.14)

	_mat_glass_emerald = ShaderMaterial.new(); _mat_glass_emerald.shader = glass_sh
	_mat_glass_emerald.set_shader_parameter("facade_color", Color(0.76, 0.82, 0.84))
	_mat_glass_emerald.set_shader_parameter("glass_tint", Color(0.24, 0.54, 0.56))
	_mat_glass_emerald.set_shader_parameter("mullion_width", 0.12)

	_mat_stone_white = ShaderMaterial.new(); _mat_stone_white.shader = glass_sh
	_mat_stone_white.set_shader_parameter("facade_color", Color(0.89, 0.88, 0.84))
	_mat_stone_white.set_shader_parameter("glass_tint", Color(0.38, 0.54, 0.66))
	_mat_stone_white.set_shader_parameter("mullion_width", 0.21)

	_mat_terracotta = ShaderMaterial.new(); _mat_terracotta.shader = glass_sh
	_mat_terracotta.set_shader_parameter("facade_color", Color(0.76, 0.52, 0.38))
	_mat_terracotta.set_shader_parameter("glass_tint", Color(0.40, 0.50, 0.58))
	_mat_terracotta.set_shader_parameter("mullion_width", 0.24)

	_mat_brick_red = ShaderMaterial.new(); _mat_brick_red.shader = glass_sh
	_mat_brick_red.set_shader_parameter("facade_color", Color(0.62, 0.29, 0.24))
	_mat_brick_red.set_shader_parameter("glass_tint", Color(0.36, 0.44, 0.54))
	_mat_brick_red.set_shader_parameter("mullion_width", 0.26)

	_mat_sidewalk = _std_mat(Color(0.68, 0.72, 0.76), 0.82, 0.03)
	_mat_sidewalk.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mat_bridge_steel = _std_mat(Color(0.86, 0.89, 0.93), 0.34, 0.40)
	_mat_concrete = _std_mat(Color(0.73, 0.75, 0.78), 0.84, 0.04)
	_mat_granite_dark = _std_mat(Color(0.22, 0.25, 0.30), 0.58, 0.16)
	_mat_aluminum = _std_mat(Color(0.76, 0.80, 0.85), 0.32, 0.62)
	_mat_roof_dark = _std_mat(Color(0.20, 0.23, 0.28), 0.72, 0.16)
	_mat_solar = _std_mat(Color(0.08, 0.18, 0.40), 0.12, 0.84)
	_mat_park_turf = _std_mat(Color(0.22, 0.44, 0.16), 0.88, 0.0)
	_mat_water_blue = _std_mat(Color(0.14, 0.56, 0.78), 0.12, 0.22)
	_mat_red_accent = _std_mat(Color(0.80, 0.16, 0.16), 0.42, 0.08)
	_mat_blue_accent = _std_mat(Color(0.12, 0.42, 0.78), 0.36, 0.14)
	_mat_white_mark = _std_mat(Color(0.95, 0.96, 0.98), 0.65, 0.0)
	_mat_wood_bench = _std_mat(Color(0.52, 0.32, 0.16), 0.82, 0.0)
	_mat_industrial = _std_mat(Color(0.48, 0.51, 0.55), 0.74, 0.28)
	_mat_trunk = _std_mat(Color(0.27, 0.19, 0.12), 0.94, 0.0)

	_mat_awnings = [
		_std_mat(Color(0.76, 0.18, 0.20), 0.78, 0.0),
		_std_mat(Color(0.14, 0.38, 0.68), 0.78, 0.0),
		_std_mat(Color(0.16, 0.52, 0.34), 0.78, 0.0),
		_std_mat(Color(0.82, 0.54, 0.14), 0.78, 0.0)
	]

	# Multi-tone GPU-instanced forest materials (vertex_color_use_as_albedo = true!)
	_mat_pine = _std_mat(Color(1.0, 1.0, 1.0), 0.86, 0.0)
	_mat_pine.vertex_color_use_as_albedo = true
	_mat_oak = _std_mat(Color(1.0, 1.0, 1.0), 0.84, 0.0)
	_mat_oak.vertex_color_use_as_albedo = true
	_mat_street_tree = _std_mat(Color(0.18, 0.42, 0.16), 0.84, 0.0)

	_mat_signal_green = _std_mat(Color(0.14, 0.94, 0.42), 0.2, 0.0)
	_mat_signal_green.emission_enabled = true; _mat_signal_green.emission = Color(0.14, 0.95, 0.42); _mat_signal_green.emission_energy_multiplier = 2.4
	_mat_signal_amber = _std_mat(Color(0.95, 0.68, 0.10), 0.2, 0.0)
	_mat_signal_amber.emission_enabled = true; _mat_signal_amber.emission = Color(0.98, 0.68, 0.10); _mat_signal_amber.emission_energy_multiplier = 1.1
	_mat_signal_red = _std_mat(Color(0.94, 0.16, 0.16), 0.2, 0.0)
	_mat_signal_red.emission_enabled = true; _mat_signal_red.emission = Color(0.96, 0.16, 0.16); _mat_signal_red.emission_energy_multiplier = 1.6

	_mat_lamp_glow = _std_mat(Color(1.0, 0.92, 0.72), 0.18, 0.0)
	_mat_lamp_glow.emission_enabled = true; _mat_lamp_glow.emission = Color(1.0, 0.88, 0.62); _mat_lamp_glow.emission_energy_multiplier = 0.85

	_mat_beacon_red = _std_mat(Color(1.0, 0.12, 0.12), 0.15, 0.0)
	_mat_beacon_red.emission_enabled = true; _mat_beacon_red.emission = Color(1.0, 0.12, 0.10); _mat_beacon_red.emission_energy_multiplier = 3.2

	_mat_preview = StandardMaterial3D.new()
	_mat_preview.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat_preview.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat_preview.albedo_color = Color(0.18, 0.80, 1.0, 0.78)

static func _std_mat(col: Color, rough: float, metal: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	return m

static func _make_cyl(r_top: float, r_bot: float, h: float) -> CylinderMesh:
	var c := CylinderMesh.new(); c.top_radius = r_top; c.bottom_radius = r_bot; c.height = h; c.radial_segments = 10
	return c

static func _make_cone(r: float, h: float) -> CylinderMesh:
	var c := CylinderMesh.new(); c.top_radius = 0.08; c.bottom_radius = r; c.height = h; c.radial_segments = 8
	return c

func _add_mesh_node(parent: Node3D, node_name: String, mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.material_override = mat
	parent.add_child(mi)
	return mi

func _spawn_box(parent: Node3D, pos: Vector3, sz: Vector3, yaw: float, mat: Material) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = sz
	var mi := _add_mesh_node(parent, "Box", bm, mat)
	mi.position = pos
	mi.rotation.y = yaw
	return mi

func _spawn_beam(parent: Node3D, a: Vector3, b: Vector3, thickness: float, mat: Material) -> void:
	var diff := b - a
	var length := diff.length()
	if length < 0.05:
		return
	var bm := BoxMesh.new()
	bm.size = Vector3(thickness, thickness, length)
	var mi := _add_mesh_node(parent, "Beam", bm, mat)
	mi.position = (a + b) * 0.5
	if absf(diff.normalized().dot(Vector3.UP)) > 0.99:
		mi.rotation.x = PI * 0.5
	else:
		mi.look_at_from_position(mi.position, b, Vector3.UP)

static func _clear_children(node: Node) -> void:
	for c in node.get_children():
		c.queue_free()
