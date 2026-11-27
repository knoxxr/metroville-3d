shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 shallow_color : source_color = vec3(0.11, 0.42, 0.50);
uniform vec3 deep_color : source_color = vec3(0.04, 0.16, 0.27);
uniform vec3 sky_reflect_color : source_color = vec3(0.46, 0.68, 0.88);
uniform vec3 foam_color : source_color = vec3(0.88, 0.94, 0.98);
uniform float wave_speed = 0.65;

varying vec3 v_world_pos;
varying float v_depth;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 41.3);
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

float wave_h(vec2 xz, float t) {
	vec2 p = xz * 0.095;
	float w = sin(p.x * 1.4 + p.y * 0.9 - t * 1.5) * 0.42;
	w += cos(p.x * 2.4 - p.y * 1.9 - t * 1.15) * 0.28;
	w += (vnoise(p * 2.1 + vec2(t * 0.38, -t * 0.28)) - 0.5) * 0.68;
	w += (vnoise(p * 5.2 + vec2(-t * 0.55, t * 0.42)) - 0.5) * 0.30;
	return w;
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_depth = COLOR.r;
}

void fragment() {
	if (v_depth <= 0.005) {
		discard;
	}
	float t = TIME * wave_speed;
	float eps = 0.30;
	float hc = wave_h(v_world_pos.xz, t);
	float hx = wave_h(v_world_pos.xz + vec2(eps, 0.0), t);
	float hz = wave_h(v_world_pos.xz + vec2(0.0, eps), t);
	vec3 world_n = normalize(vec3((hc - hx) * 0.42, 1.0, (hc - hz) * 0.42));

	// Beer-Lambert depth absorption from turquoise shallows to rich cerulean river navy
	float depth_t = smoothstep(0.04, 0.72, v_depth);
	vec3 water_body = mix(shallow_color, deep_color, depth_t);
	// Subtle dark riverbank ambient shadow
	water_body *= mix(0.76, 1.0, smoothstep(0.02, 0.30, v_depth));

	// Physical Schlick Fresnel sky + drifting cumulus cloud reflections
	vec3 view_dir_w = normalize(CAMERA_POSITION_WORLD - v_world_pos);
	vec3 refl_dir = reflect(-view_dir_w, world_n);
	float ndotv = clamp(dot(world_n, view_dir_w), 0.0, 1.0);
	float fresnel = 0.04 + 0.86 * pow(1.0 - ndotv, 4.2);

	vec2 cuv = refl_dir.xz / max(refl_dir.y + 0.26, 0.15) * 1.05 + vec2(TIME * 0.007, 0.0);
	float cloud = smoothstep(0.50, 0.80, vnoise(cuv * 1.7) * 0.65 + vnoise(cuv * 3.8) * 0.35);
	vec3 sky_refl = mix(sky_reflect_color * 0.72, sky_reflect_color * 1.05, clamp(refl_dir.y * 1.5, 0.0, 1.0));
	sky_refl = mix(sky_refl, vec3(0.92, 0.95, 0.99), cloud * 0.36);

	vec3 col = mix(water_body, sky_refl, clamp(fresnel * 0.70, 0.0, 0.74));

	// Organic shoreline foam lap right along riverbanks
	float foam_noise = vnoise(v_world_pos.xz * 0.38 + vec2(t * 0.8, -t * 0.5));
	float shore = 1.0 - smoothstep(0.01, 0.16, v_depth);
	float foam = smoothstep(0.32, 0.80, shore * (0.65 + foam_noise * 0.65));
	col = mix(col, foam_color, foam * 0.48);

	ALBEDO = col;
	ROUGHNESS = mix(0.10, 0.45, foam);
	METALLIC = 0.18;
	SPECULAR = 0.85;
	NORMAL = normalize((VIEW_MATRIX * vec4(world_n, 0.0)).xyz);
	ALPHA = smoothstep(0.005, 0.10, v_depth) * 0.96;
}
