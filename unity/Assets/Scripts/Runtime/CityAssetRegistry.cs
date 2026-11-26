using System;
using System.Collections.Generic;
using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    [Serializable]
    public struct BuildingPrefabEntry
    {
        public BuildingType Type;
        public int MinLevel;
        public GameObject Prefab;
    }

    /// <summary>
    /// Drop-in 3D Asset Registry ScriptableObject.
    /// Drag any Unity Asset Store / Sketchfab / Poly Pizza .fbx or .glb Prefab into this asset
    /// and Metroville immediately renders your photorealistic 3D models across the city!
    /// Any unassigned BuildingType automatically falls back to the built-in multi-part URP Lit architecture.
    /// </summary>
    [CreateAssetMenu(fileName = "CityAssetRegistry", menuName = "Metroville/City Asset Registry")]
    public sealed class CityAssetRegistry : ScriptableObject
    {
        [Header("Custom 3D Building Prefabs (Optional — overrides procedural meshes)")]
        public List<BuildingPrefabEntry> BuildingPrefabs = new List<BuildingPrefabEntry>();

        [Header("Custom 3D Nature & Vehicle Prefabs (Optional)")]
        public List<GameObject> TreePrefabs = new List<GameObject>();
        public List<GameObject> VehiclePrefabs = new List<GameObject>();

        [Header("Photo-Scanned PBR Terrain Layers (Auto-linked by Poly Haven CC0 Pipeline)")]
        public TerrainLayer MeadowGrassLayer;
        public TerrainLayer HighlandGrassLayer;
        public TerrainLayer CliffRockLayer;
        public TerrainLayer CoastalSandLayer;

        [Header("Core URP Materials (Auto-assigned by Metroville Editor Setup)")]
        public Material SkyboxMaterial;
        public Material WaterMaterial;
        public Material AsphaltMaterial;
        public Material SidewalkMaterial;
        public Material BridgeSteelMaterial;
        public Material GlassTowerBlueMaterial;
        public Material GlassTowerGoldMaterial;
        public Material ModernStoneMaterial;
        public Material TerracottaMaterial;
        public Material IndustrialMaterial;
        public Material FoliageConiferMaterial;
        public Material FoliageBroadleafMaterial;

        public GameObject ResolveBuildingPrefab(BuildingType type, int level, int styleVariant)
        {
            var matches = new List<GameObject>();
            for (int i = 0; i < BuildingPrefabs.Count; i++)
            {
                var entry = BuildingPrefabs[i];
                if (entry.Type == type && entry.Prefab != null && level >= entry.MinLevel)
                {
                    matches.Add(entry.Prefab);
                }
            }
            if (matches.Count == 0) return null;
            return matches[Mathf.Abs(styleVariant) % matches.Count];
        }
    }
}
