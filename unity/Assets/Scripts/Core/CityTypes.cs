using System;
using System.Collections.Generic;

namespace Metroville.Core
{
    [Serializable]
    public struct Vec2
    {
        public float X;
        public float Y;

        public Vec2(float x, float y)
        {
            X = x;
            Y = y;
        }

        public float Magnitude => (float)Math.Sqrt(X * X + Y * Y);
        public float SqrMagnitude => X * X + Y * Y;

        public Vec2 Normalized
        {
            get
            {
                float m = Magnitude;
                return m > 1e-5f ? new Vec2(X / m, Y / m) : new Vec2(0f, 0f);
            }
        }

        public static float Distance(Vec2 a, Vec2 b)
        {
            float dx = a.X - b.X;
            float dy = a.Y - b.Y;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        public static float Dot(Vec2 a, Vec2 b) => a.X * b.X + a.Y * b.Y;

        public static Vec2 Lerp(Vec2 a, Vec2 b, float t) =>
            new Vec2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.X + b.X, a.Y + b.Y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.X - b.X, a.Y - b.Y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.X * s, a.Y * s);
        public static Vec2 operator *(float s, Vec2 a) => new Vec2(a.X * s, a.Y * s);
    }

    [Serializable]
    public struct Vec3
    {
        public float X;
        public float Y;
        public float Z;

        public Vec3(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public Vec2 XZ => new Vec2(X, Z);

        public float Magnitude => (float)Math.Sqrt(X * X + Y * Y + Z * Z);

        public Vec3 Normalized
        {
            get
            {
                float m = Magnitude;
                return m > 1e-5f ? new Vec3(X / m, Y / m, Z / m) : new Vec3(0f, 0f, 1f);
            }
        }

        public static Vec3 Lerp(Vec3 a, Vec3 b, float t) =>
            new Vec3(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t);

        public static float Distance(Vec3 a, Vec3 b)
        {
            float dx = a.X - b.X;
            float dy = a.Y - b.Y;
            float dz = a.Z - b.Z;
            return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }

        public static Vec3 operator +(Vec3 a, Vec3 b) => new Vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Vec3 operator -(Vec3 a, Vec3 b) => new Vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Vec3 operator *(Vec3 a, float s) => new Vec3(a.X * s, a.Y * s, a.Z * s);
        public static Vec3 operator *(float s, Vec3 a) => new Vec3(a.X * s, a.Y * s, a.Z * s);
    }

    public enum RoadType
    {
        TwoLaneStreet = 0,
        FourLaneAvenue = 1,
        SixLaneHighway = 2,
        Roundabout = 3
    }

    public enum ZoneType
    {
        None = 0,
        ResidentialLow = 1,
        ResidentialHigh = 2,
        CommercialLow = 3,
        CommercialHigh = 4,
        Office = 5,
        Industrial = 6
    }

    public enum BuildingType
    {
        None = 0,
        ResidentialLow = 1,
        ResidentialHigh = 2,
        CommercialLow = 3,
        CommercialHigh = 4,
        OfficeTower = 5,
        IndustrialFactory = 6,
        PowerWind = 10,
        PowerSolar = 11,
        PowerNuclear = 12,
        WaterPump = 20,
        SewageTreatment = 21,
        FireStation = 30,
        PoliceStation = 31,
        Hospital = 32,
        ElementarySchool = 33,
        University = 34,
        ParkPlaza = 40,
        LandmarkTower = 41
    }

    public enum InfoViewId
    {
        None = 0,
        Traffic = 1,
        Power = 2,
        Water = 3,
        LandValue = 4,
        Noise = 5,
        Education = 6,
        Services = 7
    }

    public enum LightingMode
    {
        Day = 0,
        Sunset = 1,
        Night = 2,
        AutoCycle = 3
    }

    public enum ToolMode
    {
        Inspect = 0,
        RoadStraight = 1,
        RoadCurved = 2,
        ZoneBrush = 3,
        PlaceBuilding = 4,
        Bulldoze = 5
    }

