using System.Collections.Generic;
using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Extrudes continuous, step-free 3D Cubic Bezier Spline Road & Suspension Bridge meshes
    /// directly from Metroville.Core.BezierRoadNetwork — matching Cities: Skylines smooth
    /// curved roads, raised concrete sidewalks, intersection pads, bridge piers, pylons, and traffic signals.
    /// </summary>
    public sealed class SplineRoadMeshBuilder : MonoBehaviour
    {
        public CityAssetRegistry Assets;

        private Transform _roadRoot;

        public void RebuildAllRoads(BezierRoadNetwork network)
        {
            if (_roadRoot != null) Destroy(_roadRoot.gameObject);
            _roadRoot = new GameObject("Generated_SplineRoads").transform;
            _roadRoot.SetParent(transform, false);

            Material asphaltMat = Assets != null && Assets.AsphaltMaterial != null
                ? Assets.AsphaltMaterial
                : CreateFallbackMaterial("Asphalt_Fallback", new Color(0.24f, 0.27f, 0.31f), 0.12f, 0.32f);
            Material sidewalkMat = Assets != null && Assets.SidewalkMaterial != null
                ? Assets.SidewalkMaterial
                : CreateFallbackMaterial("Sidewalk_Fallback", new Color(0.78f, 0.81f, 0.85f), 0.05f, 0.25f);
            Material bridgeMat = Assets != null && Assets.BridgeSteelMaterial != null
                ? Assets.BridgeSteelMaterial
                : CreateFallbackMaterial("BridgeSteel_Fallback", new Color(0.88f, 0.91f, 0.95f), 0.45f, 0.55f);

            // 1. Extrude every cubic Bezier road segment
            foreach (RoadSegment seg in network.Segments.Values)
            {
                BuildSegmentMesh(network, seg, asphaltMat, sidewalkMat, bridgeMat);
            }

            // 2. Build intersection concrete/asphalt junction discs & 3D Traffic Lights at 3+ way intersections
            foreach (RoadNode node in network.Nodes.Values)
            {
                BuildIntersectionJunction(network, node, asphaltMat, bridgeMat);
            }
        }

        private void BuildSegmentMesh(
            BezierRoadNetwork network,
            RoadSegment seg,
            Material asphaltMat,
            Material sidewalkMat,
            Material bridgeMat)
        {
            RoadSpec spec = CityConstants.Roads[seg.Type];
            int slices = Mathf.Clamp(Mathf.CeilToInt(seg.LengthMeters / 4.0f), 8, 64);

            // Asphalt carriageway strip
            Mesh asphaltMesh = ExtrudeRibbon(network, seg, slices, -spec.AsphaltWidth * 0.5f, spec.AsphaltWidth * 0.5f, 0.12f, 0.25f);
            CreateMeshChild($"Road_{seg.Id}_Asphalt", asphaltMesh, asphaltMat, true);

            // Raised concrete sidewalks on both sides
            if (spec.HasSidewalks)
            {
                float halfAsph = spec.AsphaltWidth * 0.5f;
                float outer = halfAsph + spec.SidewalkWidth;
                Mesh rightWalk = ExtrudeRibbon(network, seg, slices, halfAsph, outer, 0.28f, 0.45f);
                Mesh leftWalk = ExtrudeRibbon(network, seg, slices, -outer, -halfAsph, 0.28f, 0.45f);
                CreateMeshChild($"Road_{seg.Id}_WalkR", rightWalk, sidewalkMat, true);
                CreateMeshChild($"Road_{seg.Id}_WalkL", leftWalk, sidewalkMat, true);
            }

            // Suspension bridge piers, H-frame pylons & guardrails when crossing water!
            if (seg.IsBridge)
            {
                BuildBridgeStructure(network, seg, spec, bridgeMat, sidewalkMat);
            }
            else if (spec.HasSidewalks)
            {
                BuildStreetlamps(network, seg, spec, bridgeMat);
            }
        }

        private static Mesh ExtrudeRibbon(
            BezierRoadNetwork network,
            RoadSegment seg,
            int slices,
            float leftOffset,
            float rightOffset,
            float topYOffset,
            float skirtDepth)
        {
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var tris = new List<int>();
            float distAcc = 0f;
            Vector3 prevCenter = Vector3.zero;

            for (int i = 0; i <= slices; i++)
            {
                float t = i / (float)slices;
                Vec3 c = network.SamplePosition(seg, t);
                Vec3 r = network.SampleRight(seg, t);
                Vector3 center = new Vector3(c.X, c.Y + topYOffset, c.Z);
                Vector3 right = new Vector3(r.X, 0f, r.Z).normalized;

                if (i > 0) distAcc += Vector3.Distance(prevCenter, center);
                prevCenter = center;

                Vector3 pL = center + right * leftOffset;
                Vector3 pR = center + right * rightOffset;
                Vector3 pLBot = pL - Vector3.up * skirtDepth;
                Vector3 pRBot = pR - Vector3.up * skirtDepth;

                int baseIdx = verts.Count;
                verts.Add(pL);     // +0 top-left
                verts.Add(pR);     // +1 top-right
                verts.Add(pLBot);  // +2 bot-left
                verts.Add(pRBot);  // +3 bot-right

                float vCoord = distAcc * 0.1f;
                uvs.Add(new Vector2(0f, vCoord));
                uvs.Add(new Vector2(1f, vCoord));
                uvs.Add(new Vector2(0f, vCoord));
                uvs.Add(new Vector2(1f, vCoord));

                if (i > 0)
                {
                    int p = baseIdx - 4;
                    // Top surface
                    tris.Add(p + 0); tris.Add(baseIdx + 0); tris.Add(p + 1);
                    tris.Add(p + 1); tris.Add(baseIdx + 0); tris.Add(baseIdx + 1);
                    // Left curb/skirt wall
                    tris.Add(p + 2); tris.Add(baseIdx + 2); tris.Add(p + 0);
                    tris.Add(p + 0); tris.Add(baseIdx + 2); tris.Add(baseIdx + 0);
                    // Right curb/skirt wall
                    tris.Add(p + 1); tris.Add(baseIdx + 1); tris.Add(p + 3);
                    tris.Add(p + 3); tris.Add(baseIdx + 1); tris.Add(baseIdx + 3);
                }
            }

            Mesh m = new Mesh { name = $"Ribbon_{seg.Id}" };
            m.SetVertices(verts);
            m.SetUVs(0, uvs);
            m.SetTriangles(tris, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        private void BuildBridgeStructure(
            BezierRoadNetwork network,
            RoadSegment seg,
            RoadSpec spec,
            Material steelMat,
            Material concreteMat)
        {
            float halfW = spec.TotalWidth * 0.5f;
            float[] pylonTs = { 0.28f, 0.72f };
            var pylonTopsL = new List<Vector3>();
            var pylonTopsR = new List<Vector3>();

            foreach (float t in pylonTs)
            {
                Vec3 c = network.SamplePosition(seg, t);
                Vec3 r = network.SampleRight(seg, t);
                Vector3 center = new Vector3(c.X, c.Y, c.Z);
                Vector3 right = new Vector3(r.X, 0f, r.Z).normalized;
                float groundY = TerrainHeightfield.SampleHeight(c.X, c.Z);
                float pierHeight = Mathf.Max(4f, c.Y - groundY + 1.5f);

                // Submerged Concrete Bridge Pier
                GameObject pier = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pier.name = $"BridgePier_{seg.Id}";
                pier.transform.SetParent(_roadRoot, false);
                pier.transform.position = new Vector3(c.X, groundY + pierHeight * 0.5f - 1.5f, c.Z);
                pier.transform.rotation = Quaternion.LookRotation(new Vector3(-right.z, 0f, right.x), Vector3.up);
                pier.transform.localScale = new Vector3(spec.TotalWidth * 0.78f, pierHeight, 3.2f);
                pier.GetComponent<Renderer>().sharedMaterial = concreteMat;

                // Iconic H-Frame Suspension Pylon Towers on Left & Right edges
                float towerH = 26f;
                Vector3 posL = center - right * (halfW - 0.6f) + Vector3.up * (towerH * 0.5f);
                Vector3 posR = center + right * (halfW - 0.6f) + Vector3.up * (towerH * 0.5f);
                SpawnBox($"PylonL_{seg.Id}", posL, new Vector3(1.1f, towerH, 1.3f), pier.transform.rotation, steelMat);
                SpawnBox($"PylonR_{seg.Id}", posR, new Vector3(1.1f, towerH, 1.3f), pier.transform.rotation, steelMat);
                // Upper & mid H-frame crossbeams
                SpawnBox($"PylonBeamTop_{seg.Id}", center + Vector3.up * (towerH - 1.4f), new Vector3(spec.TotalWidth, 1.1f, 1.1f), pier.transform.rotation, steelMat);
                SpawnBox($"PylonBeamMid_{seg.Id}", center + Vector3.up * (towerH * 0.58f), new Vector3(spec.TotalWidth, 0.85f, 0.9f), pier.transform.rotation, steelMat);

                pylonTopsL.Add(center - right * (halfW - 0.6f) + Vector3.up * (towerH - 0.8f));
                pylonTopsR.Add(center + right * (halfW - 0.6f) + Vector3.up * (towerH - 0.8f));
            }

            // Main parabolic suspension cables between pylon tops
            if (pylonTopsL.Count == 2)
            {
                BuildCableLine(pylonTopsL[0], pylonTopsL[1], 7.5f, steelMat);
                BuildCableLine(pylonTopsR[0], pylonTopsR[1], 7.5f, steelMat);
            }
        }

        private void BuildCableLine(Vector3 a, Vector3 b, float sag, Material mat)
        {
            GameObject go = new GameObject("BridgeCable");
            go.transform.SetParent(_roadRoot, false);
            LineRenderer lr = go.AddComponent<LineRenderer>();
            lr.sharedMaterial = mat;
            lr.startWidth = 0.42f;
            lr.endWidth = 0.42f;
            const int pts = 16;
            lr.positionCount = pts;
            for (int i = 0; i < pts; i++)
            {
                float t = i / (float)(pts - 1);
                Vector3 p = Vector3.Lerp(a, b, t);
                p.y -= 4f * sag * t * (1f - t);
                lr.SetPosition(i, p);
            }
        }

        private void BuildStreetlamps(BezierRoadNetwork network, RoadSegment seg, RoadSpec spec, Material poleMat)
        {
            int count = Mathf.Max(1, Mathf.FloorToInt(seg.LengthMeters / 32f));
            float sideOff = spec.AsphaltWidth * 0.5f + spec.SidewalkWidth * 0.55f;
            for (int i = 1; i < count; i++)
            {
                float t = i / (float)count;
                Vec3 c = network.SamplePosition(seg, t);
                Vec3 r = network.SampleRight(seg, t);
                Vector3 center = new Vector3(c.X, c.Y, c.Z);
                Vector3 right = new Vector3(r.X, 0f, r.Z).normalized;
                SpawnBox("Streetlamp", center + right * sideOff + Vector3.up * 3.8f, new Vector3(0.22f, 7.6f, 0.22f), Quaternion.identity, poleMat);
                if (seg.Type == RoadType.FourLaneAvenue)
                    SpawnBox("Streetlamp", center - right * sideOff + Vector3.up * 3.8f, new Vector3(0.22f, 7.6f, 0.22f), Quaternion.identity, poleMat);
            }
        }

        private void BuildIntersectionJunction(BezierRoadNetwork network, RoadNode node, Material asphaltMat, Material poleMat)
        {
            if (node.ConnectedSegmentIds.Count < 2) return;

            float maxWidth = 8f;
            foreach (int segId in node.ConnectedSegmentIds)
            {
                if (network.Segments.TryGetValue(segId, out RoadSegment seg))
                    maxWidth = Mathf.Max(maxWidth, CityConstants.Roads[seg.Type].AsphaltWidth);
            }

            // Smooth circular asphalt intersection apron covering seam transitions
            GameObject pad = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pad.name = $"Junction_{node.Id}";
            pad.transform.SetParent(_roadRoot, false);
            pad.transform.position = new Vector3(node.Position.X, node.Position.Y + 0.04f, node.Position.Z);
            pad.transform.localScale = new Vector3(maxWidth * 1.15f, 0.14f, maxWidth * 1.15f);
            pad.GetComponent<Renderer>().sharedMaterial = asphaltMat;

            // 3D Intersection Traffic Light Poles on 3-way & 4-way crossroads
            if (node.ConnectedSegmentIds.Count >= 3)
            {
                float corner = maxWidth * 0.62f;
                SpawnBox($"TrafficSignal_{node.Id}_A", new Vector3(node.Position.X + corner, node.Position.Y + 3.4f, node.Position.Z + corner), new Vector3(0.26f, 6.8f, 0.26f), Quaternion.identity, poleMat);
                SpawnBox($"TrafficSignal_{node.Id}_B", new Vector3(node.Position.X - corner, node.Position.Y + 3.4f, node.Position.Z - corner), new Vector3(0.26f, 6.8f, 0.26f), Quaternion.identity, poleMat);
            }
        }

        private void CreateMeshChild(string name, Mesh mesh, Material mat, bool addCollider)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(_roadRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            mr.receiveShadows = true;
            if (addCollider) go.AddComponent<MeshCollider>().sharedMesh = mesh;
        }

        private void SpawnBox(string name, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(_roadRoot, false);
            go.transform.SetPositionAndRotation(pos, rot);
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = mat;
        }

        private static Material CreateFallbackMaterial(string name, Color col, float metallic, float smoothness)
        {
            Shader s = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material m = new Material(s) { name = name };
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", col);
            else m.color = col;
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            return m;
        }
    }
}
