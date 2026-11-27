class_name TerrainField
extends RefCounted

# Massive Cities: Skylines Regional Scale: 4,096m x 4,096m (16.7 km^2 = 16x land area!)
const WORLD_SIZE: float = 4096.0
const WORLD_CENTER: float = 2048.0
const WATER_LEVEL: float = 16.0
const BRIDGE_CLEARANCE: float = 11.0

static func river_center_x(world_z: float) -> float:
	var dz: float = world_z - WORLD_CENTER
	return WORLD_CENTER \
		+ sin(dz * 0.0019) * 210.0 \
		+ cos(dz * 0.0044) * 42.0 \
		+ sin(dz * 0.0095) * 16.0

static func sample_height(world_x: float, world_z: float) -> float:
	var nx: float = world_x / WORLD_SIZE
	var nz: float = world_z / WORLD_SIZE

	# 1. Vast gently rolling buildable valley plains (~24.0m, well above 16.0m water level)
	var base_plain: float = 24.0 \
		+ sin(world_x * 0.0024 + 0.5) * 3.8 \
		+ cos(world_z * 0.0027 - 0.3) * 3.5 \
		+ sin((world_x - world_z) * 0.0055) * 2.0 \
		+ cos((world_x + world_z) * 0.011) * 0.8

	# 2. Gentle scenic rolling hills in outer quadrants (still buildable suburbs/parks!)
	var d_center := Vector2(world_x - WORLD_CENTER, world_z - WORLD_CENTER).length()
	var foothill_mask := clampf((d_center - 680.0) / 920.0, 0.0, 1.0)
	var foothill_s := foothill_mask * foothill_mask * (3.0 - 2.0 * foothill_mask)
	var rolling_hills := foothill_s * (
		sin(world_x * 0.0048 + 1.1) * cos(world_z * 0.0044 - 0.6) * 16.0
		+ absf(sin(world_x * 0.0082 + world_z * 0.0061)) * 10.0
	)

	# 3. Towering snow-capped alpine mountain ring across North (-Z), Far West (-X), and Far East (+X) horizons (up to ~215m!)
	var edge_n: float = clampf((0.30 - nz) / 0.30, 0.0, 1.0)
	var edge_w: float = clampf((0.20 - nx) / 0.20, 0.0, 1.0)
	var edge_e: float = clampf((nx - 0.80) / 0.20, 0.0, 1.0)
	var m_mask: float = maxf(edge_n, maxf(edge_w * 0.86, edge_e * 0.86))
	var m_smooth: float = m_mask * m_mask * (3.0 - 2.0 * m_mask)

	var ridge: float = absf(sin(world_x * 0.0046 + cos(world_z * 0.0042) * 1.6)) * 128.0 \
		+ absf(cos(world_z * 0.0068 - world_x * 0.0034)) * 68.0 \
		+ sin(world_x * 0.018 + world_z * 0.015) * 14.0
	var mountains: float = m_smooth * (32.0 + ridge)

	var h: float = base_plain + rolling_hills + mountains

	# 4. Grand Winding Navigable Main River (from Northern Glacier Gorge at -Z down to Southern Harbor Bay at +Z)
	var r_cx: float = river_center_x(world_z)
	var bay_widen: float = clampf((world_z - 2850.0) / 1000.0, 0.0, 1.0)
	var r_half_w: float = 46.0 + bay_widen * bay_widen * 280.0
	var dist_r: float = absf(world_x - r_cx)
	var bank_t: float = clampf((dist_r - r_half_w * 0.62) / (r_half_w * 0.78), 0.0, 1.0)
	var bank_s: float = bank_t * bank_t * (3.0 - 2.0 * bank_t)
	var bed_y: float = 6.5 + sin(world_z * 0.025) * 0.8
	h = lerpf(bed_y, h, bank_s)

	# 5. Scenic Eastern Highland Lake (X ~ 2920, Z ~ 1520 — visible framed below the eastern peaks!)
	var lake_dist := Vector2((world_x - 2920.0) * 0.82, (world_z - 1520.0) * 1.12).length()
	var lake_r := 220.0 + sin(atan2(world_z - 1520.0, world_x - 2920.0) * 3.0) * 40.0
	var lake_t := clampf((lake_dist - lake_r * 0.55) / (lake_r * 0.72), 0.0, 1.0)
	var lake_s := lake_t * lake_t * (3.0 - 2.0 * lake_t)
	h = lerpf(8.0, h, lake_s)

	# 6. Western Valley Lake & Peninsula (X ~ 1140, Z ~ 1460)
	var lag_dist := Vector2((world_x - 1140.0) * 0.90, (world_z - 1460.0) * 1.08).length()
	var lag_t := clampf((lag_dist - 145.0) / 150.0, 0.0, 1.0)
	var lag_s := lag_t * lag_t * (3.0 - 2.0 * lag_t)
	h = lerpf(8.5, h, lag_s)

	# 7. Southern Open Ocean Coastline above Z > 3520m
	if world_z > 3480.0:
		var coast_t: float = clampf((3840.0 - world_z) / 360.0, 0.0, 1.0)
		var coast_s: float = coast_t * coast_t * (3.0 - 2.0 * coast_t)
		h = lerpf(5.0, h, coast_s)

	return maxf(3.0, h)

