class_name TerrainField
extends RefCounted

const WORLD_SIZE: float = 1024.0
const WATER_LEVEL: float = 14.0
const BRIDGE_CLEARANCE: float = 10.5

static func river_center_x(world_z: float) -> float:
	return 512.0 + sin((world_z - 160.0) * 0.0065) * 64.0 + cos(world_z * 0.013) * 18.0

static func sample_height(world_x: float, world_z: float) -> float:
	var nx: float = world_x / WORLD_SIZE
	var nz: float = world_z / WORLD_SIZE

	# 1. Gentle sunlit temperate plain (~20.5m, cleanly above 14.0m river level)
	var base_plain: float = 20.5 \
		+ sin(world_x * 0.0085 + 0.4) * 2.3 \
		+ cos(world_z * 0.0092 - 0.3) * 2.0 \
		+ sin((world_x + world_z) * 0.017) * 1.0

	# 2. Scenic alpine mountain ranges framing North, West, and East valley edges
	var edge_n: float = clampf((nz - 0.70) / 0.30, 0.0, 1.0)
	var edge_w: float = clampf((0.18 - nx) / 0.18, 0.0, 1.0)
	var edge_e: float = clampf((nx - 0.84) / 0.16, 0.0, 1.0)
	var m_mask: float = maxf(edge_n, maxf(edge_w * 0.85, edge_e * 0.85))
	var m_smooth: float = m_mask * m_mask * (3.0 - 2.0 * m_mask)

	var ridge: float = absf(sin(world_x * 0.014 + cos(world_z * 0.012) * 1.4)) * 44.0 \
		+ absf(cos(world_z * 0.019 - world_x * 0.009)) * 25.0 \
		+ sin(world_x * 0.045 + world_z * 0.038) * 6.0
	var mountains: float = m_smooth * (18.0 + ridge)

	# 3. Winding navigable river carving smoothly through valley center
	var r_cx: float = river_center_x(world_z)
	var r_half_w: float = 36.0 + clampf((260.0 - world_z) / 260.0, 0.0, 1.0) * 48.0
	var dist_r: float = absf(world_x - r_cx)

	var h: float = base_plain + mountains
	var bank_t: float = clampf((dist_r - r_half_w * 0.65) / (r_half_w * 0.85), 0.0, 1.0)
	var bank_s: float = bank_t * bank_t * (3.0 - 2.0 * bank_t)
	var bed_y: float = 6.0 + sin(world_z * 0.04) * 0.6
	h = lerpf(bed_y, h, bank_s)

	# 4. Southern coastal bay opening smoothly
	if world_z < 135.0:
		var coast_t: float = clampf((world_z - 40.0) / 95.0, 0.0, 1.0)
		var coast_s: float = coast_t * coast_t * (3.0 - 2.0 * coast_t)
		h = lerpf(5.2, h, coast_s)

	return maxf(3.0, h)

static func sample_normal(world_x: float, world_z: float) -> Vector3:
	var eps: float = 2.0
	var hl: float = sample_height(world_x - eps, world_z)
	var hr: float = sample_height(world_x + eps, world_z)
	var hd: float = sample_height(world_x, world_z - eps)
	var hu: float = sample_height(world_x, world_z + eps)
	return Vector3(hl - hr, 2.0 * eps, hd - hu).normalized()

static func is_water(world_x: float, world_z: float) -> bool:
	return sample_height(world_x, world_z) < WATER_LEVEL - 0.15

static func build_terrain_mesh(resolution: int = 160) -> ArrayMesh:
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

			# Triangle 1 (CW winding for Godot Y-up front face)
			st.set_normal(grid_norms[i00]); st.set_uv(Vector2(u0, v0)); st.add_vertex(grid_verts[i00])
			st.set_normal(grid_norms[i10]); st.set_uv(Vector2(u1, v0)); st.add_vertex(grid_verts[i10])
			st.set_normal(grid_norms[i01]); st.set_uv(Vector2(u0, v1)); st.add_vertex(grid_verts[i01])
			# Triangle 2
			st.set_normal(grid_norms[i10]); st.set_uv(Vector2(u1, v0)); st.add_vertex(grid_verts[i10])
			st.set_normal(grid_norms[i11]); st.set_uv(Vector2(u1, v1)); st.add_vertex(grid_verts[i11])
			st.set_normal(grid_norms[i01]); st.set_uv(Vector2(u0, v1)); st.add_vertex(grid_verts[i01])

	return st.commit()

static func build_water_mesh(resolution: int = 160) -> ArrayMesh:
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
			depths[idx] = clampf((WATER_LEVEL - sample_height(wx, wz)) / 8.0, 0.0, 1.0)

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

