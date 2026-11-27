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
	v_world_norm = normalize(MODEL_NORMAL_MATRIX * NORMAL);
}

void fragment() {
	vec3 n = normalize(v_world_norm);
	vec3 v = normalize(CAMERA_POSITION_WORLD - v_world_pos);

	// Roof gravel/tar membrane with subtle structural expansion seams
	if (abs(n.y) > 0.75) {
		vec2 r_uv = v_world_pos.xz * 0.25;
		float seam = step(0.95, fract(r_uv.x)) + step(0.95, fract(r_uv.y));
		float gravel = hash21(floor(v_world_pos.xz * 3.5)) * 0.10;
		vec3 roof_base = facade_color * vec3(0.56, 0.58, 0.62) + vec3(gravel);
		ALBEDO = mix(roof_base, roof_base * 0.75, clamp(seam, 0.0, 1.0));
		ROUGHNESS = 0.88;
		METALLIC = 0.05;
	} else {
		// World-space architectural curtain-wall grid (zero texture stretching!)
		float horiz = abs(n.x) > 0.5 ? v_world_pos.z : v_world_pos.x;
		vec2 grid_uv = vec2(horiz * windows_per_meter, v_world_pos.y * floors_per_meter);
		vec2 cell_id = floor(grid_uv);
		vec2 cell_uv = fract(grid_uv);

		// Structural floor spandrel band + vertical aluminum/stone mullions
		float is_spandrel = step(cell_uv.y, mullion_width * 1.55) + step(1.0 - mullion_width * 0.45, cell_uv.y);
		float is_pillar = step(cell_uv.x, mullion_width * 0.92) + step(1.0 - mullion_width * 0.48, cell_uv.x);
		float is_mullion = clamp(is_spandrel + is_pillar, 0.0, 1.0);
		float inner_bevel = smoothstep(0.0, 0.06, cell_uv.x - mullion_width * 0.92) * smoothstep(0.0, 0.06, (1.0 - mullion_width * 0.48) - cell_uv.x);

		// 3D Interior Room Parallax Mapping + randomized venetian blinds/curtains inside every window!
		vec3 view_local = vec3(
			abs(n.x) > 0.5 ? v.z * sign(n.x) : v.x * -sign(n.z),
			v.y,
			max(abs(dot(v, n)), 0.16)
		);
		vec2 back_uv = clamp(cell_uv - (view_local.xy / view_local.z) * 0.36, 0.0, 1.0);
		float room_rand = hash21(cell_id + floor(v_world_pos.xz * 0.04));
		float blind_rand = hash21(cell_id * 1.73 + vec2(11.4, 5.2));
		float blind_drop = mix(0.62, 0.98, blind_rand);
		float is_blind = step(blind_drop, cell_uv.y) * step(0.35, blind_rand);

		vec3 warm_wall = mix(vec3(0.18, 0.22, 0.29), vec3(0.56, 0.59, 0.64), back_uv.y);
		vec3 room_col = warm_wall * (0.72 + 0.44 * room_rand);
		// Subtle ceiling light strip inside deep rooms
		float ceiling_strip = smoothstep(0.76, 0.92, back_uv.y) * smoothstep(0.2, 0.4, back_uv.x) * smoothstep(0.8, 0.6, back_uv.x);
		room_col += vec3(0.24, 0.22, 0.18) * ceiling_strip * step(0.48, room_rand);
		room_col = mix(room_col, vec3(0.76, 0.78, 0.80), is_blind * 0.65);

		// Fresnel sky & horizon reflection on architectural curtain-wall glass
		float fres = 0.12 + 0.88 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.2);
		vec3 r_dir = reflect(-v, n);
		vec3 sky_refl = mix(vec3(0.46, 0.64, 0.82), vec3(0.90, 0.95, 1.0), clamp(r_dir.y * 1.45 + 0.22, 0.0, 1.0));
		vec3 glass_col = mix(room_col * glass_tint * 1.38, sky_refl, clamp(fres * 0.72, 0.0, 0.82));
		glass_col *= mix(0.78, 1.0, inner_bevel);

		// Architectural spandrel stone/cladding micro-grain & subtle darker horizontal cornice tone
		float stone_grain = (hash21(floor(vec2(horiz * 2.5, v_world_pos.y * 2.5))) - 0.5) * 0.06;
		vec3 frame_col = facade_color * mix(1.0, 0.86, clamp(is_spandrel, 0.0, 1.0)) + vec3(stone_grain);

		// Subtle vertical contact AO near ground street level
		float ground_ao = clamp(0.76 + (v_world_pos.y - 16.0) * 0.015, 0.74, 1.0);

		ALBEDO = mix(glass_col, frame_col, is_mullion) * ground_ao;
		ROUGHNESS = mix(0.07, 0.72, is_mullion);
		METALLIC = mix(0.72, 0.14, is_mullion);
		SPECULAR = mix(0.94, 0.38, is_mullion);

		// Randomized warm office/apartment room lighting at sunset & night
		float lit_room = step(0.40, room_rand) * night_factor * (1.0 - is_mullion) * (1.0 - is_blind * 0.45);
		EMISSION = night_glow_color * lit_room * (0.95 + 0.65 * back_uv.y);
	}
}