static func sample_normal(world_x: float, world_z: float) -> Vector3:
	var eps: float = 4.0
	var hl: float = sample_height(world_x - eps, world_z)
	var hr: float = sample_height(world_x + eps, world_z)
	var hd: float = sample_height(world_x, world_z - eps)
	var hu: float = sample_height(world_x, world_z + eps)
	return Vector3(hl - hr, 2.0 * eps, hd - hu).normalized()

static func is_water(world_x: float, world_z: float) -> bool:
	return sample_height(world_x, world_z) < WATER_LEVEL - 0.15

static func build_terrain_mesh(resolution: int = 220) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var step: float = WORLD_SIZE / float(resolution)
	var grid_verts: Array[Vector3] = []
	var grid_norms: Array[Vector3] = []
	grid_verts.resize((resolution + 1) * (resolution + 1))
	grid_norms.resize((resolution + 1) * (resolution + 1))

	for gz in range(resolution + 1):
		var wz: float = gz * step
		for gx in range(resolution + 1):
			var wx: float = gx * step
			var idx: int = gz * (resolution + 1) + gx
			grid_verts[idx] = Vector3(wx, sample_height(wx, wz), wz)
			grid_norms[idx] = sample_normal(wx, wz)

	for gz in range(resolution):
		for gx in range(resolution):
			var i00: int = gz * (resolution + 1) + gx
			var i10: int = i00 + 1
			var i01: int = (gz + 1) * (resolution + 1) + gx
			var i11: int = i01 + 1

			var u0: float = float(gx) / float(resolution)
			var u1: float = float(gx + 1) / float(resolution)
			var v0: float = float(gz) / float(resolution)
			var v1: float = float(gz + 1) / float(resolution)

			st.set_normal(grid_norms[i00]); st.set_uv(Vector2(u0, v0)); st.add_vertex(grid_verts[i00])
			st.set_normal(grid_norms[i10]); st.set_uv(Vector2(u1, v0)); st.add_vertex(grid_verts[i10])
			st.set_normal(grid_norms[i01]); st.set_uv(Vector2(u0, v1)); st.add_vertex(grid_verts[i01])

			st.set_normal(grid_norms[i10]); st.set_uv(Vector2(u1, v0)); st.add_vertex(grid_verts[i10])
			st.set_normal(grid_norms[i11]); st.set_uv(Vector2(u1, v1)); st.add_vertex(grid_verts[i11])
			st.set_normal(grid_norms[i01]); st.set_uv(Vector2(u0, v1)); st.add_vertex(grid_verts[i01])

	return st.commit()

static func build_water_mesh(resolution: int = 192) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var step: float = WORLD_SIZE / float(resolution)
	var depths: PackedFloat32Array = PackedFloat32Array()
	depths.resize((resolution + 1) * (resolution + 1))
	for gz in range(resolution + 1):
		var wz: float = gz * step
		for gx in range(resolution + 1):
			var wx: float = gx * step
			var idx: int = gz * (resolution + 1) + gx
			depths[idx] = clampf((WATER_LEVEL - sample_height(wx, wz)) / 9.0, 0.0, 1.0)

	for gz in range(resolution):
		var z0: float = gz * step
		var z1: float = (gz + 1) * step
		for gx in range(resolution):
			var i00: int = gz * (resolution + 1) + gx
			var i10: int = i00 + 1
			var i01: int = (gz + 1) * (resolution + 1) + gx
			var i11: int = i01 + 1
			if depths[i00] <= 0.001 and depths[i10] <= 0.001 and depths[i01] <= 0.001 and depths[i11] <= 0.001:
				continue
			var x0: float = gx * step
			var x1: float = (gx + 1) * step
			var v00 := Vector3(x0, WATER_LEVEL, z0)
			var v10 := Vector3(x1, WATER_LEVEL, z0)
			var v01 := Vector3(x0, WATER_LEVEL, z1)
			var v11 := Vector3(x1, WATER_LEVEL, z1)

			st.set_normal(Vector3.UP); st.set_color(Color(depths[i00], 0, 0, 1)); st.add_vertex(v00)
			st.set_normal(Vector3.UP); st.set_color(Color(depths[i10], 0, 0, 1)); st.add_vertex(v10)
			st.set_normal(Vector3.UP); st.set_color(Color(depths[i01], 0, 0, 1)); st.add_vertex(v01)

			st.set_normal(Vector3.UP); st.set_color(Color(depths[i10], 0, 0, 1)); st.add_vertex(v10)
			st.set_normal(Vector3.UP); st.set_color(Color(depths[i11], 0, 0, 1)); st.add_vertex(v11)
			st.set_normal(Vector3.UP); st.set_color(Color(depths[i01], 0, 0, 1)); st.add_vertex(v01)

	return st.commit()
