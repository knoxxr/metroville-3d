shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform vec3 asphalt_base : source_color = vec3(0.16, 0.18, 0.22);
uniform vec3 lane_color : source_color = vec3(0.88, 0.91, 0.95);
uniform vec3 center_line_color : source_color = vec3(0.92, 0.74, 0.18);
uniform int lane_count = 4;
uniform float congestion_tint = 0.0; // 0 = normal asphalt, >0 = traffic heatmap overlay

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 31.7);
	return fract(p.x * p.y);
}

void fragment() {
	vec2 uv = UV;
	float grain = hash21(floor(uv * vec2(90.0, 28.0))) * 0.07 - 0.035;
	vec3 col = asphalt_base + vec3(grain);

	// Subtle dark tire wear tracks along lanes
	float track = smoothstep(0.18, 0.0, abs(abs(uv.x - 0.5) - 0.25));
	col *= (1.0 - track * 0.12);

	// Double yellow center divider
	float center_d = abs(uv.x - 0.5);
	float double_yellow = step(0.010, center_d) * (1.0 - step(0.028, center_d));
	col = mix(col, center_line_color, double_yellow * 0.92);

	// Dashed white lane dividers for 4-lane / 6-lane avenues & highways
	if (lane_count >= 4) {
		float dash = step(0.45, fract(uv.y * 0.45));
		float lane_line = (1.0 - step(0.011, abs(uv.x - 0.25))) + (1.0 - step(0.011, abs(uv.x - 0.75)));
		col = mix(col, lane_color, clamp(lane_line, 0.0, 1.0) * dash * 0.88);
	}

	// Crisp white edge lines
	float edge_line = (1.0 - step(0.022, uv.x)) + step(0.978, uv.x);
	col = mix(col, lane_color, clamp(edge_line, 0.0, 1.0) * 0.65);

	// Optional Traffic InfoView Heatmap Overlay
	if (congestion_tint > 0.01) {
		vec3 heat = mix(vec3(0.14, 0.80, 0.36), vec3(0.96, 0.24, 0.22), clamp(congestion_tint, 0.0, 1.0));
		col = mix(col, heat, 0.62);
	}

	ALBEDO = col;
	ROUGHNESS = 0.72 + grain * 1.4;
	METALLIC = 0.04;
}
