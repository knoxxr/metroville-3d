shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 facade_color : source_color = vec3(0.84, 0.88, 0.92);
uniform vec3 glass_tint : source_color = vec3(0.32, 0.55, 0.78);
uniform vec3 night_glow_color : source_color = vec3(1.0, 0.84, 0.54);
uniform float floors_per_meter = 0.28;
uniform float windows_per_meter = 0.25;
uniform float mullion_width = 0.14;
uniform float night_factor = 0.0;

varying vec3 v_world_pos;
varying vec3 v_world_norm;

float hash21(vec2 p) {
	p = fract(p * vec2(234.34, 435.345));
	p += dot(p, p + 34.23);
	return fract(p.x * p.y);
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_norm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 n = normalize(v_world_norm);
	vec3 v = normalize(CAMERA_POSITION_WORLD - v_world_pos);

	// Roof membrane
	if (abs(n.y) > 0.75) {
		ALBEDO = facade_color * vec3(0.75, 0.77, 0.80);
		ROUGHNESS = 0.84;
		METALLIC = 0.04;
	} else {
		// World-space architectural curtain-wall grid (zero texture stretching!)
		float horiz = abs(n.x) > 0.5 ? v_world_pos.z : v_world_pos.x;
		vec2 grid_uv = vec2(horiz * windows_per_meter, v_world_pos.y * floors_per_meter);
		vec2 cell_id = floor(grid_uv);
		vec2 cell_uv = fract(grid_uv);

		float m_x = step(cell_uv.x, mullion_width) + step(1.0 - mullion_width * 0.55, cell_uv.x);
		float m_y = step(cell_uv.y, mullion_width * 1.45) + step(1.0 - mullion_width * 0.55, cell_uv.y);
		float is_mullion = clamp(m_x + m_y, 0.0, 1.0);

		// 3D Interior Room Parallax Mapping inside every window!
		vec3 view_local = vec3(
			abs(n.x) > 0.5 ? v.z * sign(n.x) : v.x * -sign(n.z),
			v.y,
			max(abs(dot(v, n)), 0.16)
		);
		vec2 back_uv = clamp(cell_uv - (view_local.xy / view_local.z) * 0.34, 0.0, 1.0);
		float room_rand = hash21(cell_id + floor(v_world_pos.xz * 0.04));

		vec3 room_col = mix(vec3(0.22, 0.26, 0.34), vec3(0.58, 0.62, 0.68), back_uv.y) * (0.76 + 0.38 * room_rand);

		// Fresnel sky reflection on architectural curtain-wall glass
		float fres = 0.10 + 0.90 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.4);
		vec3 r_dir = reflect(-v, n);
		vec3 sky_refl = mix(vec3(0.54, 0.72, 0.90), vec3(0.90, 0.95, 1.0), clamp(r_dir.y * 1.4 + 0.25, 0.0, 1.0));
		vec3 glass_col = mix(room_col * glass_tint * 1.45, sky_refl, clamp(fres * 0.78, 0.0, 0.85));

		// Subtle vertical contact AO near ground street level
		float ground_ao = clamp(0.76 + (v_world_pos.y - 16.0) * 0.015, 0.74, 1.0);

		ALBEDO = mix(glass_col, facade_color, is_mullion) * ground_ao;
		ROUGHNESS = mix(0.08, 0.76, is_mullion);
		METALLIC = mix(0.68, 0.08, is_mullion);
		SPECULAR = mix(0.92, 0.35, is_mullion);

		// Randomized warm office/apartment room lighting at sunset & night
		float lit_room = step(0.42, room_rand) * night_factor * (1.0 - is_mullion);
		EMISSION = night_glow_color * lit_room * (0.95 + 0.6 * back_uv.y);
	}
}
