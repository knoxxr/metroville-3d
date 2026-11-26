using System;

namespace Metroville.Core
{
    /// <summary>
    /// Deterministic natural temperate river-valley & alpine mountain heightfield shared
    /// identically between Unity's native Terrain engine and the pure C# simulation.
    /// World coordinates range from [0, 1024] meters in X and Z; WaterLevel = 14.0m.
    /// </summary>
    public static class TerrainHeightfield
    {
        public static float SampleHeight(float worldX, float worldZ)
        {
            float nx = worldX / CityConstants.WorldSizeMeters;
            float nz = worldZ / CityConstants.WorldSizeMeters;

            // 1. Broad gentle rolling temperate plain (base ~20m, well above 14m water level)
            float basePlain = 20.5f
                + (float)Math.Sin(worldX * 0.0085f + 0.4f) * 2.4f
                + (float)Math.Cos(worldZ * 0.0092f - 0.3f) * 2.1f
                + (float)Math.Sin((worldX + worldZ) * 0.017f) * 1.1f;

            // 2. Surrounding scenic alpine mountains on North, West, and East edges
            float edgeDistNorth = Clamp01((nz - 0.72f) / 0.28f);
            float edgeDistWest = Clamp01((0.18f - nx) / 0.18f);
            float edgeDistEast = Clamp01((nx - 0.84f) / 0.16f);
            float mountainMask = Math.Max(edgeDistNorth, Math.Max(edgeDistWest * 0.85f, edgeDistEast * 0.85f));
            float mountainMaskSmooth = mountainMask * mountainMask * (3f - 2f * mountainMask);

            float ridgeNoise =
                (float)Math.Abs(Math.Sin(worldX * 0.014f + Math.Cos(worldZ * 0.012f) * 1.4f)) * 42f
                + (float)Math.Abs(Math.Cos(worldZ * 0.019f - worldX * 0.009f)) * 24f
                + (float)Math.Sin(worldX * 0.045f + worldZ * 0.038f) * 6.5f;

            float mountains = mountainMaskSmooth * (18f + ridgeNoise);

            // 3. Sweeping S-curve navigable river winding from North-West to South bay
            float riverCenterX = RiverCenterX(worldZ);
            float riverHalfWidth = 36f + Clamp01((260f - worldZ) / 260f) * 48f; // widens toward south bay
            float distToRiver = Math.Abs(worldX - riverCenterX);

            float height = basePlain + mountains;

            // Smooth river channel carve down to ~6.2m (8m deep water below 14.0m sea level)
            float bankT = Clamp01((distToRiver - riverHalfWidth * 0.65f) / (riverHalfWidth * 0.85f));
            float bankSmooth = bankT * bankT * (3f - 2f * bankT);
            float riverBedY = 6.2f + (float)Math.Sin(worldZ * 0.04f) * 0.6f;
            height = riverBedY + (height - riverBedY) * bankSmooth;

            // 4. South ocean coastline opening gently below Z < 115m
            if (worldZ < 135f)
            {
                float coastT = Clamp01((worldZ - 40f) / 95f);
                float coastSmooth = coastT * coastT * (3f - 2f * coastT);
                height = 5.5f + (height - 5.5f) * coastSmooth;
            }

            return Math.Max(3.0f, height);
        }

        public static float RiverCenterX(float worldZ)
        {
            return 512f
                + (float)Math.Sin((worldZ - 160f) * 0.0065f) * 64f
                + (float)Math.Cos(worldZ * 0.013f) * 18f;
        }

        public static bool IsWater(float worldX, float worldZ)
        {
            return SampleHeight(worldX, worldZ) < CityConstants.WaterLevelMeters - 0.15f;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
    }
}
