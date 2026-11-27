class_name SkylinesHUD
extends CanvasLayer

signal speed_changed(mult: float)
signal lighting_cycled
signal reset_requested
signal infoview_changed(mode: String)
signal tool_selected(tool_mode: String, sub_id: String, curved: bool)
signal bulldoze_building_requested(bid: int)
signal event_clicked
signal view_preset_requested(preset: String)

var _btn_chirper: Button
var _lbl_clock: Label
var _lbl_city: Label
var _lbl_treasury: Label
var _lbl_pop: Label
var _lbl_kpi: Label
var _btn_light: Button
var _rci_r: ColorRect
var _rci_c: ColorRect
var _rci_i: ColorRect

var _iv_drawer: PanelContainer
var _econ_modal: PanelContainer
var _insp_card: PanelContainer
var _sub_tray: PanelContainer
var _sub_items: HBoxContainer
var _sub_hint: Label
var _road_mode_box: HBoxContainer

var _lbl_econ_inc: Label
var _lbl_econ_upk: Label
var _lbl_econ_net: Label
var _lbl_supply: Label
var _lbl_edu: Label
var _supply_fill: ColorRect

var _lbl_insp_title: Label
var _lbl_insp_lvl: Label
var _lbl_insp_stats: Label
var _btn_hist: Button
var _inspected_id: int = -1

var _cat_buttons: Dictionary = {}
var _spd_buttons: Dictionary = {}
var _curved_road: bool = true
var _active_road_sub: String = "four_lane"
var _sim_ref: CitySimulation

func setup(sim: CitySimulation) -> void:
	_sim_ref = sim
	_build_ui()

func is_pointer_over_ui(pos: Vector2) -> bool:
	var vp := get_viewport().get_visible_rect().size
	if pos.y > vp.y - 165.0 or pos.y < 64.0:
		return true
	if _econ_modal.visible and _econ_modal.get_global_rect().has_point(pos):
		return true
	if _insp_card.visible and _insp_card.get_global_rect().has_point(pos):
		return true
	if _iv_drawer.visible and _iv_drawer.get_global_rect().has_point(pos):
		return true
	return false

func set_lighting_label(text: String) -> void:
	if _btn_light != null:
		_btn_light.text = text

func show_inspector(b: Dictionary) -> void:
	if b.is_empty():
		_inspected_id = -1
		_insp_card.visible = false
		return
	_inspected_id = b["id"]
	_insp_card.visible = true
	_refresh_inspector(b)

func refresh_telemetry(sim: CitySimulation) -> void:
	var s: Dictionary = sim.state
	var hh: int = int(floor(s["time_hours"])) % 24
	var mm: int = int(floor((s["time_hours"] - floor(s["time_hours"])) * 60.0))
	_lbl_clock.text = "Day %d · %02d:%02d" % [s["day"], hh, mm]
	_lbl_city.text = s["city_name"]
	var sign_s := "+" if s["daily_net"] >= 0 else ""
	_lbl_treasury.text = "₩%s (%s₩%s/일)" % [_fmt_num(s["treasury"]), sign_s, _fmt_num(s["daily_net"])]
	_lbl_pop.text = "인구 %s명" % _fmt_num(s["population"])
	_lbl_kpi.text = "행복 %d%% · 교통 %d%%" % [int(s["happiness"] * 100.0), int(s["traffic_flow"] * 100.0)]

	var status_msg: String = s.get("event_text", "")
	if status_msg.is_empty():
		status_msg = "#%s | 인구 %s명 · 실업률 %d%% · 물류 충족 %d%% [클릭하여 이동]" % [
			s["city_name"], _fmt_num(s["population"]), int(s["unemployment"] * 100.0), int(s["goods_ratio"] * 100.0)
		]
	_btn_chirper.text = status_msg

	_rci_r.custom_minimum_size.y = clampf(s["demand_r"] * 38.0, 4.0, 38.0)
	_rci_c.custom_minimum_size.y = clampf(s["demand_c"] * 38.0, 4.0, 38.0)
	_rci_i.custom_minimum_size.y = clampf(s["demand_i"] * 38.0, 4.0, 38.0)

	if _econ_modal.visible:
		_lbl_econ_inc.text = "일일 세수 수입: +₩%s" % _fmt_num(s["daily_income"])
		_lbl_econ_upk.text = "일일 유지 비용: -₩%s" % _fmt_num(s["daily_upkeep"])
		_lbl_econ_net.text = "순수익: %s₩%s / 일" % [sign_s, _fmt_num(s["daily_net"])]
		_lbl_supply.text = "산업 생산 %.0f / 상업 수요 %.0f · 충족 %d%% (수입 %.0f · 수출 %.0f)" % [
			s["goods_prod"], s["goods_demand"], int(s["goods_ratio"] * 100.0), s["goods_import"], s["goods_export"]
		]
		_supply_fill.custom_minimum_size.x = clampf(s["goods_ratio"] * 280.0, 8.0, 280.0)
		_lbl_edu.text = "미교육 %d%% · 초등 %d%% · 고등 %d%% · 대졸 %d%%  |  고용 %s / 일자리 %s" % [
			int(s["edu_unedu"] * 100.0), int(s["edu_basic"] * 100.0), int(s["edu_well"] * 100.0), int(s["edu_high"] * 100.0),
			_fmt_num(s["employed"]), _fmt_num(s["total_jobs"])
		]

	if _inspected_id > 0:
		for b in sim.buildings:
			if b["id"] == _inspected_id:
				_refresh_inspector(b)
				break

