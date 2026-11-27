extends Node3D

enum LightPreset { DAY, SUNSET, NIGHT, AUTO }

var sim := CitySimulation.new()
var renderer: CityRenderer
var cam: SkylinesCamera
var hud: SkylinesHUD
var sun_light: DirectionalLight3D
var world_env: WorldEnvironment
var sky_mat: ProceduralSkyMaterial
var water_mat: ShaderMaterial

var _speed_mult: float = 1.0
var _light_mode: int = LightPreset.DAY
var _tool_mode: String = "inspect"
var _sub_id: String = "four_lane"
var _curved_road: bool = true
var _draw_has_start: bool = false
var _draw_has_mid: bool = false
var _draw_start: Vector3
var _draw_mid: Vector3
var _hud_timer: float = 0.0
var _info_view: String = "none"

# Optional headless screenshot capture arguments: --screenshot=/path.png --preset=day|closeup|sunset
var _shot_path: String = ""
var _shot_frames_left: int = -1

func _ready() -> void:
	_setup_environment_and_sun()
	_setup_terrain_and_water()

	renderer = CityRenderer.new()
	add_child(renderer)

	cam = SkylinesCamera.new()
	add_child(cam)
	cam.make_current()

	hud = SkylinesHUD.new()
	add_child(hud)
	hud.setup(sim)
	hud.speed_changed.connect(func(m): _speed_mult = m)
	hud.lighting_cycled.connect(_cycle_lighting)
	hud.reset_requested.connect(func():
		sim.reset_and_build_demo()
		renderer.rebuild_world(sim)
		hud.show_inspector({})
	)
	hud.infoview_changed.connect(_set_infoview)
	hud.tool_selected.connect(func(tm, sid, crv):
		_tool_mode = tm; _sub_id = sid; _curved_road = crv
		cam.allow_left_pan = (_tool_mode == "inspect")
		_cancel_draw()
	)
	hud.bulldoze_building_requested.connect(func(bid): sim.bulldoze_by_id(bid))
	hud.event_clicked.connect(_focus_active_event)
	hud.view_preset_requested.connect(func(p):
		if p == "satellite": cam.set_satellite_overview()
		else: cam.set_downtown_view()
	)

	sim.world_changed.connect(func(): renderer.rebuild_world(sim))
	sim.reset_and_build_demo()
	renderer.rebuild_world(sim)
	_apply_lighting()
	hud.refresh_telemetry(sim)

	_parse_cli_screenshot_args()

func _focus_active_event() -> void:
	var pos: Vector3 = sim.state.get("event_pos", Vector3(TerrainField.WORLD_CENTER - 225.0, 24.0, TerrainField.WORLD_CENTER + 40.0))
	cam.focus_on(pos, 138.0)
	var bid: int = sim.state.get("event_building_id", -1)
	if bid > 0:
		for b in sim.buildings:
			if b["id"] == bid:
				hud.show_inspector(b)
				return
	hud.show_inspector(sim.find_building_at(pos, 22.0))

func _process(delta: float) -> void:
	sim.step_frame(delta, _speed_mult)
	renderer.sync_vehicles(sim)
	if _light_mode == LightPreset.AUTO:
		_apply_lighting()

	_hud_timer += delta
	if _hud_timer >= 0.15:
		_hud_timer = 0.0
		hud.refresh_telemetry(sim)
		if _info_view == "traffic":
			renderer.set_traffic_overlay(true, sim)

	if _tool_mode == "road" and _draw_has_start:
		var hit := _raycast_ground(get_viewport().get_mouse_position())
		if hit["hit"]:
			_update_road_preview(hit["pos"])

	# Automated screenshot capture after scene settles cleanly
	if _shot_frames_left > 0:
		_shot_frames_left -= 1
		if _shot_frames_left == 0:
			var img := get_viewport().get_texture().get_image()
			var err := img.save_png(_shot_path)
			print("GODOT_SCREENSHOT_SAVED: ", _shot_path, " err=", err)
			get_tree().quit(0)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_SPACE: _speed_mult = 0.0 if _speed_mult > 0.0 else 1.0
			KEY_1: _speed_mult = 1.0
			KEY_2: _speed_mult = 2.5
			KEY_3: _speed_mult = 5.0
			KEY_ESCAPE: _cancel_draw()
	elif event is InputEventMouseButton:
		if cam.is_multi_touching:
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_RIGHT and _draw_has_start:
			_cancel_draw()
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			if hud.is_pointer_over_ui(event.position):
				return
			# In default Move/Inspect mode: dragging pans camera, short click release inspects building!
			if _tool_mode == "inspect":
				if not event.pressed and cam.left_drag_moved_px < 10.0:
					var hit := _raycast_ground(event.position)
					if hit["hit"]:
						_handle_world_click(hit["pos"])
				return
			if event.pressed:
				var hit := _raycast_ground(event.position)
				if hit["hit"]:
					_handle_world_click(hit["pos"])