    public enum VehicleKind
    {
        Sedan = 0,
        Suv = 1,
        Taxi = 2,
        DeliveryTruck = 3,
        CargoSemi = 4,
        CityBus = 5,
        Emergency = 6
    }

    [Serializable]
    public sealed class RoadNode
    {
        public int Id;
        public Vec3 Position;
        public float ElevationOffset; // > 0.5m renders as elevated viaduct / bridge deck
        public bool IsHighwayConnection;
        public readonly List<int> ConnectedSegmentIds = new List<int>();
    }

    [Serializable]
    public sealed class RoadSegment
    {
        public int Id;
        public int StartNodeId;
        public int EndNodeId;
        public Vec3 ControlPoint1;
        public Vec3 ControlPoint2;
        public RoadType Type;
        public float LengthMeters;
        public bool IsBridge;
        public float TrafficVolume;
        public float CongestionRatio; // 0.0 (free flow) -> 1.5+ (gridlock)
    }

    [Serializable]
    public sealed class BuildingInstance
    {
        public int Id;
        public BuildingType Type;
        public ZoneType Zone;
        public Vec3 Position;
        public float YawDegrees;
        public int Level = 1; // 1..5 (Cities: Skylines progression)
        public bool HistoricalLocked;
        public int Residents;
        public int Jobs;
        public int StyleVariant;
        public float FootprintWidth = 14f;
        public float FootprintDepth = 14f;
        public float HeightMeters = 12f;
        public bool HasPower = true;
        public bool HasWater = true;
        public bool HasGoods = true;
        public float LandValue = 55f;
        public float NoiseLevel;
        public float UpgradeProgress;
    }

    [Serializable]
    public sealed class VehicleAgent
    {
        public int Id;
        public VehicleKind Kind;
        public int CurrentSegmentId;
        public int PathIndex;
        public readonly List<int> PathNodeIds = new List<int>();
        public readonly List<int> PathSegmentIds = new List<int>();
        public bool ForwardOnSegment = true;
        public float T; // 0..1 along current Bezier segment
        public float SpeedMps = 12f;
        public int ColorIndex;
        public Vec3 WorldPosition;
        public Vec3 WorldForward;
    }

    [Serializable]
    public sealed class EducationDistribution
    {
        public float UneducatedPct = 0.25f;
        public float EducatedPct = 0.35f;
        public float WellEducatedPct = 0.28f;
        public float HighlyEducatedPct = 0.12f;
    }

    [Serializable]
    public sealed class SupplyChainMetrics
    {
        public float DomesticGoodsProduced;
        public float CommercialGoodsDemand;
        public float HighwayGoodsImported;
        public float HighwayGoodsExported;
        public float FulfillmentRatio = 1f;
    }

    [Serializable]
    public sealed class CityEconomy
    {
        public long Treasury = 180000;
        public float TaxRateResidential = 0.09f;
        public float TaxRateCommercial = 0.09f;
        public float TaxRateIndustrial = 0.09f;
        public int DailyTaxIncome;
        public int DailyUpkeepCost;
        public int DailyNetBalance;
    }

    [Serializable]
    public sealed class CitySnapshot
    {
        public string CityName = "Neo Metropolia";
        public int Day = 1;
        public float TimeOfDayHours = 10.5f; // 0..24
        public int Population;
        public int TotalJobs;
        public int EmployedCitizens;
        public float UnemploymentRate;
        public float Happiness = 0.84f;
        public float TrafficFlow = 0.88f;
        public float PowerProducedMW;
        public float PowerDemandMW;
        public float WaterProducedM3;
        public float WaterDemandM3;
        public float DemandResidential = 0.65f;
        public float DemandCommercial = 0.55f;
        public float DemandIndustrial = 0.50f;
        public EducationDistribution Education = new EducationDistribution();
        public SupplyChainMetrics SupplyChain = new SupplyChainMetrics();
        public CityEconomy Economy = new CityEconomy();
    }
}
