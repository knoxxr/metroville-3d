using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Interactive Cities: Skylines Curved & Straight Bezier Road Drawing, Civic Building Placement,
    /// and Bulldoze Controller with real-time 3D preview ribbon and node snapping.
    /// </summary>
    public sealed class RoadDrawingController : MonoBehaviour
    {
        public CityGameBootstrap Bootstrap;
        public Camera MainCamera;
        public SkylinesHUDController HUD;

        public ToolMode ActiveTool = ToolMode.Inspect;
        public RoadType SelectedRoadType = RoadType.FourLaneAvenue;
        public BuildingType SelectedBuildingType = BuildingType.ParkPlaza;

        private bool _hasStart;
        private bool _hasMid;
        private Vec3 _startPoint;
        private Vec3 _midPoint;
        private LineRenderer _previewLine;

        private void Awake()
        {
            GameObject previewObj = new GameObject("RoadPreviewRibbon");
            previewObj.transform.SetParent(transform, false);
            _previewLine = previewObj.AddComponent<LineRenderer>();
            _previewLine.startWidth = 4.5f;
            _previewLine.endWidth = 4.5f;
            _previewLine.positionCount = 0;
            Shader s = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default");
            Material m = new Material(s);
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", new Color(0.18f, 0.76f, 1.0f, 0.85f));
            else m.color = new Color(0.18f, 0.76f, 1.0f, 0.85f);
            _previewLine.sharedMaterial = m;
        }

        private void Update()
        {
            if (Bootstrap == null || Bootstrap.Simulation == null) return;
            if (MainCamera == null) MainCamera = Camera.main;
            if (MainCamera == null) return;

            // Cancel current road draw on Right Click or Escape
            if (Input.GetKeyDown(KeyCode.Escape) || (Input.GetMouseButtonDown(1) && _hasStart))
            {
                CancelDrawing();
                return;
            }

            // Don't raycast through bottom HUD bar or top bar
            if (Input.mousePosition.y < 140f || Input.mousePosition.y > Screen.height - 64f) return;

            if (!TryRaycastTerrain(out Vector3 hitWorld)) return;

            Vec3 snapped = SnapToNearbyRoadNode(new Vec3(hitWorld.x, hitWorld.y + 0.15f, hitWorld.z));

            if (ActiveTool == ToolMode.RoadStraight || ActiveTool == ToolMode.RoadCurved)
            {
                UpdateRoadPreview(snapped);
                if (Input.GetMouseButtonDown(0))
                {
                    HandleRoadClick(snapped);
                }
            }
            else if (ActiveTool == ToolMode.PlaceBuilding)
            {
                _previewLine.positionCount = 0;
                if (Input.GetMouseButtonDown(0))
                {
                    Bootstrap.Simulation.PlaceBuilding(SelectedBuildingType, snapped, 0f, 1, false);
                }
            }
            else if (ActiveTool == ToolMode.Bulldoze)
            {
                _previewLine.positionCount = 0;
                if (Input.GetMouseButtonDown(0))
                {
                    Bootstrap.Simulation.BulldozeAt(snapped, 16f);
                }
            }
            else
            {
                _previewLine.positionCount = 0;
                if (Input.GetMouseButtonDown(0) && HUD != null)
                {
                    BuildingInstance picked = Bootstrap.Simulation.FindBuildingAt(new Vec3(hitWorld.x, hitWorld.y, hitWorld.z), 18f);
                    HUD.ShowBuildingInspector(picked);
                }
            }
        }

        public void CancelDrawing()
        {
            _hasStart = false;
            _hasMid = false;
            if (_previewLine != null) _previewLine.positionCount = 0;
        }

        private void HandleRoadClick(Vec3 point)
        {
            if (!_hasStart)
            {
                _startPoint = point;
                _hasStart = true;
                _hasMid = false;
                return;
            }

            if (ActiveTool == ToolMode.RoadCurved && !_hasMid)
            {
                _midPoint = point;
                _hasMid = true;
                return;
            }

            Vec3? curveMid = (ActiveTool == ToolMode.RoadCurved && _hasMid) ? (Vec3?)_midPoint : null;
            Bootstrap.Simulation.BuildRoad(_startPoint, point, SelectedRoadType, curveMid);

            // Chain seamlessly into the next road segment (Cities: Skylines continuous road drawing!)
            _startPoint = point;
            _hasMid = false;
        }

        private void UpdateRoadPreview(Vec3 cursor)
        {
            if (!_hasStart)
            {
                _previewLine.positionCount = 0;
                return;
            }

            const int samples = 20;
            _previewLine.positionCount = samples;

            Vec3 p0 = _startPoint;
            Vec3 p3 = cursor;
            Vec3 p1, p2;
            if (ActiveTool == ToolMode.RoadCurved && _hasMid)
            {
                p1 = p0 + (_midPoint - p0) * (2f / 3f);
                p2 = p3 + (_midPoint - p3) * (2f / 3f);
            }
            else
            {
                p1 = Vec3.Lerp(p0, p3, 1f / 3f);
                p2 = Vec3.Lerp(p0, p3, 2f / 3f);
            }

            for (int i = 0; i < samples; i++)
            {
                float t = i / (float)(samples - 1);
                Vec3 pt = BezierRoadNetwork.EvaluateCubic(p0, p1, p2, p3, t);
                float groundY = TerrainHeightfield.SampleHeight(pt.X, pt.Z);
                _previewLine.SetPosition(i, new Vector3(pt.X, Mathf.Max(pt.Y, groundY) + 0.8f, pt.Z));
            }
        }

        private Vec3 SnapToNearbyRoadNode(Vec3 candidate)
        {
            RoadNode near = Bootstrap.Simulation.Roads.FindNearestNode(candidate, 14f);
            return near != null ? near.Position : candidate;
        }

        private bool TryRaycastTerrain(out Vector3 hitPos)
        {
            Ray ray = MainCamera.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out RaycastHit hit, 1800f))
            {
                hitPos = hit.point;
                return true;
            }
            Plane waterPlane = new Plane(Vector3.up, new Vector3(0f, CityConstants.WaterLevelMeters, 0f));
            if (waterPlane.Raycast(ray, out float enter))
            {
                hitPos = ray.GetPoint(enter);
                return true;
            }
            hitPos = Vector3.zero;
            return false;
        }
    }
}
