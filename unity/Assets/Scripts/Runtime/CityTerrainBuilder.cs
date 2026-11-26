using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Generates and configures a native Unity Terrain (513x513 heightmap + 4-layer PBR splatmap)
    /// synchronized 1:1 with Metroville.Core.TerrainHeightfield.
    /// </summary>
    public sealed class CityTerrainBuilder : MonoBehaviour
    {
        [Header("Terrain Dimensions")]
        public float TerrainHeightScale = 140f;
        public int HeightmapResolution = 513;
        public int AlphamapResolution = 512;

        [Header("Optional Photo-Scanned Terrain Layers (Auto-generated if empty)")]
        public TerrainLayer MeadowGrassLayer;
        public TerrainLayer HighlandGrassLayer;
        public TerrainLayer CliffRockLayer;
        public TerrainLayer CoastalSandLayer;

        public Terrain ActiveTerrain { get; private set; }

        public Terrain BuildOrRebuildTerrain()
        {
            ActiveTerrain = GetComponent<Terrain>();
            TerrainCollider collider = GetComponent<TerrainCollider>();
            if (ActiveTerrain == null) ActiveTerrain = gameObject.AddComponent<Terrain>();
            if (collider == null) collider = gameObject.AddComponent<TerrainCollider>();

            TerrainData data = new TerrainData
            {
                heightmapResolution = HeightmapResolution,
                alphamapResolution = AlphamapResolution,
                size = new Vector3(CityConstants.WorldSizeMeters, TerrainHeightScale, CityConstants.WorldSizeMeters)
            };

            // 1. Populate heightmap directly from shared mathematical valley/river/mountain heightfield
            float[,] heights = new float[HeightmapResolution, HeightmapResolution];
            for (int z = 0; z < HeightmapResolution; z++)
            {
                float worldZ = (z / (float)(HeightmapResolution - 1)) * CityConstants.WorldSizeMeters;
                for (int x = 0; x < HeightmapResolution; x++)
                {
                    float worldX = (x / (float)(HeightmapResolution - 1)) * CityConstants.WorldSizeMeters;
                    float hMeters = TerrainHeightfield.SampleHeight(worldX, worldZ);
                    heights[z, x] = Mathf.Clamp01(hMeters / TerrainHeightScale);
                }
            }
            data.SetHeights(0, 0, heights);

            // 2. Ensure 4 PBR TerrainLayers exist (swappable anytime with Unity Asset Store / Poly Haven textures)
            EnsureDefaultLayers();
            data.terrainLayers = new[] { MeadowGrassLayer, HighlandGrassLayer, CliffRockLayer, CoastalSandLayer };

            // 3. Paint physically accurate elevation & slope-based 4-channel splatmap
            float[,,] splat = new float[AlphamapResolution, AlphamapResolution, 4];
            for (int z = 0; z < AlphamapResolution; z++)
            {
                float nz = z / (float)(AlphamapResolution - 1);
                float worldZ = nz * CityConstants.WorldSizeMeters;
                for (int x = 0; x < AlphamapResolution; x++)
                {
                    float nx = x / (float)(AlphamapResolution - 1);
                    float worldX = nx * CityConstants.WorldSizeMeters;
                    float h = TerrainHeightfield.SampleHeight(worldX, worldZ);
                    float steepness = data.GetSteepness(nx, nz); // degrees 0..90

                    float wSand = Mathf.Clamp01(1f - Mathf.InverseLerp(CityConstants.WaterLevelMeters - 1.5f, CityConstants.WaterLevelMeters + 2.8f, h));
                    float wRock = Mathf.Clamp01(Mathf.InverseLerp(18f, 36f, steepness) + Mathf.InverseLerp(58f, 82f, h) * 0.7f);
                    float wHigh = Mathf.Clamp01(Mathf.InverseLerp(22f, 44f, h)) * (1f - wRock * 0.75f);
                    float wGrass = Mathf.Max(0.05f, 1f - Mathf.Clamp01(wSand + wRock + wHigh));

                    float sum = wGrass + wHigh + wRock + wSand;
                    splat[z, x, 0] = wGrass / sum;
                    splat[z, x, 1] = wHigh / sum;
                    splat[z, x, 2] = wRock / sum;
                    splat[z, x, 3] = wSand / sum;
                }
            }
            data.SetAlphamaps(0, 0, splat);

            ActiveTerrain.terrainData = data;
            ActiveTerrain.drawInstanced = true;
            ActiveTerrain.heightmapPixelError = 4f;
            ActiveTerrain.basemapDistance = 450f;
            collider.terrainData = data;

            transform.position = Vector3.zero;
            return ActiveTerrain;
        }

        private void EnsureDefaultLayers()
        {
            if (MeadowGrassLayer == null)
                MeadowGrassLayer = CreateProceduralLayer("TemperateMeadow", new Color(0.45f, 0.58f, 0.30f), new Color(0.37f, 0.49f, 0.25f), 26f, 0.08f);
            if (HighlandGrassLayer == null)
                HighlandGrassLayer = CreateProceduralLayer("HighlandScrub", new Color(0.50f, 0.56f, 0.36f), new Color(0.40f, 0.47f, 0.29f), 32f, 0.06f);
            if (CliffRockLayer == null)
                CliffRockLayer = CreateProceduralLayer("GraniteCliff", new Color(0.50f, 0.51f, 0.50f), new Color(0.36f, 0.38f, 0.39f), 22f, 0.14f);
            if (CoastalSandLayer == null)
                CoastalSandLayer = CreateProceduralLayer("CoastalSand", new Color(0.84f, 0.78f, 0.64f), new Color(0.73f, 0.66f, 0.52f), 18f, 0.16f);
        }

        private static TerrainLayer CreateProceduralLayer(string name, Color colA, Color colB, float tileSize, float smoothness)
        {
            const int res = 256;
            Texture2D tex = new Texture2D(res, res, TextureFormat.RGBA32, true)
            {
                name = name + "_Albedo",
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Trilinear
            };
            Color[] pixels = new Color[res * res];
            for (int y = 0; y < res; y++)
            {
                for (int x = 0; x < res; x++)
                {
                    float u = x / (float)res;
                    float v = y / (float)res;
                    float n1 = Mathf.PerlinNoise(u * 6f, v * 6f);
                    float n2 = Mathf.PerlinNoise(u * 22f + 7.1f, v * 22f + 3.4f);
                    float n3 = Mathf.PerlinNoise(u * 56f + 1.9f, v * 56f + 9.2f);
                    float m = Mathf.Clamp01(n1 * 0.55f + n2 * 0.30f + n3 * 0.15f);
                    pixels[y * res + x] = Color.Lerp(colB, colA, m);
                }
            }
            tex.SetPixels(pixels);
            tex.Apply(true);

            return new TerrainLayer
            {
                name = name,
                diffuseTexture = tex,
                tileSize = new Vector2(tileSize, tileSize),
                smoothness = smoothness,
                metallic = 0.02f
            };
        }
    }
}
