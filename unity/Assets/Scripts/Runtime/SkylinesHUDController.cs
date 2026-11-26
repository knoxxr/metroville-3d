using System;
using System.Collections.Generic;
using Metroville.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace Metroville.Runtime
{
    /// <summary>
    /// Full Unity 6 UI Toolkit Cities: Skylines HUD Controller.
    /// Drives InfoView drawer, Chirper live ticker, Economy/Supply-Chain/4-Tier Education modal,
    /// Interactive 3D Building Inspector (Lv.1-5 & Historical Lock), RCI demand bars,
    /// and Category + Contextual Sub-Tool construction trays.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class SkylinesHUDController : MonoBehaviour
    {
        public CityGameBootstrap Bootstrap;
        public RoadDrawingController Drawer;
        public LightingAtmosphereController Lighting;

        private UIDocument _doc;
        private VisualElement _root;

        // Top bar & drawers
        private VisualElement _infoViewDrawer;
        private Label _lblChirper;
        private Button _btnLighting;

        // Economy modal
        private VisualElement _economyModal;
        private Label _lblEconIncome;
        private Label _lblEconUpkeep;
        private Label _lblEconNet;
        private Slider _sliderTaxRes;
        private Slider _sliderTaxCom;
        private Slider _sliderTaxInd;
        private Label _lblSupplySummary;
        private Label _lblSupplyTrade;
        private VisualElement _barSupplyFill;
        private VisualElement _eduSegUnedu;
        private VisualElement _eduSegEdu;
        private VisualElement _eduSegWell;
        private VisualElement _eduSegHigh;
        private Label _lblEduBreakdown;
        private Label _lblJobsSummary;

        // Building inspector
        private VisualElement _inspectorCard;
        private Label _lblInspTitle;
        private Label _lblInspLevel;
        private Label _lblInspStats;
        private Label _badgePower;
        private Label _badgeWater;
        private Label _badgeGoods;
        private Button _btnHistorical;
        private int _inspectedBuildingId = -1;

        // Bottom deck & sub-tool tray
        private VisualElement _subToolTray;
        private VisualElement _subToolModes;
        private VisualElement _subToolItems;
        private Label _lblToolHint;
        private Button _btnModeStraight;
        private Button _btnModeCurved;
        private Label _lblDayClock;
        private Label _lblCityName;
        private Label _lblTreasury;
        private Label _lblPopulation;
        private Label _lblHealthTraffic;
        private VisualElement _rciR;
        private VisualElement _rciC;
        private VisualElement _rciI;

        private readonly Dictionary<string, Button> _catButtons = new Dictionary<string, Button>();
        private readonly Dictionary<InfoViewId, Button> _ivButtons = new Dictionary<InfoViewId, Button>();
        private readonly Dictionary<string, Button> _speedButtons = new Dictionary<string, Button>();

        private InfoViewId _activeInfoView = InfoViewId.None;
        private string _activeCategory = "inspect";
        private float _refreshTimer;

        private void OnEnable()
        {
            _doc = GetComponent<UIDocument>();
            if (_doc == null || _doc.rootVisualElement == null) return;
            _root = _doc.rootVisualElement;
            BindAllElements();
        }

        private void Update()
        {
            if (Bootstrap == null || Bootstrap.Simulation == null || _root == null) return;

            _refreshTimer += Time.unscaledDeltaTime;
            if (_refreshTimer >= 0.15f)
            {
                _refreshTimer = 0f;
                RefreshTelemetry();
            }
        }

        public void ShowBuildingInspector(BuildingInstance b)
        {
            if (b == null || _inspectorCard == null)
            {
                HideBuildingInspector();
                return;
            }
            _inspectedBuildingId = b.Id;
            _inspectorCard.RemoveFromClassList("hidden");
            RefreshInspectorCard(b);
        }

        public void HideBuildingInspector()
        {
            _inspectedBuildingId = -1;
            if (_inspectorCard != null) _inspectorCard.AddToClassList("hidden");
        }

        private void BindAllElements()
        {
            _infoViewDrawer = _root.Q<VisualElement>("infoview-drawer");
            _lblChirper = _root.Q<Label>("lbl-chirper");
            _btnLighting = _root.Q<Button>("btn-lighting-cycle");

            _root.Q<Button>("btn-infoview-toggle")?.RegisterCallback<ClickEvent>(_ => ToggleVisible(_infoViewDrawer));
            _root.Q<Button>("btn-economy-modal")?.RegisterCallback<ClickEvent>(_ => ToggleVisible(_economyModal));
            _root.Q<Button>("btn-close-economy")?.RegisterCallback<ClickEvent>(_ => _economyModal?.AddToClassList("hidden"));
            _root.Q<Button>("btn-close-inspector")?.RegisterCallback<ClickEvent>(_ => HideBuildingInspector());

            _btnLighting?.RegisterCallback<ClickEvent>(_ =>
            {
                if (Lighting == null) return;
                Lighting.Mode = (LightingMode)(((int)Lighting.Mode + 1) % 4);
                if (Bootstrap != null && Bootstrap.Simulation != null)
                    Lighting.ApplyLighting(Bootstrap.Simulation.State.TimeOfDayHours);
                UpdateLightingLabel();
            });

            _root.Q<Button>("btn-reset-city")?.RegisterCallback<ClickEvent>(_ =>
            {
                if (Bootstrap == null || Bootstrap.Simulation == null) return;
                Bootstrap.Simulation.ResetAndBuildDemoMetropolis();
                Bootstrap.RebuildVisuals();
                HideBuildingInspector();
            });

            // InfoView buttons
            BindInfoView("iv-none", InfoViewId.None);
            BindInfoView("iv-traffic", InfoViewId.Traffic);
            BindInfoView("iv-power", InfoViewId.Power);
            BindInfoView("iv-water", InfoViewId.Water);
            BindInfoView("iv-landvalue", InfoViewId.LandValue);
            BindInfoView("iv-noise", InfoViewId.Noise);
            BindInfoView("iv-edu", InfoViewId.Education);
            BindInfoView("iv-services", InfoViewId.Services);

            // Economy modal controls
            _economyModal = _root.Q<VisualElement>("economy-modal");
            _lblEconIncome = _root.Q<Label>("lbl-econ-income");
            _lblEconUpkeep = _root.Q<Label>("lbl-econ-upkeep");
            _lblEconNet = _root.Q<Label>("lbl-econ-net");
            _sliderTaxRes = _root.Q<Slider>("slider-tax-res");
            _sliderTaxCom = _root.Q<Slider>("slider-tax-com");
            _sliderTaxInd = _root.Q<Slider>("slider-tax-ind");
            _lblSupplySummary = _root.Q<Label>("lbl-supply-summary");
            _lblSupplyTrade = _root.Q<Label>("lbl-supply-trade");
            _barSupplyFill = _root.Q<VisualElement>("bar-supply-fill");
            _eduSegUnedu = _root.Q<VisualElement>("edu-seg-unedu");
            _eduSegEdu = _root.Q<VisualElement>("edu-seg-edu");
            _eduSegWell = _root.Q<VisualElement>("edu-seg-well");
            _eduSegHigh = _root.Q<VisualElement>("edu-seg-high");
            _lblEduBreakdown = _root.Q<Label>("lbl-edu-breakdown");
            _lblJobsSummary = _root.Q<Label>("lbl-jobs-summary");

            _sliderTaxRes?.RegisterValueChangedCallback(evt => ApplyTaxSlider(_sliderTaxRes, "주거 세율", evt.newValue, v => Bootstrap.Simulation.State.Economy.TaxRateResidential = v));
            _sliderTaxCom?.RegisterValueChangedCallback(evt => ApplyTaxSlider(_sliderTaxCom, "상업 세율", evt.newValue, v => Bootstrap.Simulation.State.Economy.TaxRateCommercial = v));
            _sliderTaxInd?.RegisterValueChangedCallback(evt => ApplyTaxSlider(_sliderTaxInd, "산업 세율", evt.newValue, v => Bootstrap.Simulation.State.Economy.TaxRateIndustrial = v));

            // Inspector controls
            _inspectorCard = _root.Q<VisualElement>("building-inspector");
            _lblInspTitle = _root.Q<Label>("lbl-insp-title");
            _lblInspLevel = _root.Q<Label>("lbl-insp-level");
            _lblInspStats = _root.Q<Label>("lbl-insp-stats");
            _badgePower = _root.Q<Label>("badge-insp-power");
            _badgeWater = _root.Q<Label>("badge-insp-water");
            _badgeGoods = _root.Q<Label>("badge-insp-goods");
            _btnHistorical = _root.Q<Button>("btn-insp-historical");

            _btnHistorical?.RegisterCallback<ClickEvent>(_ =>
            {
                BuildingInstance b = FindInspectedBuilding();
                if (b == null) return;
                b.HistoricalLocked = !b.HistoricalLocked;
                RefreshInspectorCard(b);
            });
            _root.Q<Button>("btn-insp-bulldoze")?.RegisterCallback<ClickEvent>(_ =>
            {
                if (Bootstrap == null || Bootstrap.Simulation == null || _inspectedBuildingId < 0) return;
                Bootstrap.Simulation.BulldozeBuildingById(_inspectedBuildingId);
                HideBuildingInspector();
            });

            // Bottom deck controls
            _subToolTray = _root.Q<VisualElement>("subtool-tray");
            _subToolModes = _root.Q<VisualElement>("subtool-modes");
            _subToolItems = _root.Q<VisualElement>("subtool-items");
            _lblToolHint = _root.Q<Label>("lbl-tool-hint");
            _btnModeStraight = _root.Q<Button>("btn-mode-straight");
            _btnModeCurved = _root.Q<Button>("btn-mode-curved");

            _btnModeStraight?.RegisterCallback<ClickEvent>(_ => SetRoadDrawMode(false));
            _btnModeCurved?.RegisterCallback<ClickEvent>(_ => SetRoadDrawMode(true));

            _lblDayClock = _root.Q<Label>("lbl-day-clock");
            _lblCityName = _root.Q<Label>("lbl-city-name");
            _lblTreasury = _root.Q<Label>("lbl-treasury");
            _lblPopulation = _root.Q<Label>("lbl-population");
            _lblHealthTraffic = _root.Q<Label>("lbl-health-traffic");
            _rciR = _root.Q<VisualElement>("rci-r");
            _rciC = _root.Q<VisualElement>("rci-c");
            _rciI = _root.Q<VisualElement>("rci-i");

            BindSpeed("btn-spd-pause", 0f);
            BindSpeed("btn-spd-1x", 1f);
            BindSpeed("btn-spd-2x", 2.5f);
            BindSpeed("btn-spd-3x", 5f);

            BindCategory("cat-inspect", "inspect");
            BindCategory("cat-roads", "roads");
            BindCategory("cat-utilities", "utilities");
            BindCategory("cat-services", "services");
            BindCategory("cat-parks", "parks");
            BindCategory("cat-bulldoze", "bulldoze");

            UpdateLightingLabel();
            SelectCategory("inspect");
        }

        private void BindInfoView(string elemName, InfoViewId id)
        {
            Button btn = _root.Q<Button>(elemName);
            if (btn == null) return;
            _ivButtons[id] = btn;
            btn.RegisterCallback<ClickEvent>(_ =>
            {
                _activeInfoView = id;
                foreach (var kv in _ivButtons)
                    kv.Value.EnableInClassList("active", kv.Key == id);
                if (Bootstrap != null) Bootstrap.SetInfoView(id);
            });
        }

        private void BindSpeed(string elemName, float mult)
        {
            Button btn = _root.Q<Button>(elemName);
            if (btn == null) return;
            _speedButtons[elemName] = btn;
            btn.RegisterCallback<ClickEvent>(_ =>
            {
                if (Bootstrap != null) Bootstrap.SimSpeedMultiplier = mult;
                foreach (var kv in _speedButtons)
                    kv.Value.EnableInClassList("active", kv.Key == elemName);
            });
        }

        private void BindCategory(string elemName, string categoryKey)
        {
            Button btn = _root.Q<Button>(elemName);
            if (btn == null) return;
            _catButtons[categoryKey] = btn;
            btn.RegisterCallback<ClickEvent>(_ => SelectCategory(categoryKey));
        }

        private void SelectCategory(string categoryKey)
        {
            _activeCategory = categoryKey;
            foreach (var kv in _catButtons)
                kv.Value.EnableInClassList("active", kv.Key == categoryKey);

            if (Drawer != null) Drawer.CancelDrawing();

            if (categoryKey == "inspect")
            {
                if (Drawer != null) Drawer.ActiveTool = ToolMode.Inspect;
                _subToolTray?.AddToClassList("hidden");
                return;
            }
            if (categoryKey == "bulldoze")
            {
                if (Drawer != null) Drawer.ActiveTool = ToolMode.Bulldoze;
                _subToolTray?.AddToClassList("hidden");
                HideBuildingInspector();
                return;
            }

            _subToolTray?.RemoveFromClassList("hidden");
            _subToolItems?.Clear();

            bool isRoads = categoryKey == "roads";
            if (_subToolModes != null)
                _subToolModes.style.display = isRoads ? DisplayStyle.Flex : DisplayStyle.None;

            if (isRoads)
            {
                if (Drawer != null) Drawer.ActiveTool = ToolMode.RoadCurved;
                SetRoadDrawMode(true);
                AddSubTool("🛣 2차선 도로\n₩70/10m", true, () => SelectRoad(RoadType.TwoLaneStreet));
                AddSubTool("🌳 4차선 대로\n₩180/10m", false, () => SelectRoad(RoadType.FourLaneAvenue));
                AddSubTool("🛣 6차선 고속도로\n₩320/10m", false, () => SelectRoad(RoadType.SixLaneHighway));
                if (_lblToolHint != null)
                    _lblToolHint.text = "곡선 모드: 시작점 → 중간 곡률점 → 끝점 클릭 (강을 건너면 현수교 자동 생성!)";
            }
            else if (categoryKey == "utilities")
            {
                AddSubTool("💨 풍력 발전기\n₩3,200", true, () => SelectBuildingTool(BuildingType.PowerWind));
                AddSubTool("☀ 태양광 발전소\n₩14,000", false, () => SelectBuildingTool(BuildingType.PowerSolar));
                AddSubTool("💧 취수 펌프장\n₩4,500", false, () => SelectBuildingTool(BuildingType.WaterPump));
                SelectBuildingTool(BuildingType.PowerWind);
                if (_lblToolHint != null) _lblToolHint.text = "지형 위를 클릭하여 전력·수도 인프라를 배치합니다.";
            }
            else if (categoryKey == "services")
            {
                AddSubTool("🚒 소방서\n₩8,500", true, () => SelectBuildingTool(BuildingType.FireStation));
                AddSubTool("🚓 경찰서\n₩9,000", false, () => SelectBuildingTool(BuildingType.PoliceStation));
                AddSubTool("🏥 종합병원\n₩18,000", false, () => SelectBuildingTool(BuildingType.Hospital));
                AddSubTool("🏫 초등학교\n₩11,000", false, () => SelectBuildingTool(BuildingType.ElementarySchool));
                AddSubTool("🎓 국립대학교\n₩34,000", false, () => SelectBuildingTool(BuildingType.University));
                SelectBuildingTool(BuildingType.FireStation);
                if (_lblToolHint != null) _lblToolHint.text = "교육·의료·치안 시설은 주변 지가와 시민 행복도를 크게 높입니다.";
            }
            else if (categoryKey == "parks")
            {
                AddSubTool("🌲 센트럴 공원\n₩4,200", true, () => SelectBuildingTool(BuildingType.ParkPlaza));
                AddSubTool("🏙 스카이 랜드마크\n₩65,000", false, () => SelectBuildingTool(BuildingType.LandmarkTower));
                SelectBuildingTool(BuildingType.ParkPlaza);
                if (_lblToolHint != null) _lblToolHint.text = "공원과 랜드마크는 도심 스카이라인과 최고급 주거 성장(Lv.5)을 촉진합니다.";
            }
        }

        private void AddSubTool(string label, bool defaultActive, Action onSelect)
        {
            if (_subToolItems == null) return;
            Button btn = new Button { text = label };
            btn.AddToClassList("subtool-btn");
            if (defaultActive) btn.AddToClassList("active");
            btn.RegisterCallback<ClickEvent>(_ =>
            {
                foreach (VisualElement child in _subToolItems.Children())
                    child.RemoveFromClassList("active");
                btn.AddToClassList("active");
                onSelect?.Invoke();
            });
            _subToolItems.Add(btn);
        }

        private void SelectRoad(RoadType type)
        {
            if (Drawer == null) return;
            Drawer.SelectedRoadType = type;
            Drawer.CancelDrawing();
        }

        private void SetRoadDrawMode(bool curved)
        {
            if (Drawer != null)
            {
                Drawer.ActiveTool = curved ? ToolMode.RoadCurved : ToolMode.RoadStraight;
                Drawer.CancelDrawing();
            }
            _btnModeStraight?.EnableInClassList("active", !curved);
            _btnModeCurved?.EnableInClassList("active", curved);
        }

        private void SelectBuildingTool(BuildingType type)
        {
            if (Drawer == null) return;
            Drawer.ActiveTool = ToolMode.PlaceBuilding;
            Drawer.SelectedBuildingType = type;
            Drawer.CancelDrawing();
        }

        private void ApplyTaxSlider(Slider slider, string prefix, float pct, Action<float> setter)
        {
            int rounded = Mathf.RoundToInt(pct);
            slider.label = $"{prefix} {rounded}%";
            if (Bootstrap != null && Bootstrap.Simulation != null)
            {
                setter(rounded / 100f);
                Bootstrap.Simulation.RunSimulationTick();
            }
        }

        private void RefreshTelemetry()
        {
            CitySnapshot s = Bootstrap.Simulation.State;
            int hh = Mathf.FloorToInt(s.TimeOfDayHours) % 24;
            int mm = Mathf.FloorToInt((s.TimeOfDayHours - Mathf.Floor(s.TimeOfDayHours)) * 60f);

            if (_lblDayClock != null) _lblDayClock.text = $"Day {s.Day} · {hh:00}:{mm:00}";
            if (_lblCityName != null) _lblCityName.text = s.CityName;

            string sign = s.Economy.DailyNetBalance >= 0 ? "+" : "";
            if (_lblTreasury != null) _lblTreasury.text = $"₩{s.Economy.Treasury:N0} ({sign}₩{s.Economy.DailyNetBalance:N0}/일)";
            if (_lblPopulation != null) _lblPopulation.text = $"👥 {s.Population:N0}명";
            if (_lblHealthTraffic != null) _lblHealthTraffic.text = $"😊 {s.Happiness * 100f:F0}%  ·  🚗 {s.TrafficFlow * 100f:F0}%";

            if (_lblChirper != null)
            {
                string mood = s.SupplyChain.FulfillmentRatio < 0.8f
                    ? "상업지구 물류 공급이 부족합니다! 산업지구 또는 고속도로 연결을 늘려주세요."
                    : s.TrafficFlow < 0.7f
                        ? "도심 간선도로 정체 발생! 4차선 대로나 곡선 우회도로를 확충해보세요."
                        : $"인구 {s.Population:N0}명 · 실업률 {s.UnemploymentRate * 100f:F0}% · 물류 충족 {s.SupplyChain.FulfillmentRatio * 100f:F0}% · 쾌적한 메트로폴리스!";
                _lblChirper.text = $"#{s.CityName} — {mood}";
            }

            if (_rciR != null) _rciR.style.height = Length.Percent(Mathf.Clamp(s.DemandResidential * 100f, 8f, 100f));
            if (_rciC != null) _rciC.style.height = Length.Percent(Mathf.Clamp(s.DemandCommercial * 100f, 8f, 100f));
            if (_rciI != null) _rciI.style.height = Length.Percent(Mathf.Clamp(s.DemandIndustrial * 100f, 8f, 100f));

            // Economy & Supply Chain Modal live update
            if (_economyModal != null && !_economyModal.ClassListContains("hidden"))
            {
                if (_lblEconIncome != null) _lblEconIncome.text = $"세수 수입: +₩{s.Economy.DailyTaxIncome:N0}";
                if (_lblEconUpkeep != null) _lblEconUpkeep.text = $"유지 비용: -₩{s.Economy.DailyUpkeepCost:N0}";
                if (_lblEconNet != null) _lblEconNet.text = $"일일 순수익: {sign}₩{s.Economy.DailyNetBalance:N0}";

                if (_lblSupplySummary != null)
                    _lblSupplySummary.text = $"자체 생산 {s.SupplyChain.DomesticGoodsProduced:F0} · 상업 수요 {s.SupplyChain.CommercialGoodsDemand:F0} · 충족률 {s.SupplyChain.FulfillmentRatio * 100f:F0}%";
                if (_lblSupplyTrade != null)
                    _lblSupplyTrade.text = $"고속도로 수입 {s.SupplyChain.HighwayGoodsImported:F0} · 수출 {s.SupplyChain.HighwayGoodsExported:F0}";
                if (_barSupplyFill != null)
                    _barSupplyFill.style.width = Length.Percent(Mathf.Clamp01(s.SupplyChain.FulfillmentRatio) * 100f);

                if (_eduSegUnedu != null) _eduSegUnedu.style.width = Length.Percent(s.Education.UneducatedPct * 100f);
                if (_eduSegEdu != null) _eduSegEdu.style.width = Length.Percent(s.Education.EducatedPct * 100f);
                if (_eduSegWell != null) _eduSegWell.style.width = Length.Percent(s.Education.WellEducatedPct * 100f);
                if (_eduSegHigh != null) _eduSegHigh.style.width = Length.Percent(s.Education.HighlyEducatedPct * 100f);

                if (_lblEduBreakdown != null)
                    _lblEduBreakdown.text = $"미교육 {s.Education.UneducatedPct * 100f:F0}% · 초등 {s.Education.EducatedPct * 100f:F0}% · 고등 {s.Education.WellEducatedPct * 100f:F0}% · 대졸 {s.Education.HighlyEducatedPct * 100f:F0}%";
                if (_lblJobsSummary != null)
                    _lblJobsSummary.text = $"고용 {s.EmployedCitizens:N0} / 전체 일자리 {s.TotalJobs:N0} · 실업률 {s.UnemploymentRate * 100f:F1}%";
            }

            if (_inspectedBuildingId >= 0)
            {
                BuildingInstance b = FindInspectedBuilding();
                if (b != null) RefreshInspectorCard(b);
                else HideBuildingInspector();
            }
        }

        private void RefreshInspectorCard(BuildingInstance b)
        {
            string name = CityConstants.Buildings.TryGetValue(b.Type, out BuildingSpec spec) ? spec.DisplayName : b.Type.ToString();
            if (_lblInspTitle != null) _lblInspTitle.text = $"{name}  #{b.Id}";
            if (_lblInspLevel != null) _lblInspLevel.text = $"{new string('★', b.Level)}{new string('☆', 5 - b.Level)}  Lv.{b.Level} / 5";
            if (_lblInspStats != null) _lblInspStats.text = $"거주민 {b.Residents}명 · 일자리 {b.Jobs}명 · 높이 {b.HeightMeters:F0}m";

            SetPill(_badgePower, b.HasPower, "⚡ 전력 정상", "⚡ 전력 부족");
            SetPill(_badgeWater, b.HasWater, "💧 수도 정상", "💧 수도 부족");
            SetPill(_badgeGoods, b.HasGoods, "📦 물류 정상", "📦 상품 부족");

            if (_btnHistorical != null)
                _btnHistorical.text = b.HistoricalLocked ? "🏛 역사 건물: 잠금 ON" : "🏛 역사 건물 지정: OFF";
        }

        private static void SetPill(Label lbl, bool ok, string okText, string warnText)
        {
            if (lbl == null) return;
            lbl.text = ok ? okText : warnText;
            lbl.EnableInClassList("ok", ok);
            lbl.EnableInClassList("warn", !ok);
        }

        private void UpdateLightingLabel()
        {
            if (_btnLighting == null || Lighting == null) return;
            switch (Lighting.Mode)
            {
                case LightingMode.Day: _btnLighting.text = "☀ 주간"; break;
                case LightingMode.Sunset: _btnLighting.text = "🌇 석양"; break;
                case LightingMode.Night: _btnLighting.text = "🌙 야경"; break;
                default: _btnLighting.text = "🔄 자동 순환"; break;
            }
        }

        private BuildingInstance FindInspectedBuilding()
        {
            if (Bootstrap == null || Bootstrap.Simulation == null) return null;
            var list = Bootstrap.Simulation.Buildings;
            for (int i = 0; i < list.Count; i++)
                if (list[i].Id == _inspectedBuildingId) return list[i];
            return null;
        }

        private static void ToggleVisible(VisualElement el)
        {
            if (el == null) return;
            if (el.ClassListContains("hidden")) el.RemoveFromClassList("hidden");
            else el.AddToClassList("hidden");
        }
    }
}