func _refresh_inspector(b: Dictionary) -> void:
	var sp: Dictionary = CitySimulation.BUILDING_SPECS[b["type"]]
	_lbl_insp_title.text = "%s  #%d" % [sp["name"], b["id"]]
	var stars := "★".repeat(b["level"]) + "☆".repeat(5 - b["level"])
	_lbl_insp_lvl.text = "%s   Lv.%d / 5" % [stars, b["level"]]
	_lbl_insp_stats.text = "거주민 %d명 · 일자리 %d명 · 높이 %.0fm\n전력 %s · 수도 %s · 물류 %s" % [
		b["residents"], b["jobs"], b["h"],
		"정상" if b["has_power"] else "부족",
		"정상" if b["has_water"] else "부족",
		"정상" if b["has_goods"] else "부족"
	]
	_btn_hist.text = "역사 건물 잠금: ON" if b["historical"] else "역사 건물 잠금: OFF"

func _build_ui() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Crisp Korean SystemFont fallback across Windows / Linux / macOS
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "NanumGothic", "Apple SD Gothic Neo", "Segoe UI", "DejaVu Sans"])
	theme.default_font = font
	theme.default_font_size = 13
	root.theme = theme
	add_child(root)

	# 1. TOP BAR
	var top_bar := HBoxContainer.new()
	top_bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_bar.offset_left = 16; top_bar.offset_right = -16; top_bar.offset_top = 12; top_bar.offset_bottom = 54
	top_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(top_bar)

	var btn_iv := _make_btn("i", Vector2(40, 40), Color(0.01, 0.52, 0.78))
	btn_iv.pressed.connect(func(): _iv_drawer.visible = not _iv_drawer.visible)
	top_bar.add_child(btn_iv)

	var sp1 := Control.new(); sp1.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sp1.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar.add_child(sp1)

	_btn_chirper = _make_btn("#Neo Metropolia [클릭하여 위치 이동]", Vector2(420, 38), Color(0.06, 0.11, 0.19))
	_btn_chirper.pressed.connect(func(): event_clicked.emit())
	top_bar.add_child(_btn_chirper)

	var sp2 := Control.new(); sp2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sp2.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar.add_child(sp2)

	var btn_econ := _make_btn("재정 · 공급망", Vector2(108, 36), Color(0.10, 0.16, 0.26))
	btn_econ.pressed.connect(func(): _econ_modal.visible = not _econ_modal.visible)
	top_bar.add_child(btn_econ)

	_btn_light = _make_btn("주간", Vector2(68, 36), Color(0.10, 0.16, 0.26))
	_btn_light.pressed.connect(func(): lighting_cycled.emit())
	top_bar.add_child(_btn_light)

	var btn_view := _make_btn("광역 뷰", Vector2(78, 36), Color(0.08, 0.34, 0.54))
	btn_view.pressed.connect(func():
		var is_sat := btn_view.text == "광역 뷰"
		btn_view.text = "도심 뷰" if is_sat else "광역 뷰"
		view_preset_requested.emit("satellite" if is_sat else "downtown")
	)
	top_bar.add_child(btn_view)

	var btn_reset := _make_btn("데모 리셋", Vector2(82, 36), Color(0.10, 0.16, 0.26))
	btn_reset.pressed.connect(func(): reset_requested.emit())
	top_bar.add_child(btn_reset)

	# 2. INFOVIEWS DRAWER (Top-Left)
	_iv_drawer = _make_glass_panel()
	_iv_drawer.position = Vector2(16, 62)
	_iv_drawer.visible = false
	var iv_vb := VBoxContainer.new(); _iv_drawer.add_child(iv_vb)
	var iv_title := Label.new(); iv_title.text = "도시 정보 오버레이 (InfoViews)"
	iv_title.add_theme_color_override("font_color", Color(0.65, 0.88, 1.0))
	iv_vb.add_child(iv_title)
	var iv_grid := GridContainer.new(); iv_grid.columns = 2; iv_vb.add_child(iv_grid)
	for pair in [["기본 뷰", "none"], ["교통 흐름", "traffic"], ["전력망", "power"], ["상수도", "water"]]:
		var b := _make_btn(pair[0], Vector2(104, 30), Color(0.13, 0.19, 0.30))
		var key: String = pair[1]
		b.pressed.connect(func(): infoview_changed.emit(key))
		iv_grid.add_child(b)
	root.add_child(_iv_drawer)

	# 3. ECONOMY / SUPPLY-CHAIN / EDUCATION MODAL (Center)
	_econ_modal = _make_glass_panel()
	_econ_modal.set_anchors_preset(Control.PRESET_CENTER)
	_econ_modal.offset_left = -290; _econ_modal.offset_right = 290; _econ_modal.offset_top = -175; _econ_modal.offset_bottom = 175
	_econ_modal.visible = false
	var ev := VBoxContainer.new(); _econ_modal.add_child(ev)
	var eh := HBoxContainer.new(); ev.add_child(eh)
	var et := Label.new(); et.text = "도시 재정 · 산업 공급망 · 4단계 시민 교육"
	et.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	eh.add_child(et)
	var ec := _make_btn("X", Vector2(28, 28), Color(0.65, 0.18, 0.22))
	ec.pressed.connect(func(): _econ_modal.visible = false)
	eh.add_child(ec)

	_lbl_econ_inc = Label.new(); _lbl_econ_inc.add_theme_color_override("font_color", Color(0.32, 0.90, 0.54)); ev.add_child(_lbl_econ_inc)
	_lbl_econ_upk = Label.new(); _lbl_econ_upk.add_theme_color_override("font_color", Color(0.98, 0.48, 0.52)); ev.add_child(_lbl_econ_upk)
	_lbl_econ_net = Label.new(); ev.add_child(_lbl_econ_net)

	# Tax sliders (5%..15%)
	for tax_row in [["주거 세율", "tax_res"], ["상업 세율", "tax_com"], ["산업 세율", "tax_ind"]]:
		var th := HBoxContainer.new(); ev.add_child(th)
		var tl := Label.new(); tl.text = "%s 9%%" % tax_row[0]; tl.custom_minimum_size.x = 110; th.add_child(tl)
		var sl := HSlider.new(); sl.min_value = 5; sl.max_value = 15; sl.value = 9; sl.step = 1; sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var key: String = tax_row[1]
		var name_s: String = tax_row[0]
		sl.value_changed.connect(func(v):
			tl.text = "%s %d%%" % [name_s, int(v)]
			if _sim_ref != null:
				_sim_ref.state[key] = v / 100.0
				_sim_ref.run_tick()
		)
		th.add_child(sl)

	_lbl_supply = Label.new(); ev.add_child(_lbl_supply)
	var s_bg := ColorRect.new(); s_bg.color = Color(0.08, 0.11, 0.18); s_bg.custom_minimum_size = Vector2(280, 12); ev.add_child(s_bg)
	_supply_fill = ColorRect.new(); _supply_fill.color = Color(0.22, 0.74, 0.97); _supply_fill.custom_minimum_size = Vector2(240, 12); s_bg.add_child(_supply_fill)
	_lbl_edu = Label.new(); ev.add_child(_lbl_edu)
	root.add_child(_econ_modal)

	# 4. BUILDING INSPECTOR CARD (Right)
	_insp_card = _make_glass_panel()
	_insp_card.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	_insp_card.offset_left = -316; _insp_card.offset_right = -16; _insp_card.offset_top = -110; _insp_card.offset_bottom = 110
	_insp_card.visible = false
	var ivb := VBoxContainer.new(); _insp_card.add_child(ivb)
	var ih := HBoxContainer.new(); ivb.add_child(ih)
	_lbl_insp_title = Label.new(); _lbl_insp_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; ih.add_child(_lbl_insp_title)
	var ic := _make_btn("X", Vector2(26, 26), Color(0.55, 0.18, 0.22))
	ic.pressed.connect(func(): show_inspector({}))
	ih.add_child(ic)
	_lbl_insp_lvl = Label.new(); _lbl_insp_lvl.add_theme_color_override("font_color", Color(0.98, 0.80, 0.18)); ivb.add_child(_lbl_insp_lvl)
	_lbl_insp_stats = Label.new(); ivb.add_child(_lbl_insp_stats)
	var act_h := HBoxContainer.new(); ivb.add_child(act_h)
	_btn_hist = _make_btn("역사 건물 잠금: OFF", Vector2(142, 32), Color(0.14, 0.22, 0.34))
	_btn_hist.pressed.connect(func():
		if _sim_ref != null:
			for b in _sim_ref.buildings:
				if b["id"] == _inspected_id:
					b["historical"] = not b["historical"]
					_refresh_inspector(b)
					break
	)
	act_h.add_child(_btn_hist)
	var btn_del := _make_btn("철거", Vector2(72, 32), Color(0.75, 0.18, 0.20))
	btn_del.pressed.connect(func():
		if _inspected_id > 0:
			bulldoze_building_requested.emit(_inspected_id)
			show_inspector({})
	)
	act_h.add_child(btn_del)
	root.add_child(_insp_card)

	# 5. BOTTOM FLOATING DOCK (Sub-Tool Tray + Main Command Bar)
	var dock := VBoxContainer.new()
	dock.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	dock.offset_top = -152; dock.offset_bottom = -12
	dock.alignment = BoxContainer.ALIGNMENT_END
	dock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(dock)

	# Contextual Sub-Tool Tray
	var sub_center := CenterContainer.new(); sub_center.mouse_filter = Control.MOUSE_FILTER_IGNORE; dock.add_child(sub_center)
	_sub_tray = _make_glass_panel()
	_sub_tray.visible = false
	var st_hb := HBoxContainer.new(); _sub_tray.add_child(st_hb)
	_road_mode_box = HBoxContainer.new(); st_hb.add_child(_road_mode_box)
	var b_str := _make_btn("직선", Vector2(56, 40), Color(0.14, 0.20, 0.30))
	var b_crv := _make_btn("곡선", Vector2(56, 40), Color(0.02, 0.52, 0.78))
	b_str.pressed.connect(func(): _curved_road = false; tool_selected.emit("road", _active_road_sub, false))
	b_crv.pressed.connect(func(): _curved_road = true; tool_selected.emit("road", _active_road_sub, true))
	_road_mode_box.add_child(b_str); _road_mode_box.add_child(b_crv)
	_sub_items = HBoxContainer.new(); st_hb.add_child(_sub_items)
	_sub_hint = Label.new(); _sub_hint.add_theme_color_override("font_color", Color(0.65, 0.76, 0.88)); st_hb.add_child(_sub_hint)
	sub_center.add_child(_sub_tray)

	# Main Command Bar
	var deck_center := CenterContainer.new(); deck_center.mouse_filter = Control.MOUSE_FILTER_IGNORE; dock.add_child(deck_center)
	var main_deck := _make_glass_panel()
	var dh := HBoxContainer.new(); dh.add_theme_constant_override("separation", 14); main_deck.add_child(dh)

	# Speed & Clock
	var spd_vb := VBoxContainer.new(); dh.add_child(spd_vb)
	var spd_hb := HBoxContainer.new(); spd_vb.add_child(spd_hb)
	for sp_item in [["||", 0.0], ["1x", 1.0], ["2x", 2.5], ["3x", 5.0]]:
		var sb := _make_btn(sp_item[0], Vector2(34, 28), Color(0.02, 0.52, 0.78) if sp_item[1] == 1.0 else Color(0.14, 0.20, 0.30))
		var mult: float = sp_item[1]
		sb.pressed.connect(func(): speed_changed.emit(mult))
		_spd_buttons[sp_item[0]] = sb
		spd_hb.add_child(sb)
	_lbl_clock = Label.new(); _lbl_clock.text = "Day 120 · 10:30"; spd_vb.add_child(_lbl_clock)

	# City KPIs
	var kpi1 := VBoxContainer.new(); dh.add_child(kpi1)
	_lbl_city = Label.new(); _lbl_city.text = "Neo Metropolia"; kpi1.add_child(_lbl_city)
	_lbl_treasury = Label.new(); _lbl_treasury.add_theme_color_override("font_color", Color(0.98, 0.82, 0.24)); kpi1.add_child(_lbl_treasury)

	var kpi2 := VBoxContainer.new(); dh.add_child(kpi2)
	_lbl_pop = Label.new(); _lbl_pop.add_theme_color_override("font_color", Color(0.32, 0.80, 1.0)); kpi2.add_child(_lbl_pop)
	_lbl_kpi = Label.new(); kpi2.add_child(_lbl_kpi)

	# RCI Vertical Demand Bars
	var rci_hb := HBoxContainer.new(); rci_hb.alignment = BoxContainer.ALIGNMENT_END; dh.add_child(rci_hb)
	_rci_r = _make_rci_bar(rci_hb, Color(0.16, 0.80, 0.42))
	_rci_c = _make_rci_bar(rci_hb, Color(0.22, 0.56, 0.96))
	_rci_i = _make_rci_bar(rci_hb, Color(0.96, 0.66, 0.16))

	# 6 Category Tabs (Default: 이동 / Move + Click to Inspect)
	var cat_hb := HBoxContainer.new(); dh.add_child(cat_hb)
	for cat in [["이동", "inspect"], ["도로", "roads"], ["인프라", "util"], ["공공", "civic"], ["공원", "park"], ["철거", "bulldoze"]]:
		var cb := _make_btn(cat[0], Vector2(62, 50), Color(0.02, 0.52, 0.78) if cat[1] == "inspect" else Color(0.14, 0.20, 0.30))
		var ckey: String = cat[1]
		cb.pressed.connect(func(): _select_category(ckey))
		_cat_buttons[ckey] = cb
		cat_hb.add_child(cb)

	deck_center.add_child(main_deck)

