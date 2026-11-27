shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform float water_level = 14.0;
uniform vec3 meadow_col_a : source_color = vec3(0.25, 0.38, 0.15);
uniform vec3 meadow_col_b : source_color = vec3(0.18, 0.30, 0.11);
uniform vec3 highland_col : source_color = vec3(0.30, 0.36, 0.20);
uniform vec3 cliff_col_a : source_color = vec3(0.38, 0.39, 0.38);
uniform vec3 cliff_col_b : source_color = vec3(0.24, 0.25, 0.27);
uniform vec3 sand_col : source_color = vec3(0.68, 0.60, 0.46);
uniform vec3 snow_col : source_color = vec3(0.86, 0.90, 0.95);

varying vec3 v_world_pos;
varying vec3 v_world_norm;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 34.5);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int k = 0; k < 4; k++) {
		v += a * vnoise(p);
		p = p * 2.08 + vec2(17.3, 9.2);
		a *= 0.5;
	}
	return v;
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_norm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec2 xz = v_world_pos.xz;
	float h = v_world_pos.y;
	float up = clamp(v_world_norm.y, 0.0, 1.0);

	// Multi-scale natural meadow & soil variation (completely zero repeating tile grid!)
	float macro = fbm(xz * 0.018);
	float mid = fbm(xz * 0.085);
	float micro = vnoise(xz * 0.55);

	vec3 grass = mix(meadow_col_b, meadow_col_a, macro);
	grass *= (0.86 + 0.24 * mid + 0.08 * (micro - 0.5));

	// Highland sage uplands
	float high_t = smoothstep(23.0, 42.0, h);
	vec3 col = mix(grass, highland_col * (0.88 + 0.22 * mid), high_t * 0.72);

	// Stratified Alpine Granite Cliffs on steep slopes & high ridges
	float strata = sin(h * 1.45 + macro * 6.0) * 0.5 + 0.5;
	vec3 rock = mix(cliff_col_b, cliff_col_a, strata * 0.65 + mid * 0.35);
	float slope_rock = smoothstep(0.92, 0.74, up);
	float alt_rock = smoothstep(50.0, 74.0, h) * 0.75;
	float rock_mask = clamp(max(slope_rock, alt_rock), 0.0, 1.0);
	col = mix(col, rock, rock_mask);

	// Alpine snow caps on highest mountain peaks
	float snow_mask = smoothstep(66.0, 82.0, h + (macro - 0.5) * 10.0) * smoothstep(0.62, 0.84, up);
	col = mix(col, snow_col, snow_mask);

	// Sunlit coastal beach & river sand + damp waterline darkening
	float sand_mask = 1.0 - smoothstep(water_level - 0.5, water_level + 3.0, h);
	vec3 sand = sand_col * (0.90 + 0.18 * micro);
	col = mix(col, sand, sand_mask * 0.92);

	float wet_mask = 1.0 - smoothstep(water_level - 0.4, water_level + 1.1, h);
	col *= mix(1.0, 0.68, wet_mask);

	ALBEDO = col;
	ROUGHNESS = mix(0.88 - 0.08 * rock_mask, 0.26, wet_mask);
	METALLIC = 0.02;
	SPECULAR = mix(0.32, 0.65, wet_mask);
}
