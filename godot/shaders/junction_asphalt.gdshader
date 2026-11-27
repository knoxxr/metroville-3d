shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform vec3 asphalt_base : source_color = vec3(0.16, 0.18, 0.22);
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
	// World-space micro asphalt grain matching road_pbr.gdshader seamlessly (zero UV distortion on junctions!)
	float grain = hash21(floor(v_world_pos.xz * 3.5)) * 0.055 - 0.0275;
	float macro = sin(v_world_pos.x * 0.17) * cos(v_world_pos.z * 0.19) * 0.014;
	vec3 col = asphalt_base + vec3(grain + macro);

	if (congestion_tint > 0.01) {
		vec3 heat = mix(vec3(0.14, 0.80, 0.36), vec3(0.96, 0.24, 0.22), clamp(congestion_tint, 0.0, 1.0));
		col = mix(col, heat, 0.58);
	}

	ALBEDO = col;
	ROUGHNESS = 0.74 + grain * 1.2;
	METALLIC = 0.04;
}
