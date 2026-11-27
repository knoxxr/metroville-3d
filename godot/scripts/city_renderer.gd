class_name CityRenderer
extends Node3D

var roads_root: Node3D
var buildings_root: Node3D
var forest_root: Node3D
var vehicles_body_mm: MultiMeshInstance3D
var vehicles_cabin_mm: MultiMeshInstance3D
var preview_mesh_inst: MeshInstance3D

var _mat_road_2: ShaderMaterial
var _mat_road_4: ShaderMaterial
var _mat_road_6: ShaderMaterial
var _mat_sidewalk: StandardMaterial3D
var _mat_bridge_steel: StandardMaterial3D
var _mat_concrete: StandardMaterial3D
var _mat_roof_dark: StandardMaterial3D
var _mat_solar: StandardMaterial3D
var _mat_park_turf: StandardMaterial3D
var _mat_signal_green: StandardMaterial3D
var _mat_industrial: StandardMaterial3D
var _mat_glass_blue: ShaderMaterial
var _mat_glass_gold: ShaderMaterial
var _mat_stone_white: ShaderMaterial
var _mat_terracotta: ShaderMaterial
var _mat_trunk: StandardMaterial3D
var _mat_pine: StandardMaterial3D
var _mat_oak: StandardMaterial3D
var _mat_preview: StandardMaterial3D

var _wind_rotors: Array[Node3D] = []
var _road_mesh_entries: Array[Dictionary] = []

