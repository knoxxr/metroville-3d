using Metroville.Core;
using UnityEngine;

namespace Metroville.Runtime
{
    /// <summary>
    /// Controls Cities: Skylines Temperate Daylight, Golden Hour Sunset, and Night lighting.
    /// Synchronizes Directional Sun (4-cascade CSM), Atmospheric Skybox, Water Shader, Fog,
    /// and Building Interior Night Illumination.
    /// </summary>
    public sealed class LightingAtmosphereController : MonoBehaviour
    {
        public Light SunLight;
        public CityAssetRegistry Assets;
        public LightingMode Mode = LightingMode.Day;

        private static readonly int NightFactorId = Shader.PropertyToID("_NightFactor");
        private static readonly int ZenithColorId = Shader.PropertyToID("_ZenithColor");
        private static readonly int HorizonColorId = Shader.PropertyToID("_HorizonColor");
        private static readonly int SkyReflectId = Shader.PropertyToID("_SkyReflectColor");

        public void ApplyLighting(float timeOfDayHours)
        {
            float sunElevationDeg;
            float sunAzimuthDeg = 42f;
            if (Mode == LightingMode.Day)
            {
                sunElevationDeg = 48f;
            }
            else if (Mode == LightingMode.Sunset)
            {
                sunElevationDeg = 11.5f;
                sunAzimuthDeg = 252f;
            }
            else if (Mode == LightingMode.Night)
            {
                sunElevationDeg = -18f;
                sunAzimuthDeg = 290f;
            }
            else
            {
                float phase = ((timeOfDayHours - 6f) / 24f) * Mathf.PI * 2f;
                sunElevationDeg = Mathf.Sin(phase) * 56f;
                sunAzimuthDeg = (timeOfDayHours / 24f) * 360f;
            }

            float night = Mathf.Clamp01((-sunElevationDeg + 8f) / 22f);
            float sunset = Mathf.Clamp01(1f - Mathf.Abs(sunElevationDeg - 11f) / 14f);

            if (SunLight != null)
            {
                SunLight.transform.rotation = Quaternion.Euler(Mathf.Max(6f, sunElevationDeg), sunAzimuthDeg, 0f);
                Color daySun = new Color(1.00f, 0.97f, 0.91f);
                Color sunsetSun = new Color(1.00f, 0.58f, 0.30f);
                Color moonSun = new Color(0.35f, 0.50f, 0.78f);

                Color c = Color.Lerp(daySun, sunsetSun, sunset);
                SunLight.color = Color.Lerp(c, moonSun, night);
                SunLight.intensity = Mathf.Lerp(Mathf.Lerp(1.65f, 1.35f, sunset), 0.32f, night);
                SunLight.shadowStrength = Mathf.Lerp(0.76f, 0.42f, night);
            }

            Color zenithDay = new Color(0.20f, 0.48f, 0.80f);
            Color zenithSunset = new Color(0.18f, 0.24f, 0.44f);
            Color zenithNight = new Color(0.02f, 0.04f, 0.11f);
            Color zenith = Color.Lerp(Color.Lerp(zenithDay, zenithSunset, sunset), zenithNight, night);

            Color horDay = new Color(0.83f, 0.91f, 0.98f);
            Color horSunset = new Color(0.95f, 0.59f, 0.38f);
            Color horNight = new Color(0.06f, 0.11f, 0.21f);
            Color horizon = Color.Lerp(Color.Lerp(horDay, horSunset, sunset), horNight, night);

            // Luminous sky-blue ambient shadow fill (Cities: Skylines Temperate look)
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Color.Lerp(new Color(0.62f, 0.78f, 0.96f), new Color(0.10f, 0.16f, 0.28f), night);
            RenderSettings.ambientEquatorColor = Color.Lerp(horizon * 0.82f, new Color(0.08f, 0.12f, 0.20f), night);
            RenderSettings.ambientGroundColor = Color.Lerp(new Color(0.38f, 0.45f, 0.34f), new Color(0.05f, 0.07f, 0.10f), night);

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = horizon;
            RenderSettings.fogDensity = Mathf.Lerp(0.00072f, 0.00055f, night);

            if (Assets != null)
            {
                if (Assets.SkyboxMaterial != null)
                {
                    RenderSettings.skybox = Assets.SkyboxMaterial;
                    Assets.SkyboxMaterial.SetColor(ZenithColorId, zenith);
                    Assets.SkyboxMaterial.SetColor(HorizonColorId, horizon);
                    Assets.SkyboxMaterial.SetFloat(NightFactorId, night);
                }
                if (Assets.WaterMaterial != null)
                    Assets.WaterMaterial.SetColor(SkyReflectId, horizon);

                float buildingGlow = Mathf.Clamp01(night * 1.15f + sunset * 0.42f);
                if (Assets.GlassTowerBlueMaterial != null) Assets.GlassTowerBlueMaterial.SetFloat(NightFactorId, buildingGlow);
                if (Assets.GlassTowerGoldMaterial != null) Assets.GlassTowerGoldMaterial.SetFloat(NightFactorId, buildingGlow);
                if (Assets.ModernStoneMaterial != null) Assets.ModernStoneMaterial.SetFloat(NightFactorId, buildingGlow);
                if (Assets.TerracottaMaterial != null) Assets.TerracottaMaterial.SetFloat(NightFactorId, buildingGlow);
            }
        }
    }
}