func _handle_world_click(pos: Vector3) -> void:
	if _tool_mode == "inspect":
		var b := sim.find_building_at(pos, 20.0)
		hud.show_inspector(b)
	elif _tool_mode == "bulldoze":
		sim.bulldoze_at(pos, 18.0)
	elif _tool_mode == "build":
		sim.place_building(_sub_id, pos, 0.0, 1, false)
	elif _tool_mode == "road":
		var near := sim.roads.find_nearest_node(pos, 16.0)
		var snapped: Vector3 = near["pos"] if not near.is_empty() else Vector3(pos.x, TerrainField.sample_height(pos.x, pos.z) + 0.22, pos.z)
		if not _draw_has_start:
			_draw_start = snapped
			_draw_has_start = true
			_draw_has_mid = false
		elif _curved_road and not _draw_has_mid:
			_draw_mid = snapped
			_draw_has_mid = true
		else:
			var rtype := RoadNetwork.RoadType.FOUR_LANE
			if _sub_id == "two_lane": rtype = RoadNetwork.RoadType.TWO_LANE
			elif _sub_id == "highway": rtype = RoadNetwork.RoadType.SIX_LANE_HIGHWAY
			var mid = _draw_mid if (_curved_road and _draw_has_mid) else null
			sim.build_road(_draw_start, snapped, rtype, mid)
			_draw_start = snapped
			_draw_has_mid = false
			renderer.update_road_preview([])

func _update_road_preview(cursor: Vector3) -> void:
	var pts: Array[Vector3] = []
	var p0 := _draw_start
	var p3 := cursor
	var p1: Vector3
	var p2: Vector3
	if _curved_road and _draw_has_mid:
		p1 = p0 + (_draw_mid - p0) * (2.0 / 3.0)
		p2 = p3 + (_draw_mid - p3) * (2.0 / 3.0)
	else:
		p1 = p0.lerp(p3, 1.0 / 3.0)
		p2 = p0.lerp(p3, 2.0 / 3.0)
	for i in range(20):
		var t := float(i) / 19.0
		var pt := RoadNetwork.eval_cubic(p0, p1, p2, p3, t)
		pt.y = maxf(pt.y, TerrainField.sample_height(pt.x, pt.z))
		pts.append(pt)
	renderer.update_road_preview(pts)

func _cancel_draw() -> void:
	_draw_has_start = false
	_draw_has_mid = false
	if renderer != null:
		renderer.update_road_preview([])

func _raycast_ground(screen_pos: Vector2) -> Dictionary:
	var from := cam.project_ray_origin(screen_pos)
	var dir := cam.project_ray_normal(screen_pos)
	var query := PhysicsRayQueryParameters3D.create(from, from + dir * 9200.0)
	var res := get_world_3d().direct_space_state.intersect_ray(query)
	if not res.is_empty():
		return {"hit": true, "pos": res["position"]}
	var plane := Plane(Vector3.UP, TerrainField.WATER_LEVEL)
	var hit_p = plane.intersects_ray(from, dir)
	if hit_p != null:
		return {"hit": true, "pos": hit_p}
	return {"hit": false}