func _select_category(cat: String) -> void:
	for k in _cat_buttons.keys():
		var col := Color(0.02, 0.52, 0.78) if k == cat else (Color(0.65, 0.16, 0.18) if k == "bulldoze" and k == cat else Color(0.14, 0.20, 0.30))
		_set_btn_color(_cat_buttons[k], col)

	for c in _sub_items.get_children():
		c.queue_free()

	if cat == "inspect" or cat == "bulldoze":
		_sub_tray.visible = false
		tool_selected.emit(cat, "", false)
		return

	_sub_tray.visible = true
	_road_mode_box.visible = (cat == "roads")

	if cat == "roads":
		_add_sub("2차선 도로\n₩70", func(): _active_road_sub = "two_lane"; tool_selected.emit("road", "two_lane", _curved_road))
		_add_sub("4차선 대로\n₩180", func(): _active_road_sub = "four_lane"; tool_selected.emit("road", "four_lane", _curved_road))
		_add_sub("6차선 고속\n₩320", func(): _active_road_sub = "highway"; tool_selected.emit("road", "highway", _curved_road))
		_sub_hint.text = "  곡선: 시작 → 중간곡률 → 끝 클릭 (강 횡단 시 현수교 자동 생성)"
		tool_selected.emit("road", _active_road_sub, _curved_road)
	elif cat == "util":
		_add_sub("풍력 발전\n₩3,200", func(): tool_selected.emit("build", "wind", false))
		_add_sub("태양광\n₩14,000", func(): tool_selected.emit("build", "solar", false))
		_add_sub("취수장\n₩4,500", func(): tool_selected.emit("build", "water", false))
		_sub_hint.text = "  지형을 클릭해 전력·수도 인프라 배치"
		tool_selected.emit("build", "wind", false)
	elif cat == "civic":
		_add_sub("소방서\n₩8,500", func(): tool_selected.emit("build", "fire", false))
		_add_sub("경찰서\n₩9,000", func(): tool_selected.emit("build", "police", false))
		_add_sub("종합병원\n₩18,000", func(): tool_selected.emit("build", "hospital", false))
		_add_sub("국립대\n₩34,000", func(): tool_selected.emit("build", "university", false))
		_sub_hint.text = "  공공시설은 시민 교육과 행복도를 높입니다"
		tool_selected.emit("build", "fire", false)
	elif cat == "park":
		_add_sub("센트럴 공원\n₩4,200", func(): tool_selected.emit("build", "park", false))
		_add_sub("랜드마크\n₩65,000", func(): tool_selected.emit("build", "landmark", false))
		_sub_hint.text = "  도심 스카이라인과 최고급 주거지 조성"
		tool_selected.emit("build", "park", false)

