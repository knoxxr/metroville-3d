using System.Collections.Generic;
using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Renders all buildings, scenic valley forests, and moving 3D vehicles.
    /// Automatically uses high-detail .fbx/.glb Prefabs from CityAssetRegistry whenever provided,
    /// falling back to multi-part URP Interior-Mapped architectural geometry when empty.
    /// </summary>
    public sealed class CityWorldRenderer : MonoBehaviour
    {
        public CityAssetRegistry Assets;

        private Transform _buildingsRoot;
        private Transform _natureRoot;
        private Transform _vehiclesRoot;
        private readonly Dictionary<int, Transform> _vehicleTransforms = new Dictionary<int, Transform>();

        private Material _concreteTrimMat;
        private Material _roofDarkMat;
        private Material _trunkMat;
        private Material[] _vehiclePalette;

        public void RebuildCity(CitySimulation sim)
        {
            EnsureFallbackMaterials();

            if (_buildingsRoot != null) Destroy(_buildingsRoot.gameObject);
            _buildingsRoot = new GameObject("Generated_Buildings").transform;
            _buildingsRoot.SetParent(transform, false);

            foreach (BuildingInstance b in sim.Buildings)
            {
                SpawnBuildingVisual(b);
            }

            if (_natureRoot == null)
            {
                BuildScenicValleyForest(sim);
            }

            SyncVehicles(sim, true);
        }

        public void SyncVehicles(CitySimulation sim, bool rebuildPool = false)
        {
            EnsureFallbackMaterials();
            if (rebuildPool || _vehiclesRoot == null)
            {
                if (_vehiclesRoot != null) Destroy(_vehiclesRoot.gameObject);
                _vehiclesRoot = new GameObject("Generated_Vehicles").transform;
                _vehiclesRoot.SetParent(transform, false);
                _vehicleTransforms.Clear();
            }

            for (int i = 0; i < sim.Vehicles.Count; i++)
            {
                VehicleAgent v = sim.Vehicles[i];
                if (!_vehicleTransforms.TryGetValue(v.Id, out Transform tr) || tr == null)
                {
                    tr = CreateVehicleVisual(v);
                    _vehicleTransforms[v.Id] = tr;
                }

                Vector3 pos = new Vector3(v.WorldPosition.X, v.WorldPosition.Y, v.WorldPosition.Z);
                Vector3 fwd = new Vector3(v.WorldForward.X, v.WorldForward.Y, v.WorldForward.Z);
                tr.position = pos;
                if (fwd.sqrMagnitude > 1e-4f)
                    tr.rotation = Quaternion.LookRotation(fwd.normalized, Vector3.up);
            }
        }

        private void SpawnBuildingVisual(BuildingInstance b)
        {
            Vector3 pos = new Vector3(b.Position.X, b.Position.Y, b.Position.Z);
            Quaternion rot = Quaternion.Euler(0f, b.YawDegrees, 0f);

            // 1. Prefer custom photorealistic .glb/.fbx Prefab from CityAssetRegistry if assigned!
            GameObject customPrefab = Assets != null ? Assets.ResolveBuildingPrefab(b.Type, b.Level, b.StyleVariant) : null;
            if (customPrefab != null)
            {
                GameObject inst = Instantiate(customPrefab, pos, rot, _buildingsRoot);
                inst.name = $"{b.Type}_{b.Id}_Lv{b.Level}";
                return;
            }

            // 2. Multi-part architectural fallback using our URP Interior-Mapped Glass shader
            GameObject root = new GameObject($"{b.Type}_{b.Id}_Lv{b.Level}");
            root.transform.SetParent(_buildingsRoot, false);
            root.transform.SetPositionAndRotation(pos, rot);

            // Concrete urban plaza apron flush with ground
            SpawnPart(root.transform, "PlazaApron", PrimitiveType.Cube,
                new Vector3(0f, 0.15f, 0f),
                new Vector3(b.FootprintWidth + 2.4f, 0.4f, b.FootprintDepth + 2.4f),
                _concreteTrimMat);

            Material facadeMat = PickFacadeMaterial(b);

            if (b.Type == BuildingType.ParkPlaza)
            {
                Material turfMat = Assets != null && Assets.FoliageBroadleafMaterial != null ? Assets.FoliageBroadleafMaterial : _concreteTrimMat;
                SpawnPart(root.transform, "ParkTurf", PrimitiveType.Cube, new Vector3(0f, 0.35f, 0f), new Vector3(b.FootprintWidth, 0.25f, b.FootprintDepth), turfMat);
                SpawnTreeCluster(root.transform, new Vector3(-5.5f, 0.4f, -5.5f), 1.15f, false);
                SpawnTreeCluster(root.transform, new Vector3(5.5f, 0.4f, 5.0f), 1.05f, false);
                return;
            }

            if (b.Type == BuildingType.PowerWind)
            {
                SpawnPart(root.transform, "TurbineMast", PrimitiveType.Cylinder, new Vector3(0f, 19f, 0f), new Vector3(1.4f, 19f, 1.4f), _concreteTrimMat);
                SpawnPart(root.transform, "Nacelle", PrimitiveType.Cube, new Vector3(0f, 38f, 1.2f), new Vector3(1.8f, 1.8f, 4.2f), _concreteTrimMat);
                return;
            }

            float w = b.FootprintWidth;
            float d = b.FootprintDepth;
            float h = b.HeightMeters;

            if (h > 22f)
            {
                // Multi-tier Skyscraper: Ground Podium + Protruding Cornice + Main Curtain-Wall Shaft + Upper Setback + Rooftop Crown
                float podiumH = Mathf.Min(8.5f, h * 0.22f);
                SpawnPart(root.transform, "Podium", PrimitiveType.Cube, new Vector3(0f, podiumH * 0.5f, 0f), new Vector3(w, podiumH, d), facadeMat);
                SpawnPart(root.transform, "PodiumCornice", PrimitiveType.Cube, new Vector3(0f, podiumH + 0.35f, 0f), new Vector3(w + 0.9f, 0.7f, d + 0.9f), _concreteTrimMat);

                float shaftH = h * 0.56f;
                SpawnPart(root.transform, "MainShaft", PrimitiveType.Cube, new Vector3(0f, podiumH + shaftH * 0.5f, 0f), new Vector3(w * 0.86f, shaftH, d * 0.86f), facadeMat);
                SpawnPart(root.transform, "MidCornice", PrimitiveType.Cube, new Vector3(0f, podiumH + shaftH + 0.3f, 0f), new Vector3(w * 0.91f, 0.6f, d * 0.91f), _concreteTrimMat);

                float crownH = Mathf.Max(5f, h - podiumH - shaftH);
                SpawnPart(root.transform, "UpperCrown", PrimitiveType.Cube, new Vector3(0f, podiumH + shaftH + crownH * 0.5f, 0f), new Vector3(w * 0.68f, crownH, d * 0.68f), facadeMat);
                SpawnPart(root.transform, "RoofHVAC", PrimitiveType.Cube, new Vector3(0f, h + 1.1f, 0f), new Vector3(w * 0.34f, 2.2f, d * 0.34f), _roofDarkMat);

                if (b.Type == BuildingType.LandmarkTower || b.Level >= 4)
                {
                    SpawnPart(root.transform, "Spire", PrimitiveType.Cylinder, new Vector3(0f, h + 9f, 0f), new Vector3(0.45f, 9f, 0.45f), _concreteTrimMat);
                }
            }
            else
            {
                // Mid-rise / Suburban Home / Industrial Hall
                SpawnPart(root.transform, "MainBody", PrimitiveType.Cube, new Vector3(0f, h * 0.5f, 0f), new Vector3(w * 0.88f, h, d * 0.88f), facadeMat);
                SpawnPart(root.transform, "RoofParapet", PrimitiveType.Cube, new Vector3(0f, h + 0.35f, 0f), new Vector3(w * 0.93f, 0.7f, d * 0.93f), _concreteTrimMat);
            }
        }

        private void BuildScenicValleyForest(CitySimulation sim)
        {
            _natureRoot = new GameObject("Generated_ValleyForest").transform;
            _natureRoot.SetParent(transform, false);

            System.Random rng = new System.Random(7788);
            int planted = 0;
            int attempts = 0;

            while (planted < 320 && attempts < 2200)
            {
                attempts++;
                float x = 70f + (float)rng.NextDouble() * (CityConstants.WorldSizeMeters - 140f);
                float z = 120f + (float)rng.NextDouble() * (CityConstants.WorldSizeMeters - 190f);
                float y = TerrainHeightfield.SampleHeight(x, z);
                if (y < CityConstants.WaterLevelMeters + 1.2f || y > 62f) continue;

                // Keep clear of buildings and road corridors
                bool blocked = false;
                for (int i = 0; i < sim.Buildings.Count; i++)
                {
                    float dx = sim.Buildings[i].Position.X - x;
                    float dz = sim.Buildings[i].Position.Z - z;
                    if (dx * dx + dz * dz < 22f * 22f) { blocked = true; break; }
                }
                if (blocked) continue;

                foreach (RoadSegment seg in sim.Roads.Segments.Values)
                {
                    Vec3 mid = sim.Roads.SamplePosition(seg, 0.5f);
                    float dx = mid.X - x;
                    float dz = mid.Z - z;
                    if (dx * dx + dz * dz < 26f * 26f) { blocked = true; break; }
                }
                if (blocked) continue;

                bool conifer = y > 24f || rng.NextDouble() < 0.62;
                float scale = 0.85f + (float)rng.NextDouble() * 0.75f;
                SpawnTreeCluster(_natureRoot, new Vector3(x, y - 0.2f, z), scale, conifer);
                planted++;
            }
        }

        private void SpawnTreeCluster(Transform parent, Vector3 pos, float scale, bool conifer)
        {
            if (Assets != null && Assets.TreePrefabs != null && Assets.TreePrefabs.Count > 0)
            {
                GameObject prefab = Assets.TreePrefabs[Mathf.Abs(Mathf.RoundToInt(pos.x + pos.z)) % Assets.TreePrefabs.Count];
                if (prefab != null)
                {
                    GameObject inst = Instantiate(prefab, pos, Quaternion.Euler(0f, (pos.x * 37f) % 360f, 0f), parent);
                    inst.transform.localScale = Vector3.one * scale;
                    return;
                }
            }

            GameObject tree = new GameObject(conifer ? "ConiferSpruce" : "TemperateOak");
            tree.transform.SetParent(parent, false);
            tree.transform.position = pos;
            tree.transform.localScale = Vector3.one * scale;

            SpawnPart(tree.transform, "Trunk", PrimitiveType.Cylinder, new Vector3(0f, 2.2f, 0f), new Vector3(0.75f, 2.2f, 0.75f), _trunkMat, false);
            Material leafMat = conifer
                ? (Assets != null && Assets.FoliageConiferMaterial != null ? Assets.FoliageConiferMaterial : _concreteTrimMat)
                : (Assets != null && Assets.FoliageBroadleafMaterial != null ? Assets.FoliageBroadleafMaterial : _concreteTrimMat);

            if (conifer)
            {
                // Multi-tiered lush conifer crown
                SpawnPart(tree.transform, "Tier1", PrimitiveType.Sphere, new Vector3(0f, 5.2f, 0f), new Vector3(5.2f, 4.6f, 5.2f), leafMat, false);
                SpawnPart(tree.transform, "Tier2", PrimitiveType.Sphere, new Vector3(0f, 8.6f, 0f), new Vector3(3.8f, 4.2f, 3.8f), leafMat, false);
                SpawnPart(tree.transform, "Tier3", PrimitiveType.Sphere, new Vector3(0f, 11.4f, 0f), new Vector3(2.1f, 3.4f, 2.1f), leafMat, false);
            }
            else
            {
                SpawnPart(tree.transform, "CanopyA", PrimitiveType.Sphere, new Vector3(0f, 6.2f, 0f), new Vector3(6.2f, 5.0f, 6.2f), leafMat, false);
                SpawnPart(tree.transform, "CanopyB", PrimitiveType.Sphere, new Vector3(1.8f, 5.4f, 1.2f), new Vector3(4.0f, 3.6f, 4.0f), leafMat, false);
            }
        }

        private Transform CreateVehicleVisual(VehicleAgent v)
        {
            if (Assets != null && Assets.VehiclePrefabs != null && Assets.VehiclePrefabs.Count > 0)
            {
                GameObject prefab = Assets.VehiclePrefabs[Mathf.Abs(v.ColorIndex) % Assets.VehiclePrefabs.Count];
                if (prefab != null)
                {
                    return Instantiate(prefab, _vehiclesRoot).transform;
                }
            }

            GameObject root = new GameObject($"Vehicle_{v.Id}");
            root.transform.SetParent(_vehiclesRoot, false);
            Material bodyMat = _vehiclePalette[Mathf.Abs(v.ColorIndex) % _vehiclePalette.Length];

            bool isTruck = v.Kind == VehicleKind.DeliveryTruck || v.Kind == VehicleKind.CargoSemi || v.Kind == VehicleKind.CityBus;
            float len = isTruck ? 6.8f : 4.2f;
            float wid = isTruck ? 2.3f : 1.85f;
            float hgt = isTruck ? 2.4f : 1.15f;

            SpawnPart(root.transform, "Body", PrimitiveType.Cube, new Vector3(0f, hgt * 0.5f + 0.25f, 0f), new Vector3(wid, hgt, len), bodyMat, false);
            if (!isTruck)
            {
                SpawnPart(root.transform, "Cabin", PrimitiveType.Cube, new Vector3(0f, 1.45f, -0.2f), new Vector3(wid * 0.84f, 0.72f, len * 0.52f), _roofDarkMat, false);
            }
            return root.transform;
        }

        private Material PickFacadeMaterial(BuildingInstance b)
        {
            if (Assets == null) return _concreteTrimMat;
            switch (b.Type)
            {
                case BuildingType.OfficeTower:
                case BuildingType.LandmarkTower:
                    return (b.StyleVariant % 2 == 0) ? Assets.GlassTowerBlueMaterial : Assets.GlassTowerGoldMaterial;
                case BuildingType.CommercialHigh:
                    return (b.StyleVariant % 3 == 0) ? Assets.GlassTowerGoldMaterial : Assets.GlassTowerBlueMaterial;
                case BuildingType.ResidentialHigh:
                    return (b.StyleVariant % 2 == 0) ? Assets.ModernStoneMaterial : Assets.TerracottaMaterial;
                case BuildingType.ResidentialLow:
                case BuildingType.CommercialLow:
                    return Assets.TerracottaMaterial;
                case BuildingType.IndustrialFactory:
                    return Assets.IndustrialMaterial;
                default:
                    return Assets.ModernStoneMaterial;
            }
        }

        private static void SpawnPart(Transform parent, string name, PrimitiveType primitive, Vector3 localPos, Vector3 localScale, Material mat, bool keepCollider = true)
        {
            GameObject go = GameObject.CreatePrimitive(primitive);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            if (mat != null) go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!keepCollider)
            {
                Collider c = go.GetComponent<Collider>();
                if (c != null) Destroy(c);
            }
        }

        private void EnsureFallbackMaterials()
        {
            if (_concreteTrimMat != null) return;
            Shader lit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            _concreteTrimMat = MakeMat(lit, "UrbanConcrete", new Color(0.82f, 0.85f, 0.88f), 0.05f, 0.25f);
            _roofDarkMat = MakeMat(lit, "RoofDark", new Color(0.24f, 0.27f, 0.32f), 0.20f, 0.42f);
            _trunkMat = MakeMat(lit, "BarkTrunk", new Color(0.32f, 0.24f, 0.17f), 0.0f, 0.10f);

            Color[] carCols =
            {
                new Color(0.92f, 0.94f, 0.96f),
                new Color(0.20f, 0.25f, 0.34f),
                new Color(0.76f, 0.20f, 0.22f),
                new Color(0.18f, 0.44f, 0.76f),
                new Color(0.88f, 0.72f, 0.16f),
                new Color(0.58f, 0.62f, 0.68f),
                new Color(0.20f, 0.56f, 0.42f),
                new Color(0.85f, 0.42f, 0.18f)
            };
            _vehiclePalette = new Material[carCols.Length];
            for (int i = 0; i < carCols.Length; i++)
                _vehiclePalette[i] = MakeMat(lit, $"CarPaint_{i}", carCols[i], 0.62f, 0.85f);
        }

        private static Material MakeMat(Shader s, string name, Color col, float metallic, float smoothness)
        {
            Material m = new Material(s) { name = name };
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", col);
            else m.color = col;
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            return m;
        }
    }
}