func _set_infoview(mode: String) -> void:
	_info_view = mode
	renderer.set_traffic_overlay(mode == "traffic", sim)

func _cycle_lighting() -> void:
	_light_mode = (_light_mode + 1) % 4
	_apply_lighting()

func _apply_lighting() -> void:
	var elev := 48.0
	var azim := 42.0
	match _light_mode:
		LightPreset.DAY:
			elev = 48.0; azim = 42.0; hud.set_lighting_label("주간")
		LightPreset.SUNSET:
			elev = 11.5; azim = 248.0; hud.set_lighting_label("석양")
		LightPreset.NIGHT:
			elev = -16.0; azim = 290.0; hud.set_lighting_label("야경")
		LightPreset.AUTO:
			var ph: float = ((sim.state["time_hours"] - 6.0) / 24.0) * TAU
			elev = sin(ph) * 56.0
			azim = (sim.state["time_hours"] / 24.0) * 360.0
			hud.set_lighting_label("자동")

	var night := clampf((-elev + 8.0) / 22.0, 0.0, 1.0)
	var sunset := clampf(1.0 - absf(elev - 11.5) / 14.0, 0.0, 1.0)

	sun_light.rotation_degrees = Vector3(-maxf(8.0, elev), azim, 0.0)
	var sun_col := Color(1.0, 0.96, 0.90).lerp(Color(1.0, 0.56, 0.28), sunset).lerp(Color(0.32, 0.48, 0.78), night)
	sun_light.light_color = sun_col
	sun_light.light_energy = lerpf(lerpf(1.22, 1.12, sunset), 0.26, night)

	var top_col := Color(0.18, 0.46, 0.80).lerp(Color(0.18, 0.24, 0.46), sunset).lerp(Color(0.02, 0.04, 0.11), night)
	var hor_col := Color(0.68, 0.82, 0.95).lerp(Color(0.92, 0.54, 0.34), sunset).lerp(Color(0.06, 0.11, 0.21), night)
	sky_mat.sky_top_color = top_col
	sky_mat.sky_horizon_color = hor_col
	sky_mat.ground_horizon_color = hor_col * 0.78

	var env := world_env.environment
	env.fog_light_color = hor_col
	env.ambient_light_color = Color(0.46, 0.62, 0.82).lerp(Color(0.55, 0.42, 0.46), sunset * 0.5).lerp(Color(0.08, 0.13, 0.24), night)
	env.ambient_light_energy = lerpf(0.36, 0.18, night)

	water_mat.set_shader_parameter("sky_reflect_color", hor_col * 0.85)
	renderer.set_night_factor(clampf(night * 1.2 + sunset * 0.55, 0.0, 1.0))

func _setup_environment_and_sun() -> void:
	sun_light = DirectionalLight3D.new()
	sun_light.name = "DirectionalSun"
	sun_light.shadow_enabled = true
	sun_light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun_light.directional_shadow_max_distance = 1200.0
	sun_light.directional_shadow_blend_splits = true
	sun_light.shadow_bias = 0.05
	sun_light.shadow_normal_bias = 1.4
	add_child(sun_light)

	sky_mat = ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.18, 0.46, 0.80)
	sky_mat.sky_horizon_color = Color(0.68, 0.82, 0.95)
	sky_mat.ground_bottom_color = Color(0.24, 0.32, 0.22)
	sky_mat.ground_horizon_color = Color(0.58, 0.70, 0.78)
	sky_mat.sun_angle_max = 16.0

	var sky := Sky.new()
	sky.sky_material = sky_mat

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.86
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.46, 0.62, 0.82)
	env.ambient_light_energy = 0.36
	env.ssao_enabled = true
	env.ssao_radius = 2.6
	env.ssao_intensity = 1.45
	env.glow_enabled = true
	env.glow_intensity = 0.16
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.40
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_density = 0.000075
	env.fog_aerial_perspective = 0.42
	env.fog_sky_affect = 0.25

	var cam_attr := CameraAttributesPractical.new()
	cam_attr.dof_blur_far_enabled = true
	cam_attr.dof_blur_far_distance = 1100.0
	cam_attr.dof_blur_far_transition = 600.0
	cam_attr.dof_blur_amount = 0.04

	world_env = WorldEnvironment.new()
	world_env.environment = env
	world_env.camera_attributes = cam_attr
	add_child(world_env)

