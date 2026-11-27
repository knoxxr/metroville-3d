shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform vec3 asphalt_base : source_color = vec3(0.16, 0.18, 0.22);
uniform vec3 lane_color : source_color = vec3(0.88, 0.91, 0.95);
uniform vec3 center_line_color : source_color = vec3(0.92, 0.74, 0.20);
uniform int lane_count = 4;
uniform float seg_length = 100.0;
uniform float has_start_xwalk = 0.0;
uniform float has_end_xwalk = 0.0;
uniform float congestion_tint = 0.0;

varying vec3 v_world_pos;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 31.7);
	return fract(p.x * p.y);
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 uv = UV;
	// World-space aggregate asphalt grain matching junction_asphalt.gdshader seamlessly!
	float grain = hash21(floor(v_world_pos.xz * 3.5)) * 0.055 - 0.0275;
	float macro = sin(v_world_pos.x * 0.17) * cos(v_world_pos.z * 0.19) * 0.014;
	vec3 col = asphalt_base + vec3(grain + macro);

	// Distance in real meters along the trimmed road ribbon (uv.y = meters * 0.1)
	float dist_start = uv.y * 10.0;
	float dist_end = max(0.0, seg_length - dist_start);

	// Subtle tire wear tracks centered in each lane
	float lane_phase = fract(uv.x * float(lane_count));
	float track = smoothstep(0.32, 0.0, abs(lane_phase - 0.5));
	col *= (1.0 - track * 0.10);

	// Check if pixel lies in intersection approach crosswalk or stop-bar zone
	bool in_start_xwalk = (has_start_xwalk > 0.5) && (dist_start >= 0.45 && dist_start <= 3.35);
	bool in_end_xwalk = (has_end_xwalk > 0.5) && (dist_end >= 0.45 && dist_end <= 3.35);
	bool in_start_clear = (has_start_xwalk > 0.5) && (dist_start < 4.4);
	bool in_end_clear = (has_end_xwalk > 0.5) && (dist_end < 4.4);

	if (in_start_xwalk || in_end_xwalk) {
		// Crisp Korean / Cities: Skylines zebra crosswalk bars across carriageway
		float stripe_freq = float(lane_count) * 3.0;
		float stripe = step(0.42, fract(uv.x * stripe_freq));
		float margin = step(0.045, uv.x) * step(uv.x, 0.955);
		col = mix(col, lane_color, stripe * margin * 0.86);
	} else {
		// Solid white stop bars strictly on approaching right-hand lanes just behind crosswalk
		bool start_stop = (has_start_xwalk > 0.5) && (dist_start >= 3.85 && dist_start <= 4.35) && (uv.x > 0.04 && uv.x < 0.475);
		bool end_stop = (has_end_xwalk > 0.5) && (dist_end >= 3.85 && dist_end <= 4.35) && (uv.x > 0.525 && uv.x < 0.96);
		if (start_stop || end_stop) {
			col = mix(col, lane_color, 0.88);
		}

		// Main carriageway markings (cleanly terminated before crosswalks!)
		if (!in_start_clear && !in_end_clear) {
			// Crisp outer white shoulder lines
			float edge = (1.0 - step(0.020, uv.x)) + step(0.980, uv.x);
			col = mix(col, lane_color, clamp(edge, 0.0, 1.0) * 0.62);

			// Double yellow center divider (solid on 4/6-lane, subtle narrow pair on 2-lane)
			float cd = abs(uv.x - 0.5);
			float yellow_line = step(0.008, cd) * (1.0 - step(0.022, cd));
			col = mix(col, center_line_color, yellow_line * 0.90);

			// Realistic 3m dash / 5m gap white lane dividers
			float dash = step(0.625, fract(dist_start / 8.0));
			if (lane_count == 4) {
				float l4 = (1.0 - step(0.010, abs(uv.x - 0.25))) + (1.0 - step(0.010, abs(uv.x - 0.75)));
				col = mix(col, lane_color, clamp(l4, 0.0, 1.0) * dash * 0.84);
			} else if (lane_count >= 6) {
				float l6 = (1.0 - step(0.008, abs(uv.x - 0.1667)))
					+ (1.0 - step(0.008, abs(uv.x - 0.3333)))
					+ (1.0 - step(0.008, abs(uv.x - 0.6667)))
					+ (1.0 - step(0.008, abs(uv.x - 0.8333)));
				col = mix(col, lane_color, clamp(l6, 0.0, 1.0) * dash * 0.84);
			}
		} else {
			// Continuous edge lines & solid center divider between stop-bar and crosswalk
			float edge = (1.0 - step(0.020, uv.x)) + step(0.980, uv.x);
			col = mix(col, lane_color, clamp(edge, 0.0, 1.0) * 0.55);
			float cd = abs(uv.x - 0.5);
			float yellow_line = step(0.008, cd) * (1.0 - step(0.022, cd));
			col = mix(col, center_line_color, yellow_line * 0.88);
		}
	}

	if (congestion_tint > 0.01) {
		vec3 heat = mix(vec3(0.14, 0.80, 0.36), vec3(0.96, 0.24, 0.22), clamp(congestion_tint, 0.0, 1.0));
		col = mix(col, heat, 0.58);
	}

	ALBEDO = col;
	ROUGHNESS = 0.74 + grain * 1.2;
	METALLIC = 0.04;
}
