#if UNITY_EDITOR
using System.IO;
using Metroville.Core;
using Metroville.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Metroville.Editor
{
    /// <summary>
    /// 1-Click Unity 6 URP Photorealistic Scene & Pipeline Bootstrapper.
    /// Open this project in Unity 6 Hub and click:
    ///   Metroville -> 1. Setup URP Photorealistic Scene & Assets
    /// </summary>
    public static class MetrovilleEditorSetup
    {
        private const string SettingsDir = "Assets/Settings";
        private const string MaterialsDir = "Assets/Materials";
        private const string ScenesDir = "Assets/Scenes";

        [MenuItem("Metroville/1. Setup URP Photorealistic Scene & Assets", false, 1)]
        public static void SetupEverything()
        {
            EnsureFolder("Assets", "Settings");
            EnsureFolder("Assets", "Materials");
            EnsureFolder("Assets", "Scenes");

            // 1. Create & assign Unity 6 URP Pipeline Asset (4-Cascade Shadows, Depth & Opaque Texture, HDR, MSAA 4x)
            UniversalRenderPipelineAsset urpAsset = CreateOrLoadUrpAsset();
            GraphicsSettings.defaultRenderPipeline = urpAsset;
            QualitySettings.renderPipeline = urpAsset;

            // 2. Create Post-Processing Volume Profile (ACES Tonemapping, Bloom, Tilt-Shift DOF, Color Grading, Vignette)
            VolumeProfile volumeProfile = CreateOrLoadVolumeProfile();

            // 3. Create all URP Shaders & Materials and wire CityAssetRegistry ScriptableObject
            CityAssetRegistry registry = CreateOrLoadAssetRegistry();

            // 4. Build and save Assets/Scenes/MainCity.unity
            BuildMainCityScene(registry, volumeProfile);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog(
                "Metroville Unity 6 URP Setup Complete!",
                "URP 6 렌더 파이프라인(4-Cascade CSM, Depth/Opaque Water, ACES 후처리), 머티리얼, 에셋 레지스트리 및 MainCity 씬이 자동으로 구성되었습니다.\n\n이제 상단 Play(▶) 버튼을 눌러 바로 플레이하세요!",
                "확인"
            );
        }

        private static UniversalRenderPipelineAsset CreateOrLoadUrpAsset()
        {
            string assetPath = $"{SettingsDir}/Metroville_URP_Asset.asset";
            UniversalRenderPipelineAsset existing = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(assetPath);
            if (existing != null) return existing;

            UniversalRendererData rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
            AssetDatabase.CreateAsset(rendererData, $"{SettingsDir}/Metroville_URP_Renderer.asset");

            UniversalRenderPipelineAsset urp = UniversalRenderPipelineAsset.Create(rendererData);
            urp.supportsHDR = true;
            urp.msaaSampleCount = 4;
            urp.supportsCameraDepthTexture = true;
            urp.supportsCameraOpaqueTexture = true;
            urp.shadowDistance = 520f;
            urp.shadowCascadeCount = 4;
            urp.cascade4Split = new Vector3(0.06f, 0.20f, 0.48f);

            AssetDatabase.CreateAsset(urp, assetPath);
            return urp;
        }

        private static VolumeProfile CreateOrLoadVolumeProfile()
        {
            string path = $"{SettingsDir}/Metroville_PostProcessProfile.asset";
            VolumeProfile profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null) return profile;

            profile = ScriptableObject.CreateInstance<VolumeProfile>();

            // ACES Filmic Tonemapping (Cities: Skylines daylight cinema look)
            Tonemapping tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);

            // Subtle photorealistic Bloom for sunlit glass highlights & night windows
            Bloom bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(0.95f);
            bloom.intensity.Override(0.28f);
            bloom.scatter.Override(0.62f);

            // Temperate Daylight Color Grading
            ColorAdjustments color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.18f);
            color.contrast.Override(8f);
            color.saturation.Override(7f);

            // Signature Cities: Skylines Subtle Depth of Field
            DepthOfField dof = profile.Add<DepthOfField>(true);
            dof.mode.Override(DepthOfFieldMode.Bokeh);
            dof.focusDistance.Override(190f);
            dof.focalLength.Override(55f);
            dof.aperture.Override(12f);

            // Delicate optical vignette
            Vignette vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.16f);
            vig.smoothness.Override(0.45f);

            AssetDatabase.CreateAsset(profile, path);
            return profile;
        }

        private static CityAssetRegistry CreateOrLoadAssetRegistry()
        {
            string path = $"{SettingsDir}/CityAssetRegistry.asset";
            CityAssetRegistry reg = AssetDatabase.LoadAssetAtPath<CityAssetRegistry>(path);
            if (reg == null)
            {
                reg = ScriptableObject.CreateInstance<CityAssetRegistry>();
                AssetDatabase.CreateAsset(reg, path);
            }

            Shader skyShader = Shader.Find("Metroville/URP/AtmosphericSky") ?? Shader.Find("Skybox/Procedural");
            Shader waterShader = Shader.Find("Metroville/URP/CitiesWater") ?? Shader.Find("Universal Render Pipeline/Lit");
            Shader glassShader = Shader.Find("Metroville/URP/BuildingGlassLit") ?? Shader.Find("Universal Render Pipeline/Lit");
            Shader litShader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            reg.SkyboxMaterial = CreateOrLoadMat("Mat_AtmosphericSky", skyShader, m => { });
            reg.WaterMaterial = CreateOrLoadMat("Mat_CitiesWater", waterShader, m => { });

            reg.AsphaltMaterial = CreateOrLoadMat("Mat_RoadAsphalt", litShader, m =>
            {
                SetLit(m, new Color(0.24f, 0.27f, 0.31f), 0.08f, 0.34f);
            });
            reg.SidewalkMaterial = CreateOrLoadMat("Mat_SidewalkConcrete", litShader, m =>
            {
                SetLit(m, new Color(0.80f, 0.83f, 0.87f), 0.04f, 0.24f);
            });
            reg.BridgeSteelMaterial = CreateOrLoadMat("Mat_BridgeSteel", litShader, m =>
            {
                SetLit(m, new Color(0.89f, 0.92f, 0.96f), 0.42f, 0.58f);
            });

            reg.GlassTowerBlueMaterial = CreateOrLoadMat("Mat_GlassTowerBlue", glassShader, m =>
            {
                m.SetColor("_BaseColor", new Color(0.84f, 0.88f, 0.92f));
                m.SetColor("_GlassTint", new Color(0.32f, 0.56f, 0.78f));
                m.SetFloat("_MullionWidth", 0.13f);
            });
            reg.GlassTowerGoldMaterial = CreateOrLoadMat("Mat_GlassTowerGold", glassShader, m =>
            {
                m.SetColor("_BaseColor", new Color(0.86f, 0.82f, 0.74f));
                m.SetColor("_GlassTint", new Color(0.68f, 0.58f, 0.42f));
                m.SetFloat("_MullionWidth", 0.14f);
            });
            reg.ModernStoneMaterial = CreateOrLoadMat("Mat_ModernStone", glassShader, m =>
            {
                m.SetColor("_BaseColor", new Color(0.90f, 0.91f, 0.89f));
                m.SetColor("_GlassTint", new Color(0.42f, 0.58f, 0.70f));
                m.SetFloat("_MullionWidth", 0.20f);
            });
            reg.TerracottaMaterial = CreateOrLoadMat("Mat_Terracotta", glassShader, m =>
            {
                m.SetColor("_BaseColor", new Color(0.76f, 0.52f, 0.40f));
                m.SetColor("_GlassTint", new Color(0.44f, 0.54f, 0.62f));
                m.SetFloat("_MullionWidth", 0.24f);
            });
            reg.IndustrialMaterial = CreateOrLoadMat("Mat_Industrial", litShader, m =>
            {
                SetLit(m, new Color(0.56f, 0.58f, 0.61f), 0.25f, 0.28f);
            });
            reg.FoliageConiferMaterial = CreateOrLoadMat("Mat_FoliageConifer", litShader, m =>
            {
                SetLit(m, new Color(0.22f, 0.46f, 0.24f), 0.0f, 0.16f);
            });
            reg.FoliageBroadleafMaterial = CreateOrLoadMat("Mat_FoliageBroadleaf", litShader, m =>
            {
                SetLit(m, new Color(0.36f, 0.60f, 0.25f), 0.0f, 0.18f);
            });

            EditorUtility.SetDirty(reg);
            return reg;
        }

        private static void BuildMainCityScene(CityAssetRegistry registry, VolumeProfile volumeProfile)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 1. Directional Sun Light (4-cascade soft shadows)
            GameObject sunObj = new GameObject("Directional Sun");
            Light sun = sunObj.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowBias = 0.05f;
            sun.shadowNormalBias = 0.4f;
            sunObj.transform.rotation = Quaternion.Euler(48f, 42f, 0f);

            // 2. Main Camera with URP Post-Processing + SMAA + SkylinesCameraController
            GameObject camObj = new GameObject("Main Camera");
            camObj.tag = "MainCamera";
            Camera cam = camObj.AddComponent<Camera>();
            cam.fieldOfView = 42f;
            cam.nearClipPlane = 0.8f;
            cam.farClipPlane = 2400f;
            camObj.AddComponent<AudioListener>();
            var urpCam = camObj.AddComponent<UniversalAdditionalCameraData>();
            urpCam.renderPostProcessing = true;
            urpCam.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            urpCam.antialiasingQuality = AntialiasingQuality.High;
            camObj.AddComponent<SkylinesCameraController>();

            // 3. Global URP Post-Processing Volume
            GameObject volObj = new GameObject("Global PostProcess Volume");
            Volume vol = volObj.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = volumeProfile;

            // 4. Native Unity Terrain
            GameObject terrainObj = new GameObject("ValleyTerrain");
            CityTerrainBuilder terrainBuilder = terrainObj.AddComponent<CityTerrainBuilder>();

            // 5. Full-Valley URP Depth-Refracting Water Plane at Y = 14.0m
            GameObject waterObj = GameObject.CreatePrimitive(PrimitiveType.Plane);
            waterObj.name = "RiverAndBayWater";
            waterObj.transform.position = new Vector3(CityConstants.WorldSizeMeters * 0.5f, CityConstants.WaterLevelMeters, CityConstants.WorldSizeMeters * 0.5f);
            waterObj.transform.localScale = new Vector3(CityConstants.WorldSizeMeters / 10f, 1f, CityConstants.WorldSizeMeters / 10f);
            waterObj.GetComponent<Renderer>().sharedMaterial = registry.WaterMaterial;
            Object.DestroyImmediate(waterObj.GetComponent<Collider>());

            // 6. Central CityGameBootstrap & World Builders
            GameObject mgrObj = new GameObject("MetrovilleManager");
            CityGameBootstrap bootstrap = mgrObj.AddComponent<CityGameBootstrap>();
            SplineRoadMeshBuilder roadBuilder = mgrObj.AddComponent<SplineRoadMeshBuilder>();
            CityWorldRenderer worldRenderer = mgrObj.AddComponent<CityWorldRenderer>();
            LightingAtmosphereController lighting = mgrObj.AddComponent<LightingAtmosphereController>();
            RoadDrawingController drawer = mgrObj.AddComponent<RoadDrawingController>();

            roadBuilder.Assets = registry;
            worldRenderer.Assets = registry;
            lighting.Assets = registry;
            lighting.SunLight = sun;
            drawer.Bootstrap = bootstrap;
            drawer.MainCamera = cam;

            bootstrap.Assets = registry;
            bootstrap.TerrainBuilder = terrainBuilder;
            bootstrap.RoadBuilder = roadBuilder;
            bootstrap.WorldRenderer = worldRenderer;
            bootstrap.Lighting = lighting;
            bootstrap.Drawer = drawer;

            RenderSettings.skybox = registry.SkyboxMaterial;

            string scenePath = $"{ScenesDir}/MainCity.unity";
            EditorSceneManager.SaveScene(scene, scenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(scenePath, true) };
        }

        private static Material CreateOrLoadMat(string name, Shader shader, System.Action<Material> configure)
        {
            string path = $"{MaterialsDir}/{name}.mat";
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader) { name = name };
                configure?.Invoke(mat);
                AssetDatabase.CreateAsset(mat, path);
            }
            return mat;
        }

        private static void SetLit(Material m, Color col, float metallic, float smoothness)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", col);
            else m.color = col;
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
        }

        private static void EnsureFolder(string parent, string folder)
        {
            string full = Path.Combine(parent, folder);
            if (!AssetDatabase.IsValidFolder(full))
                AssetDatabase.CreateFolder(parent, folder);
        }
    }
}
#endif
