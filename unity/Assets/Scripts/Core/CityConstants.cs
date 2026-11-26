using System.Collections.Generic;

namespace Metroville.Core
{
    public sealed class RoadSpec
    {
        public RoadType Type;
        public string DisplayName;
        public float AsphaltWidth;
        public float SidewalkWidth;
        public float TotalWidth => AsphaltWidth + SidewalkWidth * 2f;
        public float SpeedLimitMps; // meters per second
        public float CapacityVehicles;
        public int CostPer10Meters;
        public int DailyUpkeepPer10Meters;
        public float NoiseOutput;
        public bool HasMedianTrees;
        public bool HasSidewalks;
    }

    public sealed class BuildingSpec
    {
        public BuildingType Type;
        public string DisplayName;
        public int BuildCost;
        public int DailyUpkeep;
        public float FootprintWidth;
        public float FootprintDepth;
        public float BaseHeight;
        public float LevelHeightStep;
        public int BaseResidents;
        public int BaseJobs;
        public float PowerDeltaMW; // + produces, - consumes
        public float WaterDeltaM3; // + produces, - consumes
        public float ServiceRadiusMeters;
        public float NoiseDelta;
        public float LandValueDelta;
    }

    public static class CityConstants
    {
        public const float WorldSizeMeters = 1024f;
        public const float WaterLevelMeters = 14.0f;
        public const float BridgeClearanceMeters = 11.0f;
        public const int MaxBuildingLevel = 5;

        public static readonly IReadOnlyDictionary<RoadType, RoadSpec> Roads =
            new Dictionary<RoadType, RoadSpec>
            {
                [RoadType.TwoLaneStreet] = new RoadSpec
                {
                    Type = RoadType.TwoLaneStreet,
                    DisplayName = "2차선 도시 도로",
                    AsphaltWidth = 8.0f,
                    SidewalkWidth = 3.2f,
                    SpeedLimitMps = 13.5f,
                    CapacityVehicles = 16f,
                    CostPer10Meters = 70,
                    DailyUpkeepPer10Meters = 2,
                    NoiseOutput = 4f,
                    HasMedianTrees = false,
                    HasSidewalks = true
                },
                [RoadType.FourLaneAvenue] = new RoadSpec
                {
                    Type = RoadType.FourLaneAvenue,
                    DisplayName = "4차선 가로수 대로",
                    AsphaltWidth = 15.0f,
                    SidewalkWidth = 4.0f,
                    SpeedLimitMps = 19.5f,
                    CapacityVehicles = 34f,
                    CostPer10Meters = 180,
                    DailyUpkeepPer10Meters = 5,
                    NoiseOutput = 8f,
                    HasMedianTrees = true,
                    HasSidewalks = true
                },
                [RoadType.SixLaneHighway] = new RoadSpec
                {
                    Type = RoadType.SixLaneHighway,
                    DisplayName = "6차선 고속도로",
                    AsphaltWidth = 21.0f,
                    SidewalkWidth = 1.5f,
                    SpeedLimitMps = 31.0f,
                    CapacityVehicles = 65f,
                    CostPer10Meters = 320,
                    DailyUpkeepPer10Meters = 9,
                    NoiseOutput = 18f,
                    HasMedianTrees = false,
                    HasSidewalks = false
                },
                [RoadType.Roundabout] = new RoadSpec
                {
                    Type = RoadType.Roundabout,
                    DisplayName = "회전교차로",
                    AsphaltWidth = 12.0f,
                    SidewalkWidth = 3.5f,
                    SpeedLimitMps = 15.0f,
                    CapacityVehicles = 40f,
                    CostPer10Meters = 260,
                    DailyUpkeepPer10Meters = 6,
                    NoiseOutput = 7f,
                    HasMedianTrees = true,
                    HasSidewalks = true
                }
            };