func _add_sub(label_text: String, cb: Callable) -> void:
	var b := _make_btn(label_text, Vector2(88, 44), Color(0.15, 0.22, 0.34))
	b.pressed.connect(cb)
	_sub_items.add_child(b)

static func _make_rci_bar(parent: HBoxContainer, col: Color) -> ColorRect:
	var bg := PanelContainer.new()
	bg.custom_minimum_size = Vector2(12, 42)
	var vb := VBoxContainer.new(); vb.alignment = BoxContainer.ALIGNMENT_END; bg.add_child(vb)
	var fill := ColorRect.new(); fill.color = col; fill.custom_minimum_size = Vector2(10, 24)
	vb.add_child(fill)
	parent.add_child(bg)
	return fill

static func _make_glass_panel() -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.09, 0.15, 0.90)
	sb.border_color = Color(0.45, 0.80, 0.98, 0.28)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	sb.set_content_margin_all(10)
	p.add_theme_stylebox_override("panel", sb)
	return p

static func _make_btn(txt: String, min_sz: Vector2, bg_col: Color) -> Button:
	var b := Button.new()
	b.text = txt
	b.custom_minimum_size = min_sz
	_set_btn_color(b, bg_col)
	return b

static func _set_btn_color(b: Button, bg_col: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg_col
	sb.border_color = Color(0.6, 0.85, 1.0, 0.28)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(8)
	var hsb := sb.duplicate()
	hsb.bg_color = bg_col.lightened(0.18)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_stylebox_override("hover", hsb)
	b.add_theme_stylebox_override("pressed", hsb)
	b.add_theme_color_override("font_color", Color.WHITE)

static func _fmt_num(n: int) -> String:
	var neg := n < 0
	var s := str(absi(n))
	var out := ""
	var cnt := 0
	for i in range(s.length() - 1, -1, -1):
		if cnt > 0 and cnt % 3 == 0:
			out = "," + out
		out = s[i] + out
		cnt += 1
	return ("-" + out) if neg else out
