class_name SkylinesCamera
extends Camera3D

var target := Vector3(TerrainField.WORLD_CENTER, 24.0, TerrainField.WORLD_CENTER)
var yaw_deg: float = 32.0
var pitch_deg: float = 34.0
var distance: float = 360.0

var _cur_target := Vector3(TerrainField.WORLD_CENTER, 24.0, TerrainField.WORLD_CENTER)
var _cur_yaw: float = 32.0
var _cur_pitch: float = 34.0
var _cur_dist: float = 360.0

var _dragging_orbit := false
var _dragging_pan := false
var allow_left_pan: bool = true
var left_drag_moved_px: float = 0.0
var is_multi_touching: bool = false
var _touches: Dictionary = {}
var _prev_pinch_dist: float = 0.0
var _prev_two_center := Vector2.ZERO

const MIN_DIST: float = 36.0
const MAX_DIST: float = 1750.0

func _ready() -> void:
	fov = 42.0
	near = 1.2
	far = 9500.0
	snap_immediately()

func focus_on(world_pos: Vector3, zoom_dist: float = 155.0) -> void:
	target = Vector3(
		clampf(world_pos.x, 180.0, TerrainField.WORLD_SIZE - 180.0),
		maxf(TerrainField.WATER_LEVEL, TerrainField.sample_height(world_pos.x, world_pos.z)),
		clampf(world_pos.z, 180.0, TerrainField.WORLD_SIZE - 180.0)
	)
	distance = clampf(minf(distance, zoom_dist), MIN_DIST, MAX_DIST)

func set_satellite_overview() -> void:
	target = Vector3(TerrainField.WORLD_CENTER, 26.0, TerrainField.WORLD_CENTER - 160.0)
	yaw_deg = 18.0
	pitch_deg = 26.0
	distance = 1320.0

func set_downtown_view() -> void:
	target = Vector3(TerrainField.WORLD_CENTER - 10.0, 24.0, TerrainField.WORLD_CENTER - 20.0)
	yaw_deg = 26.0
	pitch_deg = 29.0
	distance = 365.0

func snap_immediately() -> void:
	_cur_target = target
	_cur_yaw = yaw_deg
	_cur_pitch = pitch_deg
	_cur_dist = distance
	_apply_transform()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var st: InputEventScreenTouch = event
		if st.pressed:
			_touches[st.index] = st.position
			if _touches.size() >= 2:
				is_multi_touching = true
				_dragging_pan = false
				left_drag_moved_px = 999.0
				var ks := _touches.keys()
				var p0: Vector2 = _touches[ks[0]]
				var p1: Vector2 = _touches[ks[1]]
				_prev_pinch_dist = p0.distance_to(p1)
				_prev_two_center = (p0 + p1) * 0.5
		else:
			_touches.erase(st.index)
			if _touches.size() < 2:
				_prev_pinch_dist = 0.0
				if is_multi_touching:
					left_drag_moved_px = 999.0
			if _touches.is_empty():
				is_multi_touching = false
		return
	elif event is InputEventScreenDrag:
		var sd: InputEventScreenDrag = event
		_touches[sd.index] = sd.position
		if _touches.size() >= 2:
			is_multi_touching = true
			_dragging_pan = false
			left_drag_moved_px = 999.0
			var ks := _touches.keys()
			var p0: Vector2 = _touches[ks[0]]
			var p1: Vector2 = _touches[ks[1]]
			var cur_dist := p0.distance_to(p1)
			var cur_mid := (p0 + p1) * 0.5
			if _prev_pinch_dist > 12.0 and cur_dist > 12.0:
				distance = clampf(distance * (_prev_pinch_dist / cur_dist), MIN_DIST, MAX_DIST)
			if _prev_two_center.length_squared() > 0.0:
				var dm := cur_mid - _prev_two_center
				yaw_deg -= dm.x * 0.24
				pitch_deg = clampf(pitch_deg + dm.y * 0.20, 14.0, 78.0)
			_prev_pinch_dist = cur_dist
			_prev_two_center = cur_mid
		return

	if is_multi_touching:
		return

	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_dragging_orbit = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_MIDDLE:
			_dragging_pan = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_LEFT and allow_left_pan:
			if mb.pressed:
				_dragging_pan = true
				left_drag_moved_px = 0.0
			else:
				_dragging_pan = false
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			distance = clampf(distance * 0.87, MIN_DIST, MAX_DIST)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			distance = clampf(distance * 1.15, MIN_DIST, MAX_DIST)
	elif event is InputEventMouseMotion:
		var mm: InputEventMouseMotion = event
		if _dragging_orbit:
			yaw_deg -= mm.relative.x * 0.28
			pitch_deg = clampf(pitch_deg + mm.relative.y * 0.24, 14.0, 78.0)
		elif _dragging_pan:
			left_drag_moved_px += mm.relative.length()
			var rad := deg_to_rad(yaw_deg)
			var right := Vector3(cos(rad), 0.0, -sin(rad))
			var fwd := Vector3(-sin(rad), 0.0, -cos(rad))
			var sc := distance * 0.0018
			target -= right * mm.relative.x * sc
			target += fwd * mm.relative.y * sc

func _process(delta: float) -> void:
	var h := 0.0
	var v := 0.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): h -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): h += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): v += 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): v -= 1.0
	if Input.is_key_pressed(KEY_Q): yaw_deg += 68.0 * delta
	if Input.is_key_pressed(KEY_E): yaw_deg -= 68.0 * delta

	if absf(h) > 0.01 or absf(v) > 0.01:
		var rad := deg_to_rad(yaw_deg)
		var right := Vector3(cos(rad), 0.0, -sin(rad))
		var fwd := Vector3(-sin(rad), 0.0, -cos(rad))
		var spd := maxf(65.0, distance * 1.15) * delta
		target += (right * h + fwd * v).normalized() * spd

	target.x = clampf(target.x, 180.0, TerrainField.WORLD_SIZE - 180.0)
	target.z = clampf(target.z, 180.0, TerrainField.WORLD_SIZE - 180.0)
	target.y = maxf(TerrainField.WATER_LEVEL, TerrainField.sample_height(target.x, target.z))

	var k := 1.0 - exp(-10.0 * delta)
	_cur_target = _cur_target.lerp(target, k)
	_cur_yaw = lerpf(_cur_yaw, yaw_deg, k)
	_cur_pitch = lerpf(_cur_pitch, pitch_deg, k)
	_cur_dist = lerpf(_cur_dist, distance, k)
	_apply_transform()

func _apply_transform() -> void:
	var ry := deg_to_rad(_cur_yaw)
	var rp := deg_to_rad(_cur_pitch)
	var offset := Vector3(
		sin(ry) * cos(rp) * _cur_dist,
		sin(rp) * _cur_dist,
		cos(ry) * cos(rp) * _cur_dist
	)
	global_position = _cur_target + offset
	look_at(_cur_target, Vector3.UP)
