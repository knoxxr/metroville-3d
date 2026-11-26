#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Metroville.Core;
using Metroville.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace Metroville.Editor
{
    /// <summary>
    /// Automated Free CC0 Photorealistic Asset Pipeline for Unity 6 URP:
    /// 1) Downloads genuine CC0 photo-scanned PBR textures directly from Poly Haven's public API
    ///    and binds them as URP TerrainLayers (Meadow, Highland, Cliff Rock, Coastal Sand) + Road Asphalt & Concrete Sidewalk materials.
    /// 2) Scans Assets/ExternalAssets/Models/ for any imported .glb/.gltf/.fbx/.obj 3D models
    ///    (via glTFast or FBX importer), normalizes real-world scale & ground pivot into Prefabs,
    ///    and binds them straight into CityAssetRegistry.asset!
    /// </summary>
    public static class MetrovilleCC0AssetPipeline
    {
        public const string RegistryPath = "Assets/Settings/CityAssetRegistry.asset";
        public const string PolyHavenDir = "Assets/ExternalAssets/PolyHaven";
        public const string TerrainLayerDir = "Assets/Settings/TerrainLayers";
        public const string ExternalModelsDir = "Assets/ExternalAssets/Models";
        public const string AutoPrefabsDir = "Assets/Prefabs/AutoBound";

        private struct PolyHavenSpec
        {
            public string AssetId;
            public string SlotName;
            public float TileSize;
            public float Smoothness;
            public bool IsRoadAsphalt;
            public bool IsRoadSidewalk;
        }

        private static readonly PolyHavenSpec[] PolyHavenTargets =
        {
            new PolyHavenSpec { AssetId = "aerial_grass_rock",   SlotName = "MeadowGrass",     TileSize = 24f, Smoothness = 0.08f },
            new PolyHavenSpec { AssetId = "brown_mud_leaves_01", SlotName = "HighlandScrub",   TileSize = 28f, Smoothness = 0.07f },
            new PolyHavenSpec { AssetId = "rock_wall_04",        SlotName = "CliffRock",       TileSize = 18f, Smoothness = 0.14f },
            new PolyHavenSpec { AssetId = "coast_sand_01",       SlotName = "CoastalSand",     TileSize = 16f, Smoothness = 0.18f },
            new PolyHavenSpec { AssetId = "asphalt_02",          SlotName = "RoadAsphalt",     TileSize = 8f,  Smoothness = 0.36f, IsRoadAsphalt = true },
            new PolyHavenSpec { AssetId = "concrete_pavement",   SlotName = "SidewalkConcrete",TileSize = 6f,  Smoothness = 0.24f, IsRoadSidewalk = true }
        };

        [MenuItem("Metroville/2. Download & Link Poly Haven PBR Textures (CC0)", false, 2)]
        public static void DownloadAndLinkPolyHavenPBR()
        {
            DownloadAndLinkPolyHavenPBR("1k");
        }

        public static void DownloadAndLinkPolyHavenPBR(string resolution)
        {
            CityAssetRegistry reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(RegistryPath);
            if (reg == null)
            {
                MetrovilleEditorSetup.SetupEverything();
                reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(RegistryPath);
            }

            EnsureFolderTree(PolyHavenDir);
            EnsureFolderTree(TerrainLayerDir);

            int successCount = 0;
            try
            {
                for (int i = 0; i < PolyHavenTargets.Length; i++)
                {
                    PolyHavenSpec spec = PolyHavenTargets[i];
                    EditorUtility.DisplayProgressBar(
                        "Poly Haven CC0 PBR Pipeline",
                        $"다운로드 중 ({i + 1}/{PolyHavenTargets.Length}): {spec.AssetId} ({resolution})...",
                        (float)i / PolyHavenTargets.Length
                    );

                    string apiJson = FetchTextSync($"https://api.polyhaven.com/files/{spec.AssetId}");
                    if (string.IsNullOrEmpty(apiJson))
                    {
                        Debug.LogWarning($"[Metroville CC0] Poly Haven API 응답 실패: {spec.AssetId}");
                        continue;
                    }

                    string diffuseUrl = ExtractMapUrl(apiJson, "Diffuse", resolution);
                    string normalUrl = ExtractMapUrl(apiJson, "nor_gl", resolution);
                    if (string.IsNullOrEmpty(diffuseUrl))
                    {
                        Debug.LogWarning($"[Metroville CC0] Diffuse URL을 찾지 못함: {spec.AssetId}");
                        continue;
                    }

                    string diffuseAssetPath = $"{PolyHavenDir}/{spec.SlotName}_Diffuse.jpg";
                    string normalAssetPath = $"{PolyHavenDir}/{spec.SlotName}_Normal.jpg";

                    if (!DownloadFileSync(diffuseUrl, diffuseAssetPath)) continue;
                    bool hasNormal = !string.IsNullOrEmpty(normalUrl) && DownloadFileSync(normalUrl, normalAssetPath);

                    AssetDatabase.ImportAsset(diffuseAssetPath, ImportAssetOptions.ForceSynchronousImport);
                    ConfigureTextureImporter(diffuseAssetPath, false);

                    Texture2D diffTex = AssetDatabase.LoadAssetAtPath<Texture2D>(diffuseAssetPath);
                    Texture2D normTex = null;
                    if (hasNormal)
                    {
                        AssetDatabase.ImportAsset(normalAssetPath, ImportAssetOptions.ForceSynchronousImport);
                        ConfigureTextureImporter(normalAssetPath, true);
                        normTex = AssetDatabase.LoadAssetAtPath<Texture2D>(normalAssetPath);
                    }

                    if (spec.IsRoadAsphalt && reg.AsphaltMaterial != null)
                    {
                        BindUrpLitMaps(reg.AsphaltMaterial, diffTex, normTex, new Vector2(1.5f, 1.5f), spec.Smoothness, new Color(0.75f, 0.78f, 0.82f));
                    }
                    else if (spec.IsRoadSidewalk && reg.SidewalkMaterial != null)
                    {
                        BindUrpLitMaps(reg.SidewalkMaterial, diffTex, normTex, new Vector2(1.2f, 2.5f), spec.Smoothness, new Color(0.95f, 0.96f, 0.98f));
                    }
                    else
                    {
                        TerrainLayer layer = CreateOrUpdateTerrainLayer(spec.SlotName, diffTex, normTex, spec.TileSize, spec.Smoothness);
                        if (spec.SlotName == "MeadowGrass") reg.MeadowGrassLayer = layer;
                        else if (spec.SlotName == "HighlandScrub") reg.HighlandGrassLayer = layer;
                        else if (spec.SlotName == "CliffRock") reg.CliffRockLayer = layer;
                        else if (spec.SlotName == "CoastalSand") reg.CoastalSandLayer = layer;
                    }

                    successCount++;
                }

                EditorUtility.SetDirty(reg);
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                // Update active Terrain in open scene immediately if present
                CityTerrainBuilder terrainBuilder = UnityEngine.Object.FindFirstObjectByType<CityTerrainBuilder>();
                if (terrainBuilder != null)
                {
                    terrainBuilder.Assets = reg;
                    terrainBuilder.MeadowGrassLayer = reg.MeadowGrassLayer;
                    terrainBuilder.HighlandGrassLayer = reg.HighlandGrassLayer;
                    terrainBuilder.CliffRockLayer = reg.CliffRockLayer;
                    terrainBuilder.CoastalSandLayer = reg.CoastalSandLayer;
                    EditorUtility.SetDirty(terrainBuilder);
                }

                Debug.Log($"[Metroville CC0] Poly Haven 실사 PBR 텍스처 {successCount}/{PolyHavenTargets.Length}종 자동 연동 완료!");
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        [MenuItem("Metroville/3. Auto-Bind .glb/.fbx Models to CityAssetRegistry", false, 3)]
        public static void AutoBindExternalModels()
        {
            CityAssetRegistry reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(RegistryPath);
            if (reg == null)
            {
                MetrovilleEditorSetup.SetupEverything();
                reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(RegistryPath);
            }

            CreateRecommendedModelFolders();
            EnsureFolderTree(AutoPrefabsDir);

            string[] modelGuids = AssetDatabase.FindAssets("t:GameObject", new[] { ExternalModelsDir });
            int boundBuildings = 0;
            int boundTrees = 0;
            int boundVehicles = 0;

            foreach (string guid in modelGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                string ext = Path.GetExtension(path).ToLowerInvariant();
                if (ext != ".glb" && ext != ".gltf" && ext != ".fbx" && ext != ".obj" && ext != ".prefab")
                    continue;

                GameObject sourceObj = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (sourceObj == null) continue;

                string lowerPath = path.ToLowerInvariant();
                string fileName = Path.GetFileNameWithoutExtension(path);

                if (IsTreeAsset(lowerPath))
                {
                    GameObject prefab = BuildNormalizedPrefab(sourceObj, $"Tree_{fileName}", 12.5f);
                    if (prefab != null && !reg.TreePrefabs.Contains(prefab))
                    {
                        reg.TreePrefabs.Add(prefab);
                        boundTrees++;
                    }
                }
                else if (IsVehicleAsset(lowerPath))
                {
                    GameObject prefab = BuildNormalizedPrefab(sourceObj, $"Vehicle_{fileName}", 1.85f);
                    if (prefab != null && !reg.VehiclePrefabs.Contains(prefab))
                    {
                        reg.VehiclePrefabs.Add(prefab);
                        boundVehicles++;
                    }
                }
                else
                {
                    ClassifyBuilding(lowerPath, out BuildingType bType, out int minLevel, out float targetHeight);
                    GameObject prefab = BuildNormalizedPrefab(sourceObj, $"Bldg_{bType}_{fileName}", targetHeight);
                    if (prefab != null && !HasBuildingPrefab(reg, bType, prefab))
                    {
                        reg.BuildingPrefabs.Add(new BuildingPrefabEntry
                        {
                            Type = bType,
                            MinLevel = minLevel,
                            Prefab = prefab
                        });
                        boundBuildings++;
                    }
                }
            }

            EditorUtility.SetDirty(reg);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog(
                "CC0 3D 모델 자동 연동 완료",
                $"스캔 경로: {ExternalModelsDir}\n\n" +
                $"• 새로 연동된 건물 프리팹: {boundBuildings}개 (총 {reg.BuildingPrefabs.Count}개)\n" +
                $"• 새로 연동된 나무 프리팹: {boundTrees}개 (총 {reg.TreePrefabs.Count}개)\n" +
                $"• 새로 연동된 차량 프리팹: {boundVehicles}개 (총 {reg.VehiclePrefabs.Count}개)\n\n" +
                $"외부 .glb/.fbx 모델을 위 폴더에 넣은 뒤 다시 실행하면 자동으로 지면 피벗·실제 미터 스케일이 정규화되어 도시에 즉시 반영됩니다!",
                "확인"
            );
        }

        public static void CreateRecommendedModelFolders()
        {
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/ResidentialLow");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/ResidentialHigh");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/CommercialLow");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/CommercialHigh");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/Office");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/Industrial");
            EnsureFolderTree($"{ExternalModelsDir}/Buildings/Civic");
            EnsureFolderTree($"{ExternalModelsDir}/Trees");
            EnsureFolderTree($"{ExternalModelsDir}/Vehicles");
        }

        private static GameObject BuildNormalizedPrefab(GameObject sourceModel, string prefabName, float desiredHeightMeters)
        {
            string safeName = Regex.Replace(prefabName, @"[^a-zA-Z0-9_\-]", "_");
            string outPath = $"{AutoPrefabsDir}/{safeName}.prefab";

            GameObject root = new GameObject(safeName);
            GameObject child = (GameObject)PrefabUtility.InstantiatePrefab(sourceModel);
            if (child == null) child = UnityEngine.Object.Instantiate(sourceModel);
            child.transform.SetParent(root.transform, false);

            // Compute combined renderer bounds so any cm/mm/arbitrary-scale CC0 asset fits real meters flush at Y=0!
            Renderer[] renderers = child.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length > 0)
            {
                Bounds bounds = renderers[0].bounds;
                for (int i = 1; i < renderers.Length; i++)
                    bounds.Encapsulate(renderers[i].bounds);

                float currentHeight = Mathf.Max(0.01f, bounds.size.y);
                float scaleFactor = desiredHeightMeters / currentHeight;
                child.transform.localScale *= scaleFactor;

                // Re-measure after scaling to center XZ and sit strictly on Y = 0
                bounds = renderers[0].bounds;
                for (int i = 1; i < renderers.Length; i++)
                    bounds.Encapsulate(renderers[i].bounds);

                child.transform.localPosition = new Vector3(
                    -bounds.center.x,
                    -bounds.min.y,
                    -bounds.center.z
                );
            }

            GameObject saved = PrefabUtility.SaveAsPrefabAsset(root, outPath);
            UnityEngine.Object.DestroyImmediate(root);
            return saved;
        }

        private static bool IsTreeAsset(string lowerPath)
        {
            return lowerPath.Contains("/trees/") || lowerPath.Contains("pine") || lowerPath.Contains("spruce")
                || lowerPath.Contains("fir") || lowerPath.Contains("oak") || lowerPath.Contains("tree") || lowerPath.Contains("foliage");
        }

        private static bool IsVehicleAsset(string lowerPath)
        {
            return lowerPath.Contains("/vehicles/") || lowerPath.Contains("car") || lowerPath.Contains("sedan")
                || lowerPath.Contains("truck") || lowerPath.Contains("bus") || lowerPath.Contains("taxi")
                || lowerPath.Contains("suv") || lowerPath.Contains("van") || lowerPath.Contains("ambulance");
        }

        private static void ClassifyBuilding(string lowerPath, out BuildingType type, out int minLevel, out float targetHeight)
        {
            minLevel = 1;
            if (lowerPath.Contains("/office/") || lowerPath.Contains("skyscraper") || lowerPath.Contains("office") || lowerPath.Contains("tower"))
            {
                type = BuildingType.OfficeTower;
                targetHeight = 58f;
            }
            else if (lowerPath.Contains("/commercialhigh/") || lowerPath.Contains("mall") || lowerPath.Contains("hotel") || lowerPath.Contains("highrise"))
            {
                type = BuildingType.CommercialHigh;
                targetHeight = 46f;
            }
            else if (lowerPath.Contains("/commerciallow/") || lowerPath.Contains("shop") || lowerPath.Contains("store") || lowerPath.Contains("cafe"))
            {
                type = BuildingType.CommercialLow;
                targetHeight = 11f;
            }
            else if (lowerPath.Contains("/residentialhigh/") || lowerPath.Contains("apartment") || lowerPath.Contains("condo"))
            {
                type = BuildingType.ResidentialHigh;
                targetHeight = 34f;
            }
            else if (lowerPath.Contains("/industrial/") || lowerPath.Contains("factory") || lowerPath.Contains("warehouse") || lowerPath.Contains("silo"))
            {
                type = BuildingType.IndustrialFactory;
                targetHeight = 14f;
            }
            else if (lowerPath.Contains("hospital"))
            {
                type = BuildingType.Hospital;
                targetHeight = 24f;
            }
            else if (lowerPath.Contains("school") || lowerPath.Contains("university"))
            {
                type = BuildingType.University;
                targetHeight = 20f;
            }
            else
            {
                type = BuildingType.ResidentialLow;
                targetHeight = 9.5f;
            }
        }

        private static bool HasBuildingPrefab(CityAssetRegistry reg, BuildingType type, GameObject prefab)
        {
            for (int i = 0; i < reg.BuildingPrefabs.Count; i++)
            {
                if (reg.BuildingPrefabs[i].Type == type && reg.BuildingPrefabs[i].Prefab == prefab)
                    return true;
            }
            return false;
        }

        private static TerrainLayer CreateOrUpdateTerrainLayer(string slotName, Texture2D diffuse, Texture2D normal, float tileSize, float smoothness)
        {
            string path = $"{TerrainLayerDir}/Layer_{slotName}.terrainlayer";
            TerrainLayer layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(path);
            if (layer == null)
            {
                layer = new TerrainLayer { name = $"Layer_{slotName}" };
                AssetDatabase.CreateAsset(layer, path);
            }
            layer.diffuseTexture = diffuse;
            layer.normalMapTexture = normal;
            layer.normalScale = 1.0f;
            layer.tileSize = new Vector2(tileSize, tileSize);
            layer.smoothness = smoothness;
            layer.metallic = 0.02f;
            EditorUtility.SetDirty(layer);
            return layer;
        }

        private static void BindUrpLitMaps(Material mat, Texture2D diffuse, Texture2D normal, Vector2 tiling, float smoothness, Color tint)
        {
            if (diffuse != null && mat.HasProperty("_BaseMap"))
            {
                mat.SetTexture("_BaseMap", diffuse);
                mat.SetTextureScale("_BaseMap", tiling);
            }
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", tint);
            if (normal != null && mat.HasProperty("_BumpMap"))
            {
                mat.SetTexture("_BumpMap", normal);
                mat.SetTextureScale("_BumpMap", tiling);
                mat.SetFloat("_BumpScale", 0.85f);
                mat.EnableKeyword("_NORMALMAP");
            }
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            EditorUtility.SetDirty(mat);
        }

        private static void ConfigureTextureImporter(string assetPath, bool isNormalMap)
        {
            TextureImporter importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null) return;
            importer.textureType = isNormalMap ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.sRGBTexture = !isNormalMap;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.anisoLevel = 8;
            importer.mipmapEnabled = true;
            importer.maxTextureSize = 2048;
            importer.SaveAndReimport();
        }

        private static string ExtractMapUrl(string json, string mapKey, string res)
        {
            // Locate the map section (e.g., "Diffuse" or "nor_gl"), then resolution ("1k"/"2k"), then jpg or png "url"
            string pattern = $"\"{Regex.Escape(mapKey)}\"\\s*:\\s*\\{{.*?\"{Regex.Escape(res)}\"\\s*:\\s*\\{{.*?\"(?:jpg|png)\"\\s*:\\s*\\{{.*?\"url\"\\s*:\\s*\"([^\"]+)\"";
            Match m = Regex.Match(json, pattern, RegexOptions.Singleline);
            return m.Success ? m.Groups[1].Value : null;
        }

        private static string FetchTextSync(string url)
        {
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.SetRequestHeader("User-Agent", "Metroville3D-Unity6-CC0Pipeline/1.0");
                var op = req.SendWebRequest();
                while (!op.isDone) { }
                return req.result == UnityWebRequest.Result.Success ? req.downloadHandler.text : null;
            }
        }

        private static bool DownloadFileSync(string url, string assetPath)
        {
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.SetRequestHeader("User-Agent", "Metroville3D-Unity6-CC0Pipeline/1.0");
                var op = req.SendWebRequest();
                while (!op.isDone) { }
                if (req.result != UnityWebRequest.Result.Success) return false;
                string fullPath = Path.GetFullPath(assetPath);
                Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
                File.WriteAllBytes(fullPath, req.downloadHandler.data);
                return true;
            }
        }

        private static void EnsureFolderTree(string assetFolderPath)
        {
            string[] parts = assetFolderPath.Split('/');
            string current = parts[0];
            for (int i = 1; i < parts.Length; i++)
            {
                string next = current + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(current, parts[i]);
                current = next;
            }
        }
    }

    /// <summary>
    /// Visual Unity Editor Window for 1-click Poly Haven PBR texture downloads,
    /// curated CC0 .glb/.fbx 3D pack links, and instant CityAssetRegistry binding status.
    /// </summary>
    public sealed class MetrovilleAssetHubWindow : EditorWindow
    {
        private int _resIndex;
        private readonly string[] _resOptions = { "1k (빠름, 추천)", "2k (고해상도)" };

        [MenuItem("Metroville/4. Open CC0 Asset Hub Window", false, 4)]
        public static void OpenWindow()
        {
            var win = GetWindow<MetrovilleAssetHubWindow>("Metroville CC0 Hub");
            win.minSize = new Vector2(460f, 440f);
        }

        private void OnGUI()
        {
            GUILayout.Space(8);
            EditorGUILayout.LabelField("메트로빌 Unity 6 — 무료 CC0 실사 에셋 & PBR 연동 허브", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "1) 아래 버튼 하나로 Poly Haven의 CC0 실사 사진 PBR 텍스처 6종(잔디·고지대·절벽 바위·해변 모래·도로 아스팔트·보도 콘크리트)을 자동 다운로드하여 TerrainLayer와 도로 머티리얼에 즉시 적용합니다.\n" +
                "2) 무료 CC0 3D 건물·자동차·침엽수 모델(.glb/.fbx)을 Assets/ExternalAssets/Models/ 폴더에 넣은 뒤 '자동 연동'을 누르면 스케일과 바닥 피벗을 자동 보정해 CityAssetRegistry에 연결합니다.",
                MessageType.Info
            );

            GUILayout.Space(6);
            EditorGUILayout.LabelField("Step 1. Poly Haven 사진 스캔 PBR 텍스처 (CC0)", EditorStyles.boldLabel);
            _resIndex = EditorGUILayout.Popup("다운로드 해상도", _resIndex, _resOptions);
            if (GUILayout.Button("Poly Haven PBR 6종 다운로드 & TerrainLayer 자동 연동", GUILayout.Height(34)))
            {
                MetrovilleCC0AssetPipeline.DownloadAndLinkPolyHavenPBR(_resIndex == 0 ? "1k" : "2k");
            }

            GUILayout.Space(12);
            EditorGUILayout.LabelField("Step 2. 무료 CC0 3D 건물 · 차량 · 침엽수 모델 (.glb / .fbx)", EditorStyles.boldLabel);
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Kenney City Commercial (CC0)")) Application.OpenURL("https://kenney.nl/assets/city-kit-commercial");
            if (GUILayout.Button("Kenney City Suburban (CC0)")) Application.OpenURL("https://kenney.nl/assets/city-kit-suburban");
            EditorGUILayout.EndHorizontal();
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Kenney Car Kit (CC0)")) Application.OpenURL("https://kenney.nl/assets/car-kit");
            if (GUILayout.Button("Quaternius Nature Pack (CC0)")) Application.OpenURL("https://quaternius.com/packs/ultimatenature.html");
            EditorGUILayout.EndHorizontal();

            GUILayout.Space(6);
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("모델 폴더 생성 및 열기", GUILayout.Height(28)))
            {
                MetrovilleCC0AssetPipeline.CreateRecommendedModelFolders();
                EditorUtility.RevealInFinder(Path.GetFullPath(MetrovilleCC0AssetPipeline.ExternalModelsDir));
            }
            if (GUILayout.Button("가져온 .glb/.fbx 모델 자동 연동", GUILayout.Height(28)))
            {
                MetrovilleCC0AssetPipeline.AutoBindExternalModels();
            }
            EditorGUILayout.EndHorizontal();

            GUILayout.Space(12);
            CityAssetRegistry reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(MetrovilleCC0AssetPipeline.RegistryPath);
            if (reg != null)
            {
                EditorGUILayout.LabelField("현재 CityAssetRegistry 연동 현황", EditorStyles.boldLabel);
                EditorGUILayout.LabelField($"• TerrainLayer PBR: {(reg.MeadowGrassLayer != null ? "연동됨 (4채널)" : "기본 절차적 텍스처")}");
                EditorGUILayout.LabelField($"• 커스텀 3D 건물 프리팹: {reg.BuildingPrefabs.Count}개");
                EditorGUILayout.LabelField($"• 커스텀 3D 나무 프리팹: {reg.TreePrefabs.Count}개");
                EditorGUILayout.LabelField($"• 커스텀 3D 차량 프리팹: {reg.VehiclePrefabs.Count}개");
            }
        }
    }
}
#endif
