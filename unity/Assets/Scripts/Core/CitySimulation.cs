using System;
using System.Collections.Generic;

namespace Metroville.Core
{
    /// <summary>
    /// Full Cities: Skylines core city simulation engine in pure C#.
    /// Drives curved Bezier roads, 5-level RCI/Office buildings, industrial->commercial supply chain,
    /// 4-tier education & employment, utilities, traffic agents, and city budget.
    /// </summary>
    public sealed class CitySimulation
    {
        public readonly BezierRoadNetwork Roads = new BezierRoadNetwork();
        public readonly List<BuildingInstance> Buildings = new List<BuildingInstance>();
        public readonly List<VehicleAgent> Vehicles = new List<VehicleAgent>();
        public readonly CitySnapshot State = new CitySnapshot();

        private readonly Random _rng;
        private int _nextBuildingId = 1;
        private int _nextVehicleId = 1;
        private float _dayAccumulator;
        private float _simTickAccumulator;

        public event Action OnWorldChanged;

        public CitySimulation(int seed = 2026)
        {
            _rng = new Random(seed);
        }

        public void ResetAndBuildDemoMetropolis()
        {
            Roads.Clear();
            Buildings.Clear();
            Vehicles.Clear();
            _nextBuildingId = 1;
            _nextVehicleId = 1;
            State.CityName = "Neo Metropolia";
            State.Day = 120;
            State.TimeOfDayHours = 10.5f;
            State.Economy.Treasury = 245000;

            float H(float x, float z) => TerrainHeightfield.SampleHeight(x, z) + 0.15f;

            // 1. East-West Elevated Scenic Highway along the northern foothill corridor
            Vec3 hwWest = new Vec3(140f, H(140f, 700f), 700f);
            Vec3 hwMid1 = new Vec3(360f, H(360f, 715f), 715f);
            Vec3 hwMid2 = new Vec3(640f, H(640f, 710f), 710f);
            Vec3 hwEast = new Vec3(880f, H(880f, 690f), 690f);

            Roads.GetOrCreateNode(hwWest, 8f, 0f, true);
            Roads.GetOrCreateNode(hwEast, 8f, 0f, true);
            Roads.AddSegment(hwWest, hwMid1, RoadType.SixLaneHighway, TerrainHeightfield.SampleHeight, new Vec3(250f, H(250f, 725f), 725f));
            Roads.AddSegment(hwMid1, hwMid2, RoadType.SixLaneHighway, TerrainHeightfield.SampleHeight, new Vec3(500f, H(500f, 730f), 730f));
            Roads.AddSegment(hwMid2, hwEast, RoadType.SixLaneHighway, TerrainHeightfield.SampleHeight, new Vec3(760f, H(760f, 705f), 705f));

            // 2. Curved Sweeping West Riverfront Boulevard (Downtown Financial Core)
            Vec3 wNorth = new Vec3(360f, H(360f, 610f), 610f);
            Vec3 wMid = new Vec3(385f, H(385f, 470f), 470f);
            Vec3 wSouth = new Vec3(345f, H(345f, 320f), 320f);
            Vec3 wWest1 = new Vec3(245f, H(245f, 590f), 590f);
            Vec3 wWest2 = new Vec3(250f, H(250f, 465f), 465f);
            Vec3 wWest3 = new Vec3(235f, H(235f, 330f), 330f);

            // Connect highway interchange down to Downtown
            Roads.AddSegment(hwMid1, wNorth, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wNorth, wMid, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight, new Vec3(395f, H(395f, 540f), 540f));
            Roads.AddSegment(wMid, wSouth, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight, new Vec3(388f, H(388f, 395f), 395f));

            Roads.AddSegment(wWest1, wNorth, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wWest2, wMid, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wWest3, wSouth, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wWest1, wWest2, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight, new Vec3(232f, H(232f, 525f), 525f));
            Roads.AddSegment(wWest2, wWest3, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight, new Vec3(230f, H(230f, 398f), 398f));

            // 3. East Riverbank Curved Boulevard & Hillside Residential District
            Vec3 eNorth = new Vec3(640f, H(640f, 600f), 600f);
            Vec3 eMid = new Vec3(635f, H(635f, 465f), 465f);
            Vec3 eSouth = new Vec3(655f, H(655f, 325f), 325f);
            Vec3 eOut1 = new Vec3(765f, H(765f, 585f), 585f);
            Vec3 eOut2 = new Vec3(775f, H(775f, 455f), 455f);
            Vec3 eOut3 = new Vec3(760f, H(760f, 330f), 330f);

            Roads.AddSegment(hwMid2, eNorth, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(eNorth, eMid, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight, new Vec3(618f, H(618f, 535f), 535f));
            Roads.AddSegment(eMid, eSouth, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight, new Vec3(630f, H(630f, 395f), 395f));

            Roads.AddSegment(eNorth, eOut1, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(eMid, eOut2, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(eSouth, eOut3, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(eOut1, eOut2, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight, new Vec3(790f, H(790f, 520f), 520f));
            Roads.AddSegment(eOut2, eOut3, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight, new Vec3(785f, H(785f, 390f), 390f));

            // 4. Two Iconic Suspension Bridges arching smoothly across the winding river!
            Roads.AddSegment(wMid, eMid, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wSouth, eSouth, RoadType.FourLaneAvenue, TerrainHeightfield.SampleHeight);

            // 5. South-West Industrial Port Loop
            Vec3 ind1 = new Vec3(210f, H(210f, 230f), 230f);
            Vec3 ind2 = new Vec3(330f, H(330f, 220f), 220f);
            Roads.AddSegment(wWest3, ind1, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(wSouth, ind2, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);
            Roads.AddSegment(ind1, ind2, RoadType.TwoLaneStreet, TerrainHeightfield.SampleHeight);

            // 6. Populate Civic Landmarks & Utilities
            PlaceBuilding(BuildingType.LandmarkTower, new Vec3(315f, H(315f, 515f), 515f), 0f, 5, true);
            PlaceBuilding(BuildingType.University, new Vec3(705f, H(705f, 520f), 520f), 90f, 1, true);
            PlaceBuilding(BuildingType.Hospital, new Vec3(310f, H(310f, 410f), 410f), 0f, 1, true);
            PlaceBuilding(BuildingType.FireStation, new Vec3(295f, H(295f, 355f), 355f), 0f, 1, true);
            PlaceBuilding(BuildingType.PoliceStation, new Vec3(700f, H(700f, 400f), 400f), 180f, 1, true);
            PlaceBuilding(BuildingType.ElementarySchool, new Vec3(710f, H(710f, 360f), 360f), 90f, 1, true);
            PlaceBuilding(BuildingType.ParkPlaza, new Vec3(320f, H(320f, 465f), 465f), 0f, 1, true);
            PlaceBuilding(BuildingType.ParkPlaza, new Vec3(700f, H(700f, 460f), 460f), 0f, 1, true);
            PlaceBuilding(BuildingType.PowerSolar, new Vec3(175f, H(175f, 250f), 250f), 0f, 1, true);
            PlaceBuilding(BuildingType.PowerWind, new Vec3(195f, H(195f, 650f), 650f), 30f, 1, true);
            PlaceBuilding(BuildingType.PowerWind, new Vec3(235f, H(235f, 665f), 665f), 30f, 1, true);
            PlaceBuilding(BuildingType.WaterPump, new Vec3(445f, H(445f, 610f), 610f), 0f, 1, true);

            // 7. Auto-populate District Buildings aligned tangentially along every curved Bezier road!
            foreach (RoadSegment seg in Roads.Segments.Values)
            {
                var lots = Roads.GenerateRoadsideLots(seg, 24f);
                foreach (var (lotPos, yaw) in lots)
                {
                    if (TerrainHeightfield.IsWater(lotPos.X, lotPos.Z)) continue;
                    if (IsNearExistingBuilding(lotPos, 17.5f)) continue;

                    float groundY = TerrainHeightfield.SampleHeight(lotPos.X, lotPos.Z);
                    Vec3 pos = new Vec3(lotPos.X, groundY, lotPos.Z);

                    BuildingType bType;
                    ZoneType zType;
                    int lvl;

                    if (pos.Z < 290f && pos.X < 420f)
                    {
                        bType = BuildingType.IndustrialFactory;
                        zType = ZoneType.Industrial;
                        lvl = 1 + _rng.Next(0, 3);
                    }
                    else if (pos.X < 430f)
                    {
                        // West Downtown: Office & Commercial High-Rise Skyline + Residential Towers
                        double r = _rng.NextDouble();
                        if (r < 0.40) { bType = BuildingType.OfficeTower; zType = ZoneType.Office; lvl = 3 + _rng.Next(0, 3); }
                        else if (r < 0.78) { bType = BuildingType.CommercialHigh; zType = ZoneType.CommercialHigh; lvl = 2 + _rng.Next(0, 4); }
                        else { bType = BuildingType.ResidentialHigh; zType = ZoneType.ResidentialHigh; lvl = 2 + _rng.Next(0, 3); }
                    }
                    else
                    {
                        // East Riverbank: Lush Residential Towers + Hillside Homes + Neighborhood Shops
                        double r = _rng.NextDouble();
                        if (r < 0.45) { bType = BuildingType.ResidentialHigh; zType = ZoneType.ResidentialHigh; lvl = 2 + _rng.Next(0, 3); }
                        else if (r < 0.82) { bType = BuildingType.ResidentialLow; zType = ZoneType.ResidentialLow; lvl = 1 + _rng.Next(0, 3); }
                        else { bType = BuildingType.CommercialLow; zType = ZoneType.CommercialLow; lvl = 1 + _rng.Next(0, 3); }
                    }

                    var b = PlaceBuilding(bType, pos, yaw, lvl, true);
                    if (b != null) b.Zone = zType;
                }
            }

            // 8. Spawn active commuter & freight vehicles on the Bezier road network
            SpawnInitialTraffic(72);
            RunSimulationTick();
            OnWorldChanged?.Invoke();
        }

        public RoadSegment BuildRoad(Vec3 start, Vec3 end, RoadType type, Vec3? curveMidpoint = null)
        {
            RoadSpec spec = CityConstants.Roads[type];
            float estLen = Vec3.Distance(start, end);
            int cost = Math.Max(spec.CostPer10Meters, (int)(estLen / 10f * spec.CostPer10Meters));
            if (State.Economy.Treasury < cost) return null;

            RoadSegment seg = Roads.AddSegment(start, end, type, TerrainHeightfield.SampleHeight, curveMidpoint);
            if (seg == null) return null;

            State.Economy.Treasury -= cost;
            RunSimulationTick();
            OnWorldChanged?.Invoke();
            return seg;
        }

        public BuildingInstance PlaceBuilding(BuildingType type, Vec3 position, float yawDegrees, int level = 1, bool free = false)
        {
            if (!CityConstants.Buildings.TryGetValue(type, out BuildingSpec spec)) return null;
            if (!free && State.Economy.Treasury < spec.BuildCost) return null;
            if (!free) State.Economy.Treasury -= spec.BuildCost;

            int clampedLevel = Math.Max(1, Math.Min(CityConstants.MaxBuildingLevel, level));
            var b = new BuildingInstance
            {
                Id = _nextBuildingId++,
                Type = type,
                Position = position,
                YawDegrees = yawDegrees,
                Level = clampedLevel,
                StyleVariant = _rng.Next(0, 6),
                FootprintWidth = spec.FootprintWidth,
                FootprintDepth = spec.FootprintDepth,
                HeightMeters = spec.BaseHeight + (clampedLevel - 1) * spec.LevelHeightStep,
                Residents = (int)(spec.BaseResidents * (1f + (clampedLevel - 1) * 0.45f)),
                Jobs = (int)(spec.BaseJobs * (1f + (clampedLevel - 1) * 0.40f))
            };
            Buildings.Add(b);
            if (!free)
            {
                RunSimulationTick();
                OnWorldChanged?.Invoke();
            }
            return b;
        }

        public bool BulldozeAt(Vec3 worldPos, float radius = 14f)
        {
            for (int i = Buildings.Count - 1; i >= 0; i--)
            {
                if (Vec2.Distance(Buildings[i].Position.XZ, worldPos.XZ) <= radius)
                {
                    Buildings.RemoveAt(i);
                    RunSimulationTick();
                    OnWorldChanged?.Invoke();
                    return true;
                }
            }
            return false;
        }

        public BuildingInstance FindBuildingAt(Vec3 worldPos, float radius = 16f)
        {
            BuildingInstance best = null;
            float bestDist = radius;
            for (int i = 0; i < Buildings.Count; i++)
            {
                float d = Vec2.Distance(Buildings[i].Position.XZ, worldPos.XZ);
                if (d <= bestDist)
                {
                    bestDist = d;
                    best = Buildings[i];
                }
            }
            return best;
        }

        public bool BulldozeBuildingById(int buildingId)
        {
            for (int i = Buildings.Count - 1; i >= 0; i--)
            {
                if (Buildings[i].Id == buildingId)
                {
                    Buildings.RemoveAt(i);
                    RunSimulationTick();
                    OnWorldChanged?.Invoke();
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Advances continuous vehicle motion, day-night clock, and periodic economy/supply-chain ticks.
        /// </summary>
        public void StepFrame(float deltaSeconds, float speedMultiplier = 1f)
        {
            float dt = deltaSeconds * Math.Max(0f, speedMultiplier);
            if (dt <= 0f) return;

            State.TimeOfDayHours = (State.TimeOfDayHours + dt * 0.22f) % 24f;
            _dayAccumulator += dt;
            if (_dayAccumulator >= 12f)
            {
                _dayAccumulator -= 12f;
                State.Day++;
                State.Economy.Treasury += State.Economy.DailyNetBalance;
            }

            UpdateVehicles(dt);

            _simTickAccumulator += dt;
            if (_simTickAccumulator >= 2.0f)
            {
                _simTickAccumulator -= 2.0f;
                RunSimulationTick();
            }
        }

        public void RunSimulationTick()
        {
            int pop = 0;
            int jobs = 0;
            float powerProd = 0f;
            float powerUse = 0f;
            float waterProd = 0f;
            float waterUse = 0f;
            float indGoods = 0f;
            float comDemand = 0f;
            int resTaxBase = 0;
            int comTaxBase = 0;
            int indTaxBase = 0;
            int upkeep = 0;
            int schools = 0;
            int universities = 0;
            int hospitals = 0;
            int parks = 0;

            foreach (BuildingInstance b in Buildings)
            {
                if (!CityConstants.Buildings.TryGetValue(b.Type, out BuildingSpec spec)) continue;
                pop += b.Residents;
                jobs += b.Jobs;
                upkeep += spec.DailyUpkeep;

                if (spec.PowerDeltaMW > 0f) powerProd += spec.PowerDeltaMW;
                else powerUse += -spec.PowerDeltaMW;

                if (spec.WaterDeltaM3 > 0f) waterProd += spec.WaterDeltaM3;
                else waterUse += -spec.WaterDeltaM3;

                if (b.Type == BuildingType.IndustrialFactory)
                {
                    indGoods += 14f * b.Level;
                    indTaxBase += b.Jobs * 12;
                }
                else if (b.Type == BuildingType.CommercialLow || b.Type == BuildingType.CommercialHigh)
                {
                    comDemand += 11f * b.Level;
                    comTaxBase += b.Jobs * 15;
                }
                else if (b.Type == BuildingType.OfficeTower)
                {
                    comTaxBase += b.Jobs * 19;
                }
                else if (b.Type == BuildingType.ResidentialLow || b.Type == BuildingType.ResidentialHigh)
                {
                    resTaxBase += b.Residents * 10;
                }
                else if (b.Type == BuildingType.ElementarySchool) schools++;
                else if (b.Type == BuildingType.University) universities++;
                else if (b.Type == BuildingType.Hospital) hospitals++;
                else if (b.Type == BuildingType.ParkPlaza || b.Type == BuildingType.LandmarkTower) parks++;
            }

            foreach (RoadSegment seg in Roads.Segments.Values)
            {
                RoadSpec rs = CityConstants.Roads[seg.Type];
                upkeep += Math.Max(1, (int)(seg.LengthMeters / 10f * rs.DailyUpkeepPer10Meters));
            }

            // 1. Supply Chain: Domestic Industry -> Commercial + Highway Import/Export
            State.SupplyChain.DomesticGoodsProduced = indGoods;
            State.SupplyChain.CommercialGoodsDemand = comDemand;
            float netGoods = indGoods - comDemand;
            State.SupplyChain.HighwayGoodsExported = netGoods > 0f ? netGoods : 0f;
            State.SupplyChain.HighwayGoodsImported = netGoods < 0f ? -netGoods * 0.85f : 0f;
            State.SupplyChain.FulfillmentRatio = comDemand <= 0.1f
                ? 1f
                : Math.Min(1f, (indGoods + State.SupplyChain.HighwayGoodsImported) / comDemand);

            // 2. 4-Tier Citizen Education & Employment
            float eduBoost = Math.Min(1f, schools * 0.28f + universities * 0.45f);
            State.Education.HighlyEducatedPct = 0.08f + eduBoost * 0.26f;
            State.Education.WellEducatedPct = 0.18f + eduBoost * 0.24f;
            State.Education.EducatedPct = 0.34f - eduBoost * 0.12f;
            State.Education.UneducatedPct = Math.Max(0.04f, 1f - (State.Education.HighlyEducatedPct + State.Education.WellEducatedPct + State.Education.EducatedPct));

            int workforce = (int)(pop * 0.62f);
            int employed = Math.Min(workforce, jobs);
            State.Population = pop;
            State.TotalJobs = jobs;
            State.EmployedCitizens = employed;
            State.UnemploymentRate = workforce > 0 ? Math.Max(0f, (workforce - employed) / (float)workforce) : 0f;

            // 3. Utilities & Economy
            State.PowerProducedMW = powerProd;
            State.PowerDemandMW = powerUse;
            State.WaterProducedM3 = waterProd;
            State.WaterDemandM3 = waterUse;

            bool powerOk = powerProd >= powerUse * 0.92f;
            bool waterOk = waterProd >= waterUse * 0.92f;
            foreach (BuildingInstance b in Buildings)
            {
                b.HasPower = powerOk;
                b.HasWater = waterOk;
                b.HasGoods = State.SupplyChain.FulfillmentRatio > 0.72f;
            }

            int taxIncome =
                (int)(resTaxBase * State.Economy.TaxRateResidential * 2.4f) +
                (int)(comTaxBase * State.Economy.TaxRateCommercial * 2.5f) +
                (int)(indTaxBase * State.Economy.TaxRateIndustrial * 2.2f);
            State.Economy.DailyTaxIncome = taxIncome;
            State.Economy.DailyUpkeepCost = upkeep;
            State.Economy.DailyNetBalance = taxIncome - upkeep;

            // 4. Traffic Flow Aggregation
            float totalFlow = 0f;
            int segCount = 0;
            foreach (RoadSegment seg in Roads.Segments.Values)
            {
                RoadSpec rs = CityConstants.Roads[seg.Type];
                seg.CongestionRatio = seg.TrafficVolume / Math.Max(1f, rs.CapacityVehicles);
                totalFlow += Math.Max(0.25f, 1f - seg.CongestionRatio * 0.55f);
                segCount++;
            }
            State.TrafficFlow = segCount > 0 ? totalFlow / segCount : 1f;

            // 5. Happiness & RCI Demand
            float serviceBonus = Math.Min(0.18f, hospitals * 0.05f + parks * 0.04f + eduBoost * 0.09f);
            float penalty = (powerOk ? 0f : 0.22f) + (waterOk ? 0f : 0.22f) + State.UnemploymentRate * 0.35f;
            State.Happiness = Math.Max(0.15f, Math.Min(0.99f, 0.76f + serviceBonus - penalty));

            State.DemandResidential = Clamp01(0.45f + (jobs > workforce ? 0.35f : -0.15f) + (State.Happiness - 0.65f));
            State.DemandCommercial = Clamp01(0.40f + (pop / 6000f) * 0.25f - (comDemand > indGoods * 1.4f ? 0.15f : 0f));
            State.DemandIndustrial = Clamp01(0.35f + (comDemand > indGoods ? 0.40f : 0.05f) + State.UnemploymentRate);
        }

        private void SpawnInitialTraffic(int count)
        {
            if (Roads.Nodes.Count < 2) return;
            var nodeIds = new List<int>(Roads.Nodes.Keys);

            for (int i = 0; i < count; i++)
            {
                int a = nodeIds[_rng.Next(nodeIds.Count)];
                int b = nodeIds[_rng.Next(nodeIds.Count)];
                if (a == b) continue;

                RouteResult route = RoadPathfinder.FindRoute(Roads, a, b);
                if (!route.Found || route.SegmentIds.Count == 0) continue;

                var v = new VehicleAgent
                {
                    Id = _nextVehicleId++,
                    Kind = (VehicleKind)_rng.Next(0, 6),
                    ColorIndex = _rng.Next(0, 8),
                    T = (float)_rng.NextDouble()
                };
                AssignRouteToVehicle(v, route);
                Vehicles.Add(v);
            }
        }

        private void AssignRouteToVehicle(VehicleAgent v, RouteResult route)
        {
            v.PathNodeIds.Clear();
            v.PathSegmentIds.Clear();
            v.PathNodeIds.AddRange(route.NodeIds);
            v.PathSegmentIds.AddRange(route.SegmentIds);
            v.PathIndex = 0;
            if (v.PathSegmentIds.Count > 0)
            {
                v.CurrentSegmentId = v.PathSegmentIds[0];
                RoadSegment seg = Roads.Segments[v.CurrentSegmentId];
                v.ForwardOnSegment = seg.StartNodeId == v.PathNodeIds[0];
            }
        }

        private void UpdateVehicles(float dt)
        {
            foreach (RoadSegment seg in Roads.Segments.Values)
                seg.TrafficVolume = 0f;

            var nodeIds = new List<int>(Roads.Nodes.Keys);
            foreach (VehicleAgent v in Vehicles)
            {
                if (!Roads.Segments.TryGetValue(v.CurrentSegmentId, out RoadSegment seg))
                    continue;

                seg.TrafficVolume += 1f;
                RoadSpec spec = CityConstants.Roads[seg.Type];
                float congestionSlowdown = Math.Max(0.28f, 1f - seg.CongestionRatio * 0.45f);
                v.SpeedMps = spec.SpeedLimitMps * congestionSlowdown;
                v.T += (v.SpeedMps * dt) / Math.Max(4f, seg.LengthMeters);

                if (v.T >= 1f)
                {
                    v.T = 0f;
                    v.PathIndex++;
                    if (v.PathIndex >= v.PathSegmentIds.Count)
                    {
                        // Pick a fresh destination from current node
                        int currentNode = v.PathNodeIds.Count > 0 ? v.PathNodeIds[v.PathNodeIds.Count - 1] : nodeIds[0];
                        int targetNode = nodeIds[_rng.Next(nodeIds.Count)];
                        RouteResult nextRoute = RoadPathfinder.FindRoute(Roads, currentNode, targetNode);
                        if (nextRoute.Found && nextRoute.SegmentIds.Count > 0)
                        {
                            AssignRouteToVehicle(v, nextRoute);
                            seg = Roads.Segments[v.CurrentSegmentId];
                        }
                        else
                        {
                            v.PathIndex = 0;
                            v.ForwardOnSegment = !v.ForwardOnSegment;
                        }
                    }
                    else
                    {
                        v.CurrentSegmentId = v.PathSegmentIds[v.PathIndex];
                        seg = Roads.Segments[v.CurrentSegmentId];
                        v.ForwardOnSegment = seg.StartNodeId == v.PathNodeIds[v.PathIndex];
                    }
                }

                Roads.SampleLanePose(seg, v.T, v.ForwardOnSegment, out v.WorldPosition, out v.WorldForward);
            }
        }

        private bool IsNearExistingBuilding(Vec3 pos, float minDistance)
        {
            float dSq = minDistance * minDistance;
            for (int i = 0; i < Buildings.Count; i++)
            {
                float dx = Buildings[i].Position.X - pos.X;
                float dz = Buildings[i].Position.Z - pos.Z;
                if (dx * dx + dz * dz < dSq) return true;
            }
            return false;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
    }
}