        public static readonly IReadOnlyDictionary<BuildingType, BuildingSpec> Buildings =
            new Dictionary<BuildingType, BuildingSpec>
            {
                [BuildingType.ResidentialLow] = new BuildingSpec
                {
                    Type = BuildingType.ResidentialLow,
                    DisplayName = "저밀도 주택",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 12f,
                    FootprintDepth = 12f,
                    BaseHeight = 7.5f,
                    LevelHeightStep = 2.2f,
                    BaseResidents = 16,
                    BaseJobs = 0,
                    PowerDeltaMW = -1.2f,
                    WaterDeltaM3 = -1.4f,
                    NoiseDelta = 1f,
                    LandValueDelta = 4f
                },
                [BuildingType.ResidentialHigh] = new BuildingSpec
                {
                    Type = BuildingType.ResidentialHigh,
                    DisplayName = "고밀도 주거 타워",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 18f,
                    FootprintDepth = 18f,
                    BaseHeight = 26f,
                    LevelHeightStep = 11f,
                    BaseResidents = 95,
                    BaseJobs = 4,
                    PowerDeltaMW = -4.5f,
                    WaterDeltaM3 = -5.2f,
                    NoiseDelta = 4f,
                    LandValueDelta = 8f
                },
                [BuildingType.CommercialLow] = new BuildingSpec
                {
                    Type = BuildingType.CommercialLow,
                    DisplayName = "근린 상가",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 14f,
                    FootprintDepth = 14f,
                    BaseHeight = 9f,
                    LevelHeightStep = 3.5f,
                    BaseResidents = 0,
                    BaseJobs = 22,
                    PowerDeltaMW = -2.0f,
                    WaterDeltaM3 = -1.8f,
                    NoiseDelta = 6f,
                    LandValueDelta = 5f
                },
                [BuildingType.CommercialHigh] = new BuildingSpec
                {
                    Type = BuildingType.CommercialHigh,
                    DisplayName = "고밀도 상업 마천루",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 20f,
                    FootprintDepth = 20f,
                    BaseHeight = 36f,
                    LevelHeightStep = 15f,
                    BaseResidents = 0,
                    BaseJobs = 120,
                    PowerDeltaMW = -6.5f,
                    WaterDeltaM3 = -4.5f,
                    NoiseDelta = 11f,
                    LandValueDelta = 12f
                },
                [BuildingType.OfficeTower] = new BuildingSpec
                {
                    Type = BuildingType.OfficeTower,
                    DisplayName = "IT·금융 오피스 타워",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 22f,
                    FootprintDepth = 22f,
                    BaseHeight = 44f,
                    LevelHeightStep = 18f,
                    BaseResidents = 0,
                    BaseJobs = 165,
                    PowerDeltaMW = -7.2f,
                    WaterDeltaM3 = -3.8f,
                    NoiseDelta = 3f,
                    LandValueDelta = 18f
                },
                [BuildingType.IndustrialFactory] = new BuildingSpec
                {
                    Type = BuildingType.IndustrialFactory,
                    DisplayName = "첨단 제조 산업단지",
                    BuildCost = 0,
                    DailyUpkeep = 0,
                    FootprintWidth = 22f,
                    FootprintDepth = 18f,
                    BaseHeight = 11f,
                    LevelHeightStep = 3.0f,
                    BaseResidents = 0,
                    BaseJobs = 75,
                    PowerDeltaMW = -6.0f,
                    WaterDeltaM3 = -4.8f,
                    NoiseDelta = 22f,
                    LandValueDelta = -16f
                },
                [BuildingType.PowerWind] = new BuildingSpec
                {
                    Type = BuildingType.PowerWind,
                    DisplayName = "풍력 발전기",
                    BuildCost = 3200,
                    DailyUpkeep = 45,
                    FootprintWidth = 10f,
                    FootprintDepth = 10f,
                    BaseHeight = 42f,
                    PowerDeltaMW = 85f,
                    NoiseDelta = 12f
                },
                [BuildingType.PowerSolar] = new BuildingSpec
                {
                    Type = BuildingType.PowerSolar,
                    DisplayName = "태양광 발전소",
                    BuildCost = 14000,
                    DailyUpkeep = 160,
                    FootprintWidth = 28f,
                    FootprintDepth = 24f,
                    BaseHeight = 8f,
                    PowerDeltaMW = 240f,
                    NoiseDelta = 2f
                },
                [BuildingType.WaterPump] = new BuildingSpec
                {
                    Type = BuildingType.WaterPump,
                    DisplayName = "취수 펌프장",
                    BuildCost = 4500,
                    DailyUpkeep = 65,
                    FootprintWidth = 14f,
                    FootprintDepth = 14f,
                    BaseHeight = 10f,
                    PowerDeltaMW = -10f,
                    WaterDeltaM3 = 320f,
                    NoiseDelta = 9f
                },
                [BuildingType.FireStation] = new BuildingSpec
                {
                    Type = BuildingType.FireStation,
                    DisplayName = "소방서",
                    BuildCost = 8500,
                    DailyUpkeep = 140,
                    FootprintWidth = 18f,
                    FootprintDepth = 16f,
                    BaseHeight = 12f,
                    PowerDeltaMW = -5f,
                    WaterDeltaM3 = -5f,
                    ServiceRadiusMeters = 190f,
                    LandValueDelta = 12f
                },
                [BuildingType.PoliceStation] = new BuildingSpec
                {
                    Type = BuildingType.PoliceStation,
                    DisplayName = "경찰서",
                    BuildCost = 9000,
                    DailyUpkeep = 150,
                    FootprintWidth = 18f,
                    FootprintDepth = 16f,
                    BaseHeight = 13f,
                    PowerDeltaMW = -5f,
                    WaterDeltaM3 = -4f,
                    ServiceRadiusMeters = 200f,
                    LandValueDelta = 14f
                },
                [BuildingType.Hospital] = new BuildingSpec
                {
                    Type = BuildingType.Hospital,
                    DisplayName = "종합병원",
                    BuildCost = 18000,
                    DailyUpkeep = 280,
                    FootprintWidth = 26f,
                    FootprintDepth = 22f,
                    BaseHeight = 24f,
                    PowerDeltaMW = -12f,
                    WaterDeltaM3 = -10f,
                    ServiceRadiusMeters = 240f,
                    LandValueDelta = 22f
                },
                [BuildingType.ElementarySchool] = new BuildingSpec
                {
                    Type = BuildingType.ElementarySchool,
                    DisplayName = "초등학교",
                    BuildCost = 11000,
                    DailyUpkeep = 160,
                    FootprintWidth = 22f,
                    FootprintDepth = 18f,
                    BaseHeight = 11f,
                    PowerDeltaMW = -6f,
                    WaterDeltaM3 = -6f,
                    ServiceRadiusMeters = 220f,
                    LandValueDelta = 16f
                },
                [BuildingType.University] = new BuildingSpec
                {
                    Type = BuildingType.University,
                    DisplayName = "국립 대학교",
                    BuildCost = 34000,
                    DailyUpkeep = 460,
                    FootprintWidth = 34f,
                    FootprintDepth = 28f,
                    BaseHeight = 20f,
                    PowerDeltaMW = -18f,
                    WaterDeltaM3 = -14f,
                    ServiceRadiusMeters = 420f,
                    LandValueDelta = 30f
                },
                [BuildingType.ParkPlaza] = new BuildingSpec
                {
                    Type = BuildingType.ParkPlaza,
                    DisplayName = "센트럴 시티 공원",
                    BuildCost = 4200,
                    DailyUpkeep = 40,
                    FootprintWidth = 22f,
                    FootprintDepth = 22f,
                    BaseHeight = 4f,
                    ServiceRadiusMeters = 150f,
                    NoiseDelta = -10f,
                    LandValueDelta = 28f
                },
                [BuildingType.LandmarkTower] = new BuildingSpec
                {
                    Type = BuildingType.LandmarkTower,
                    DisplayName = "메트로 스카이 랜드마크",
                    BuildCost = 65000,
                    DailyUpkeep = 520,
                    FootprintWidth = 28f,
                    FootprintDepth = 28f,
                    BaseHeight = 118f,
                    PowerDeltaMW = -20f,
                    WaterDeltaM3 = -12f,
                    ServiceRadiusMeters = 360f,
                    LandValueDelta = 45f
                }
            };
    }
}
