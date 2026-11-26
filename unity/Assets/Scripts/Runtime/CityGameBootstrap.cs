using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Single-entry runtime bootstrapper connecting Metroville.Core.CitySimulation
    /// with Unity 6 URP Terrain, Bezier Spline Roads, Buildings, Lighting, Camera, and Cities: Skylines HUD.
    /// </summary>
    public sealed class CityGameBootstrap : MonoBehaviour
    {
        public CityAssetRegistry Assets;
        public CityTerrainBuilder TerrainBuilder;
        public SplineRoadMeshBuilder RoadBuilder;
        public CityWorldRenderer WorldRenderer;
        public LightingAtmosphereController Lighting;
        public RoadDrawingController Drawer;
        public SkylinesHUDController HUD;

        public float SimSpeedMultiplier = 1f;
        public CitySimulation Simulation { get; private set; }
        public InfoViewId ActiveInfoView { get; private set; } = InfoViewId.None;

        private bool _dirtyWorld;
        private GUIStyle _panelStyle;
        private GUIStyle _btnStyle;
        private GUIStyle _activeBtnStyle;
        private GUIStyle _labelStyle;

        public void SetInfoView(InfoViewId view)
        {
            ActiveInfoView = view;
            Shader.SetGlobalInt("_MetrovilleInfoView", (int)view);
            Debug.Log($"[Metroville] InfoView 전환: {view}");
        }

        private void Start()
        {
            Simulation = new CitySimulation(2026);
            Simulation.OnWorldChanged += () => _dirtyWorld = true;

            if (TerrainBuilder != null)
            {
                TerrainBuilder.Assets = Assets;
                TerrainBuilder.BuildOrRebuildTerrain();
            }

            Simulation.ResetAndBuildDemoMetropolis();
            RebuildVisuals();

            if (Lighting != null)
            {
                Lighting.ApplyLighting(Simulation.State.TimeOfDayHours);
            }
        }

        private void Update()
        {
            if (Simulation == null) return;

            if (Input.GetKeyDown(KeyCode.Space))
                SimSpeedMultiplier = SimSpeedMultiplier > 0f ? 0f : 1f;
            if (Input.GetKeyDown(KeyCode.Alpha1)) SimSpeedMultiplier = 1f;
            if (Input.GetKeyDown(KeyCode.Alpha2)) SimSpeedMultiplier = 2.5f;
            if (Input.GetKeyDown(KeyCode.Alpha3)) SimSpeedMultiplier = 5f;

            Simulation.StepFrame(Time.deltaTime, SimSpeedMultiplier);

            if (_dirtyWorld)
            {
                RebuildVisuals();
                _dirtyWorld = false;
            }

            if (WorldRenderer != null)
                WorldRenderer.SyncVehicles(Simulation, false);

            if (Lighting != null)
                Lighting.ApplyLighting(Simulation.State.TimeOfDayHours);
        }

        public void RebuildVisuals()
        {
            if (RoadBuilder != null)
                RoadBuilder.RebuildAllRoads(Simulation.Roads);
            if (WorldRenderer != null)
                WorldRenderer.RebuildCity(Simulation);
        }

        private void OnGUI()
        {
            // Automatically yields to the full Unity 6 UI Toolkit HUD whenever mounted!
            if (HUD != null && HUD.isActiveAndEnabled) return;
            if (Simulation == null) return;
            InitGuiStyles();

            CitySnapshot s = Simulation.State;
            float w = Screen.width;
            float h = Screen.height;

            // Top Chirper / City Status Strip
            Rect topBar = new Rect(w * 0.5f - 290f, 12f, 580f, 36f);
            GUI.Box(topBar, GUIContent.none, _panelStyle);
            GUI.Label(
                new Rect(topBar.x + 14f, topBar.y + 7f, topBar.width - 28f, 24f),
                $"# {s.CityName}   |   인구 {s.Population:N0}   |   실업률 {s.UnemploymentRate * 100f:F0}%   |   교통흐름 {s.TrafficFlow * 100f:F0}%   |   물류충족 {s.SupplyChain.FulfillmentRatio * 100f:F0}%",
                _labelStyle
            );

            // Cities: Skylines Style Bottom Command Bar
            float barW = Mathf.Min(w - 24f, 1100f);
            Rect bot = new Rect((w - barW) * 0.5f, h - 86f, barW, 74f);
            GUI.Box(bot, GUIContent.none, _panelStyle);

            float x = bot.x + 12f;
            float y = bot.y + 10f;

            // Simulation Speed & Lighting Cycle
            if (GUI.Button(new Rect(x, y, 42f, 26f), SimSpeedMultiplier <= 0f ? "▶" : "❚❚", SimSpeedMultiplier <= 0f ? _activeBtnStyle : _btnStyle))
                SimSpeedMultiplier = SimSpeedMultiplier <= 0f ? 1f : 0f;
            if (GUI.Button(new Rect(x + 46f, y, 36f, 26f), "1x", Mathf.Approximately(SimSpeedMultiplier, 1f) ? _activeBtnStyle : _btnStyle))
                SimSpeedMultiplier = 1f;
            if (GUI.Button(new Rect(x + 86f, y, 36f, 26f), "3x", SimSpeedMultiplier > 2f ? _activeBtnStyle : _btnStyle))
                SimSpeedMultiplier = 3f;

            string lightLabel = Lighting != null ? Lighting.Mode.ToString() : "Day";
            if (GUI.Button(new Rect(x, y + 30f, 122f, 24f), $"☀ {lightLabel}", _btnStyle) && Lighting != null)
            {
                Lighting.Mode = (LightingMode)(((int)Lighting.Mode + 1) % 4);
                Lighting.ApplyLighting(s.TimeOfDayHours);
            }

            // Treasury & Economy Readout
            x += 136f;
            string sign = s.Economy.DailyNetBalance >= 0 ? "+" : "";
            GUI.Label(new Rect(x, y - 2f, 210f, 26f), $"₩{s.Economy.Treasury:N0} ({sign}₩{s.Economy.DailyNetBalance:N0}/일)", _labelStyle);
            GUI.Label(new Rect(x, y + 24f, 210f, 26f), $"Day {s.Day} · 행복도 {s.Happiness * 100f:F0}% · 전력 {s.PowerProducedMW:F0}/{s.PowerDemandMW:F0}MW", _labelStyle);

            // RCI Demand Bars
            x += 220f;
            DrawDemandBar(new Rect(x, y + 4f, 12f, 48f), s.DemandResidential, new Color(0.22f, 0.80f, 0.42f));
            DrawDemandBar(new Rect(x + 16f, y + 4f, 12f, 48f), s.DemandCommercial, new Color(0.24f, 0.58f, 0.96f));
            DrawDemandBar(new Rect(x + 32f, y + 4f, 12f, 48f), s.DemandIndustrial, new Color(0.95f, 0.68f, 0.16f));

            // Core Cities: Skylines Construction Tools (Straight / Curved Bezier Roads, Park, Landmark, Bulldoze)
            x += 58f;
            if (Drawer != null)
            {
                ToolButton(new Rect(x, y, 76f, 54f), "🔍 탐색", Drawer.ActiveTool == ToolMode.Inspect, () => { Drawer.ActiveTool = ToolMode.Inspect; Drawer.CancelDrawing(); });
                ToolButton(new Rect(x + 82f, y, 96f, 54f), "🛣 직선 대로", Drawer.ActiveTool == ToolMode.RoadStraight, () => { Drawer.ActiveTool = ToolMode.RoadStraight; Drawer.SelectedRoadType = RoadType.FourLaneAvenue; Drawer.CancelDrawing(); });
                ToolButton(new Rect(x + 184f, y, 96f, 54f), "〰 곡선 도로", Drawer.ActiveTool == ToolMode.RoadCurved, () => { Drawer.ActiveTool = ToolMode.RoadCurved; Drawer.SelectedRoadType = RoadType.FourLaneAvenue; Drawer.CancelDrawing(); });
                ToolButton(new Rect(x + 286f, y, 86f, 54f), "🌲 공원", Drawer.ActiveTool == ToolMode.PlaceBuilding && Drawer.SelectedBuildingType == BuildingType.ParkPlaza, () => { Drawer.ActiveTool = ToolMode.PlaceBuilding; Drawer.SelectedBuildingType = BuildingType.ParkPlaza; Drawer.CancelDrawing(); });
                ToolButton(new Rect(x + 378f, y, 94f, 54f), "🏙 랜드마크", Drawer.ActiveTool == ToolMode.PlaceBuilding && Drawer.SelectedBuildingType == BuildingType.LandmarkTower, () => { Drawer.ActiveTool = ToolMode.PlaceBuilding; Drawer.SelectedBuildingType = BuildingType.LandmarkTower; Drawer.CancelDrawing(); });
                ToolButton(new Rect(x + 478f, y, 76f, 54f), "🚜 철거", Drawer.ActiveTool == ToolMode.Bulldoze, () => { Drawer.ActiveTool = ToolMode.Bulldoze; Drawer.CancelDrawing(); });
            }
        }

        private void ToolButton(Rect rect, string text, bool active, System.Action onClick)
        {
            if (GUI.Button(rect, text, active ? _activeBtnStyle : _btnStyle))
                onClick?.Invoke();
        }

        private static void DrawDemandBar(Rect bg, float fill01, Color col)
        {
            Color prev = GUI.color;
            GUI.color = new Color(0.10f, 0.14f, 0.20f, 0.9f);
            GUI.DrawTexture(bg, Texture2D.whiteTexture);
            float fh = bg.height * Mathf.Clamp01(fill01);
            GUI.color = col;
            GUI.DrawTexture(new Rect(bg.x, bg.y + (bg.height - fh), bg.width, fh), Texture2D.whiteTexture);
            GUI.color = prev;
        }

        private void InitGuiStyles()
        {
            if (_panelStyle != null) return;
            Texture2D darkBg = MakeSolidTex(new Color(0.08f, 0.12f, 0.18f, 0.88f));
            Texture2D btnBg = MakeSolidTex(new Color(0.15f, 0.21f, 0.30f, 0.95f));
            Texture2D activeBg = MakeSolidTex(new Color(0.12f, 0.52f, 0.88f, 0.98f));

            _panelStyle = new GUIStyle(GUI.skin.box) { normal = { background = darkBg } };
            _btnStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = 12,
                fontStyle = FontStyle.Bold,
                normal = { background = btnBg, textColor = Color.white },
                hover = { background = activeBg, textColor = Color.white }
            };
            _activeBtnStyle = new GUIStyle(_btnStyle) { normal = { background = activeBg, textColor = Color.white } };
            _labelStyle = new GUIStyle(GUI.skin.label) { fontSize = 13, fontStyle = FontStyle.Bold, normal = { textColor = new Color(0.93f, 0.96f, 1.0f) } };
        }

        private static Texture2D MakeSolidTex(Color c)
        {
            Texture2D t = new Texture2D(1, 1);
            t.SetPixel(0, 0, c);
            t.Apply();
            return t;
        }
    }
}