func _setup_terrain_and_water() -> void:
	var t_mesh := TerrainField.build_terrain_mesh(220)
	var t_mat := ShaderMaterial.new()
	t_mat.shader = load("res://shaders/terrain_splat.gdshader")
	t_mat.set_shader_parameter("water_level", TerrainField.WATER_LEVEL)

	var terrain_mi := MeshInstance3D.new()
	terrain_mi.name = "ValleyTerrain"
	terrain_mi.mesh = t_mesh
	terrain_mi.material_override = t_mat
	add_child(terrain_mi)

	# Accurate trimesh collision for mouse raycasting across entire 4,096m x 4,096m region
	var body := StaticBody3D.new()
	var col_shape := CollisionShape3D.new()
	col_shape.shape = t_mesh.create_trimesh_shape()
	body.add_child(col_shape)
	terrain_mi.add_child(body)

	# Analytical-Depth Coastal, Lake & River Water Mesh at Y = 16.0m
	var w_mesh := TerrainField.build_water_mesh(192)
	water_mat = ShaderMaterial.new()
	water_mat.shader = load("res://shaders/cities_water.gdshader")
	var water_mi := MeshInstance3D.new()
	water_mi.name = "RiverAndBayWater"
	water_mi.mesh = w_mesh
	water_mi.material_override = water_mat
	water_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water_mi)

	# Seamless 14km outer ocean horizon skirt (zero map edge even at 1,750m satellite zoom!)
	var outer_sea := MeshInstance3D.new()
	var sea_plane := PlaneMesh.new()
	sea_plane.size = Vector2(14000.0, 14000.0)
	var sea_mat := StandardMaterial3D.new()
	sea_mat.albedo_color = Color(0.06, 0.22, 0.36)
	sea_mat.roughness = 0.16
	sea_mat.metallic = 0.22
	outer_sea.mesh = sea_plane
	outer_sea.material_override = sea_mat
	outer_sea.position = Vector3(TerrainField.WORLD_CENTER, TerrainField.WATER_LEVEL - 0.22, TerrainField.WORLD_CENTER)
	outer_sea.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(outer_sea)

func _parse_cli_screenshot_args() -> void:
	cam.target = Vector3(TerrainField.WORLD_CENTER - 10.0, 24.0, TerrainField.WORLD_CENTER - 20.0)
	cam.yaw_deg = 26.0
	cam.pitch_deg = 28.0
	cam.distance = 385.0
	cam.snap_immediately()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--screenshot="):
			_shot_path = arg.substr(13)
			_shot_frames_left = 10
		elif arg == "--preset=satellite":
			cam.target = Vector3(TerrainField.WORLD_CENTER, 28.0, TerrainField.WORLD_CENTER - 180.0)
			cam.yaw_deg = 18.0
			cam.pitch_deg = 25.0
			cam.distance = 1320.0
			cam.snap_immediately()
		elif arg == "--preset=closeup":
			cam.target = Vector3(TerrainField.WORLD_CENTER - 215.0, 28.0, TerrainField.WORLD_CENTER - 35.0)
			cam.yaw_deg = 46.0
			cam.pitch_deg = 36.0
			cam.distance = 215.0
			cam.snap_immediately()
		elif arg == "--preset=sunset":
			_light_mode = LightPreset.SUNSET
			_apply_lighting()
			cam.target = Vector3(TerrainField.WORLD_CENTER, 24.0, TerrainField.WORLD_CENTER - 120.0)
			cam.yaw_deg = 22.0
			cam.pitch_deg = 26.0
			cam.distance = 1150.0
			cam.snap_immediately()