const CAR_PALETTE := [
	Color(0.93, 0.95, 0.97),
	Color(0.18, 0.24, 0.34),
	Color(0.78, 0.20, 0.22),
	Color(0.18, 0.45, 0.78),
	Color(0.90, 0.72, 0.16),
	Color(0.56, 0.60, 0.66),
	Color(0.18, 0.56, 0.42),
	Color(0.86, 0.42, 0.18)
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
	_mat_stone_white.set_shader_parameter("night_factor", night_val)
	_mat_terracotta.set_shader_parameter("night_factor", night_val)

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

	for i in range(count):
		var v: Dictionary = sim.vehicles[i]
		var pos: Vector3 = v["pos"]
		var dir: Vector3 = v["dir"]
		if dir.length_squared() < 1e-4:
			dir = Vector3.FORWARD
		var yaw: float = atan2(dir.x, dir.z)
		var is_truck: bool = v["is_truck"]
		var basis := Basis(Vector3.UP, yaw)

		var b_scale := Vector3(2.2, 2.2, 6.4) if is_truck else Vector3(1.85, 1.05, 4.2)
		var b_pos := pos + Vector3(0.0, b_scale.y * 0.5, 0.0)
		vehicles_body_mm.multimesh.set_instance_transform(i, Transform3D(basis.scaled(b_scale), b_pos))
		vehicles_body_mm.multimesh.set_instance_color(i, CAR_PALETTE[v["color_idx"] % CAR_PALETTE.size()])

		var c_scale := Vector3(1.9, 0.8, 1.8) if is_truck else Vector3(1.55, 0.72, 2.15)
		var c_off := dir * (1.8 if is_truck else -0.15) + Vector3(0.0, b_scale.y + c_scale.y * 0.45, 0.0)
		vehicles_cabin_mm.multimesh.set_instance_transform(i, Transform3D(basis.scaled(c_scale), pos + c_off))

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
	for seg in net.segments.values():
		var spec: Dictionary = RoadNetwork.ROAD_SPECS[seg["type"]]
		var slices: int = clampi(int(ceil(seg["length"] / 4.2)), 8, 56)
		var base_mat: ShaderMaterial = _mat_road_2 if seg["type"] == 0 else (_mat_road_4 if seg["type"] == 1 else _mat_road_6)
		var seg_mat: ShaderMaterial = base_mat.duplicate()
		_road_mesh_entries.append({"seg_id": seg["id"], "mat": seg_mat})

		# Asphalt carriageway ribbon
		var asph_mesh := _extrude_ribbon(net, seg, slices, -spec["asphalt_w"] * 0.5, spec["asphalt_w"] * 0.5, 0.16, 0.55)
		_add_mesh_node(roads_root, "Road_%d" % seg["id"], asph_mesh, seg_mat)

		# Raised concrete sidewalks with beveled curbs
		if spec["sidewalks"]:
			var hw: float = spec["asphalt_w"] * 0.5
			var outer: float = hw + spec["sidewalk_w"]
			_add_mesh_node(roads_root, "WalkR_%d" % seg["id"], _extrude_ribbon(net, seg, slices, hw, outer, 0.34, 0.72), _mat_sidewalk)
			_add_mesh_node(roads_root, "WalkL_%d" % seg["id"], _extrude_ribbon(net, seg, slices, -outer, -hw, 0.34, 0.72), _mat_sidewalk)

		if seg["is_bridge"]:
			_build_suspension_bridge(net, seg, spec)
		elif spec["sidewalks"]:
			_build_streetlamps(net, seg, spec)

	# Intersection circular asphalt aprons + 3D Traffic Signal Poles
	for node in net.nodes.values():
		if node["segments"].size() < 2:
			continue
		var max_w := 8.0
		for sid in node["segments"]:
			max_w = maxf(max_w, RoadNetwork.ROAD_SPECS[net.segments[sid]["type"]]["asphalt_w"])
		var cyl := CylinderMesh.new()
		cyl.top_radius = max_w * 0.62
		cyl.bottom_radius = max_w * 0.66
		cyl.height = 0.38
		var pad := _add_mesh_node(roads_root, "Junction_%d" % node["id"], cyl, _mat_road_2)
		pad.position = node["pos"] + Vector3(0.0, 0.04, 0.0)

		if node["segments"].size() >= 3:
			var corner: float = max_w * 0.62
			for sgn in [1.0, -1.0]:
				var pole_pos: Vector3 = node["pos"] + Vector3(corner * sgn, 0.0, corner * sgn)
				_spawn_box(roads_root, pole_pos + Vector3(0, 3.4, 0), Vector3(0.28, 6.8, 0.28), 0.0, _mat_roof_dark)
				_spawn_box(roads_root, pole_pos + Vector3(-1.4 * sgn, 6.5, 0), Vector3(2.8, 0.22, 0.22), 0.0, _mat_roof_dark)
				_spawn_box(roads_root, pole_pos + Vector3(-2.1 * sgn, 6.2, 0), Vector3(0.45, 0.9, 0.35), 0.0, _mat_signal_green)

func _extrude_ribbon(net: RoadNetwork, seg: Dictionary, slices: int, off_l: float, off_r: float, top_y: float, skirt_d: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var dist_acc := 0.0
	var prev_c := Vector3.ZERO
	var ring_p: Array[Array] = []

	for i in range(slices + 1):
		var t: float = float(i) / float(slices)
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
		# Top road face (CCW/upward normal +Y in Godot)
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[1])
		st.set_uv(Vector2(1, va)); st.add_vertex(a[1])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		st.set_uv(Vector2(1, vb)); st.add_vertex(b[1])
		# Left curb wall
		st.set_uv(Vector2(0, va)); st.add_vertex(a[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[0])
		st.set_uv(Vector2(0, va)); st.add_vertex(a[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[2])
		st.set_uv(Vector2(0, vb)); st.add_vertex(b[0])
		# Right curb wall
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

		# Submerged concrete bridge pier
		_spawn_box(roads_root, Vector3(c.x, gy + pier_h * 0.5 - 1.5, c.z), Vector3(total_w * 0.80, pier_h, 3.6), yaw, _mat_sidewalk)

		# Iconic H-Frame cross-braced white steel pylons
		var tower_h := 28.0
		var pl := c - r * (hw - 0.65) + Vector3(0, tower_h * 0.5, 0)
		var pr := c + r * (hw - 0.65) + Vector3(0, tower_h * 0.5, 0)
		_spawn_box(roads_root, pl, Vector3(1.15, tower_h, 1.35), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, pr, Vector3(1.15, tower_h, 1.35), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, c + Vector3(0, tower_h - 1.5, 0), Vector3(total_w, 1.15, 1.15), yaw, _mat_bridge_steel)
		_spawn_box(roads_root, c + Vector3(0, tower_h * 0.56, 0), Vector3(total_w, 0.85, 0.90), yaw, _mat_bridge_steel)

		tops_l.append(c - r * (hw - 0.65) + Vector3(0, tower_h - 0.9, 0))
		tops_r.append(c + r * (hw - 0.65) + Vector3(0, tower_h - 0.9, 0))

	# Parabolic main suspension cables + vertical hanger rods
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
		_spawn_beam(roads_root, prev, cur, 0.42, _mat_bridge_steel)
		# Vertical suspender hanger down to bridge deck
		if i < steps:
			var t_seg := lerpf(0.27, 0.73, u)
			var deck_p := net.sample_pos(seg, t_seg) + net.sample_right(seg, t_seg) * lat_off
			if cur.y > deck_p.y + 1.0:
				_spawn_beam(roads_root, cur, deck_p, 0.16, _mat_bridge_steel)
		prev = cur

func _build_streetlamps(net: RoadNetwork, seg: Dictionary, spec: Dictionary) -> void:
	var count := maxi(1, int(floor(seg["length"] / 34.0)))
	var side_off: float = spec["asphalt_w"] * 0.5 + spec["sidewalk_w"] * 0.55
	for i in range(1, count):
		var t := float(i) / float(count)
		var c := net.sample_pos(seg, t)
		c.y = maxf(c.y, TerrainField.sample_height(c.x, c.z))
		var r := net.sample_right(seg, t)
		_spawn_box(roads_root, c + r * side_off + Vector3(0, 3.8, 0), Vector3(0.22, 7.6, 0.22), 0.0, _mat_roof_dark)
		if seg["type"] == RoadNetwork.RoadType.FOUR_LANE:
			_spawn_box(roads_root, c - r * side_off + Vector3(0, 3.8, 0), Vector3(0.22, 7.6, 0.22), 0.0, _mat_roof_dark)

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

		# Urban concrete apron pad flush with ground
		_spawn_box(root, Vector3(0, 0.15, 0), Vector3(w + 2.4, 0.5, d + 2.4), 0.0, _mat_concrete)

		if btype == "park":
			_spawn_box(root, Vector3(0, 0.36, 0), Vector3(w, 0.24, d), 0.0, _mat_park_turf)
			# Central plaza fountain
			var f_mesh := CylinderMesh.new(); f_mesh.top_radius = 2.8; f_mesh.bottom_radius = 3.2; f_mesh.height = 0.9
			var f_node := _add_mesh_node(root, "Fountain", f_mesh, _mat_concrete)
			f_node.position = Vector3(0, 0.7, 0)
			continue

		if btype == "wind":
			var mast := CylinderMesh.new(); mast.top_radius = 0.55; mast.bottom_radius = 1.1; mast.height = 38.0
			var mn := _add_mesh_node(root, "Mast", mast, _mat_bridge_steel); mn.position = Vector3(0, 19.0, 0)
			_spawn_box(root, Vector3(0, 38.2, 1.0), Vector3(1.8, 1.8, 4.2), 0.0, _mat_bridge_steel)
			var hub := Node3D.new(); hub.position = Vector3(0, 38.2, 3.3); root.add_child(hub)
			for k in range(3):
				var blade_p := Node3D.new(); blade_p.rotation.z = k * (TAU / 3.0); hub.add_child(blade_p)
				_spawn_box(blade_p, Vector3(0, 7.2, 0), Vector3(0.65, 14.0, 0.22), 0.0, _mat_bridge_steel)
			_wind_rotors.append(hub)
			continue

		if btype == "solar":
			for rx in [-7.5, 0.0, 7.5]:
				for rz in [-6.5, 0.0, 6.5]:
					var p := _spawn_box(root, Vector3(rx, 2.2, rz), Vector3(6.2, 0.28, 4.8), 0.0, _mat_solar)
					p.rotation.x = 0.32
			continue

		var fmat: Material = _pick_facade_mat(b)
		if h > 22.0:
			# Multi-tier Photorealistic Skyscraper with Ground Podium, Cornice Slabs, Setback Crown & Spire!
			var pod_h := minf(8.5, h * 0.22)
			_spawn_box(root, Vector3(0, pod_h * 0.5, 0), Vector3(w, pod_h, d), 0.0, fmat)
			_spawn_box(root, Vector3(0, pod_h + 0.35, 0), Vector3(w + 1.0, 0.72, d + 1.0), 0.0, _mat_concrete)

			var shaft_h := h * 0.56
			_spawn_box(root, Vector3(0, pod_h + shaft_h * 0.5, 0), Vector3(w * 0.86, shaft_h, d * 0.86), 0.0, fmat)
			_spawn_box(root, Vector3(0, pod_h + shaft_h + 0.32, 0), Vector3(w * 0.92, 0.65, d * 0.92), 0.0, _mat_concrete)

			var crown_h := maxf(5.0, h - pod_h - shaft_h)
			_spawn_box(root, Vector3(0, pod_h + shaft_h + crown_h * 0.5, 0), Vector3(w * 0.68, crown_h, d * 0.68), 0.0, fmat)
			_spawn_box(root, Vector3(0, h + 1.15, 0), Vector3(w * 0.34, 2.3, d * 0.34), 0.0, _mat_roof_dark)

			if btype == "landmark" or b["level"] >= 4:
				var spire := CylinderMesh.new(); spire.top_radius = 0.14; spire.bottom_radius = 0.45; spire.height = 18.0
				var sn := _add_mesh_node(root, "Spire", spire, _mat_bridge_steel)
				sn.position = Vector3(0, h + 9.0, 0)
		else:
			_spawn_box(root, Vector3(0, h * 0.5, 0), Vector3(w * 0.88, h, d * 0.88), 0.0, fmat)
			if btype == "res_low":
				var roof := PrismMesh.new(); roof.size = Vector3(w * 0.95, 3.2, d * 0.95)
				var rn := _add_mesh_node(root, "GableRoof", roof, _mat_roof_dark)
				rn.position = Vector3(0, h + 1.6, 0)
			else:
				_spawn_box(root, Vector3(0, h + 0.35, 0), Vector3(w * 0.93, 0.7, d * 0.93), 0.0, _mat_concrete)

func _build_valley_forest(sim: CitySimulation) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 9091
	var pine_transforms: Array[Transform3D] = []
	var oak_transforms: Array[Transform3D] = []

	var attempts := 0
	while (pine_transforms.size() + oak_transforms.size()) < 420 and attempts < 3000:
		attempts += 1
		var x := rng.randf_range(65.0, TerrainField.WORLD_SIZE - 65.0)
		var z := rng.randf_range(115.0, TerrainField.WORLD_SIZE - 65.0)
		var y := TerrainField.sample_height(x, z)
		if y < TerrainField.WATER_LEVEL + 1.3 or y > 62.0:
			continue
		var blocked := false
		for b in sim.buildings:
			var bp: Vector3 = b["pos"]
			if (bp.x - x) * (bp.x - x) + (bp.z - z) * (bp.z - z) < 23.0 * 23.0:
				blocked = true; break
		if blocked:
			continue
		for seg in sim.roads.segments.values():
			for t in [0.25, 0.5, 0.75]:
				var rp := sim.roads.sample_pos(seg, t)
				if (rp.x - x) * (rp.x - x) + (rp.z - z) * (rp.z - z) < 22.0 * 22.0:
					blocked = true; break
			if blocked:
				break
		if blocked:
			continue

		var sc := rng.randf_range(0.85, 1.55)
		var xf := Transform3D(Basis(Vector3.UP, rng.randf_range(0.0, TAU)).scaled(Vector3(sc, sc, sc)), Vector3(x, y - 0.25, z))
		if y > 24.0 or rng.randf() < 0.65:
			pine_transforms.append(xf)
		else:
			oak_transforms.append(xf)

	# Instanced Multi-Tier Conifer Spruces (trunk + 3 feathered cone tiers)
	_spawn_forest_multimesh("PineTrunks", _make_cyl(0.42, 0.65, 4.4), _mat_trunk, pine_transforms, Vector3(0, 2.2, 0))
	_spawn_forest_multimesh("PineTier1", _make_cone(3.6, 5.8), _mat_pine, pine_transforms, Vector3(0, 5.4, 0))
	_spawn_forest_multimesh("PineTier2", _make_cone(2.7, 5.0), _mat_pine, pine_transforms, Vector3(0, 8.6, 0))
	_spawn_forest_multimesh("PineTier3", _make_cone(1.7, 4.2), _mat_pine, pine_transforms, Vector3(0, 11.4, 0))

	# Instanced Broadleaf Temperate Oaks
	_spawn_forest_multimesh("OakTrunks", _make_cyl(0.45, 0.70, 4.8), _mat_trunk, oak_transforms, Vector3(0, 2.4, 0))
	var sp := SphereMesh.new(); sp.radius = 3.6; sp.height = 5.6; sp.radial_segments = 10; sp.rings = 6
	_spawn_forest_multimesh("OakCanopies", sp, _mat_oak, oak_transforms, Vector3(0, 6.8, 0))

func _spawn_forest_multimesh(node_name: String, mesh: Mesh, mat: Material, xfs: Array[Transform3D], local_off: Vector3) -> void:
	if xfs.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xfs.size()
	for i in range(xfs.size()):
		var xf := xfs[i]
		xf.origin += xf.basis * local_off
		mm.set_instance_transform(i, xf)
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	mmi.multimesh = mm
	mmi.material_override = mat
	forest_root.add_child(mmi)

func _init_vehicle_multimeshes() -> void:
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
	car_mat.metallic = 0.55
	car_mat.roughness = 0.22
	vehicles_body_mm.material_override = car_mat
	add_child(vehicles_body_mm)

	var cab_mm := MultiMesh.new()
	cab_mm.transform_format = MultiMesh.TRANSFORM_3D
	cab_mm.mesh = BoxMesh.new()
	cab_mm.instance_count = 160
	cab_mm.visible_instance_count = 0
	vehicles_cabin_mm = MultiMeshInstance3D.new()
	vehicles_cabin_mm.multimesh = cab_mm
	var glass_mat := StandardMaterial3D.new()
	glass_mat.albedo_color = Color(0.10, 0.14, 0.20)
	glass_mat.metallic = 0.85
	glass_mat.roughness = 0.08
	vehicles_cabin_mm.material_override = glass_mat
	add_child(vehicles_cabin_mm)

func _pick_facade_mat(b: Dictionary) -> Material:
	var st: int = b["style"]
	match b["type"]:
		"office", "landmark":
			return _mat_glass_blue if st % 2 == 0 else _mat_glass_gold
		"com_high":
			return _mat_glass_gold if st % 3 == 0 else _mat_glass_blue
		"res_high":
			return _mat_stone_white if st % 2 == 0 else _mat_terracotta
		"res_low", "com_low":
			return _mat_terracotta if st % 2 == 0 else _mat_stone_white
		"ind":
			return _mat_industrial
		_:
			return _mat_stone_white

func _init_materials() -> void:
	var road_sh: Shader = load("res://shaders/road_pbr.gdshader")
	_mat_road_2 = ShaderMaterial.new(); _mat_road_2.shader = road_sh; _mat_road_2.set_shader_parameter("lane_count", 2)
	_mat_road_4 = ShaderMaterial.new(); _mat_road_4.shader = road_sh; _mat_road_4.set_shader_parameter("lane_count", 4)
	_mat_road_6 = ShaderMaterial.new(); _mat_road_6.shader = road_sh; _mat_road_6.set_shader_parameter("lane_count", 6)

	var glass_sh: Shader = load("res://shaders/skyscraper_interior.gdshader")
	_mat_glass_blue = ShaderMaterial.new(); _mat_glass_blue.shader = glass_sh
	_mat_glass_blue.set_shader_parameter("facade_color", Color(0.84, 0.88, 0.92))
	_mat_glass_blue.set_shader_parameter("glass_tint", Color(0.32, 0.56, 0.78))
	_mat_glass_blue.set_shader_parameter("mullion_width", 0.13)

	_mat_glass_gold = ShaderMaterial.new(); _mat_glass_gold.shader = glass_sh
	_mat_glass_gold.set_shader_parameter("facade_color", Color(0.86, 0.82, 0.74))
	_mat_glass_gold.set_shader_parameter("glass_tint", Color(0.68, 0.58, 0.42))
	_mat_glass_gold.set_shader_parameter("mullion_width", 0.14)

	_mat_stone_white = ShaderMaterial.new(); _mat_stone_white.shader = glass_sh
	_mat_stone_white.set_shader_parameter("facade_color", Color(0.90, 0.91, 0.89))
	_mat_stone_white.set_shader_parameter("glass_tint", Color(0.42, 0.58, 0.70))
	_mat_stone_white.set_shader_parameter("mullion_width", 0.20)

	_mat_terracotta = ShaderMaterial.new(); _mat_terracotta.shader = glass_sh
	_mat_terracotta.set_shader_parameter("facade_color", Color(0.76, 0.52, 0.40))
	_mat_terracotta.set_shader_parameter("glass_tint", Color(0.44, 0.54, 0.62))
	_mat_terracotta.set_shader_parameter("mullion_width", 0.24)

	_mat_sidewalk = _std_mat(Color(0.68, 0.72, 0.76), 0.82, 0.03)
	_mat_sidewalk.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mat_bridge_steel = _std_mat(Color(0.84, 0.87, 0.91), 0.36, 0.38)
	_mat_concrete = _std_mat(Color(0.72, 0.75, 0.79), 0.82, 0.04)
	_mat_roof_dark = _std_mat(Color(0.20, 0.23, 0.28), 0.68, 0.18)
	_mat_solar = _std_mat(Color(0.08, 0.18, 0.38), 0.14, 0.82)
	_mat_park_turf = _std_mat(Color(0.24, 0.44, 0.16), 0.88, 0.0)
	_mat_industrial = _std_mat(Color(0.46, 0.48, 0.52), 0.76, 0.22)
	_mat_trunk = _std_mat(Color(0.28, 0.20, 0.13), 0.94, 0.0)

	# Rich sunlit forest emerald conifers & temperate oaks (balanced for ACES daylight!)
	_mat_pine = _std_mat(Color(0.11, 0.27, 0.13), 0.86, 0.0)
	_mat_oak = _std_mat(Color(0.20, 0.39, 0.15), 0.84, 0.0)

	_mat_signal_green = _std_mat(Color(0.15, 0.92, 0.42), 0.2, 0.0)
	_mat_signal_green.emission_enabled = true
	_mat_signal_green.emission = Color(0.15, 0.95, 0.42)
	_mat_signal_green.emission_energy_multiplier = 2.2

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
	var c := CylinderMesh.new(); c.top_radius = r_top; c.bottom_radius = r_bot; c.height = h; c.radial_segments = 8
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
