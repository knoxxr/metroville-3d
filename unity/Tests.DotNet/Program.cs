using System;
using System.Linq;
using Metroville.Core;

namespace Metroville.Core.Tests
{
    internal static class Program
    {
        private static void Assert(bool condition, string message)
        {
            if (!condition) throw new Exception("ASSERTION FAILED: " + message);
            Console.WriteLine("  [PASS] " + message);
        }

        public static int Main()
        {
            Console.WriteLine("=== Metroville Unity Core C# 9.0 Verification Suite ===");

            // 1. Terrain Heightfield sanity (river is submerged, mountains rise high)
            float riverX = TerrainHeightfield.RiverCenterX(460f);
            float riverY = TerrainHeightfield.SampleHeight(riverX, 460f);
            float downtownY = TerrainHeightfield.SampleHeight(320f, 470f);
            float mountainY = TerrainHeightfield.SampleHeight(240f, 990f);
            Assert(riverY < CityConstants.WaterLevelMeters, $"River channel submerged ({riverY:F1}m < {CityConstants.WaterLevelMeters}m at X={riverX:F0})");
            Assert(downtownY > CityConstants.WaterLevelMeters + 2f, $"Downtown plain above water ({downtownY:F1}m)");
            Assert(mountainY > 40f, $"Northern alpine ridge rises ({mountainY:F1}m)");

            // 2. Demo Metropolis builds curved Bezier roads, bridges, buildings & vehicles
            var sim = new CitySimulation(2026);
            sim.ResetAndBuildDemoMetropolis();
            int bridgeCount = sim.Roads.Segments.Values.Count(s => s.IsBridge);
            Assert(sim.Roads.Nodes.Count >= 18, $"Bezier road nodes created ({sim.Roads.Nodes.Count})");
            Assert(sim.Roads.Segments.Count >= 20, $"Bezier road segments created ({sim.Roads.Segments.Count})");
            Assert(bridgeCount >= 2, $"Suspension bridges auto-detected over river ({bridgeCount})");
            Assert(sim.Buildings.Count >= 40, $"Roadside & civic buildings populated ({sim.Buildings.Count})");
            Assert(sim.Vehicles.Count >= 40, $"Live traffic agents spawned ({sim.Vehicles.Count})");
            Assert(sim.State.Population > 500, $"City population active ({sim.State.Population})");
            Assert(sim.State.TotalJobs > 500, $"City jobs active ({sim.State.TotalJobs})");
            Assert(sim.State.SupplyChain.FulfillmentRatio > 0.75f, $"Supply chain healthy ({sim.State.SupplyChain.FulfillmentRatio:P0})");

            // 3. Curved Bezier road placement & A* routing
            var start = new Vec3(385f, TerrainHeightfield.SampleHeight(385f, 470f), 470f);
            var end = new Vec3(635f, TerrainHeightfield.SampleHeight(635f, 465f), 465f);
            RoadNode nA = sim.Roads.FindNearestNode(start, 20f);
            RoadNode nB = sim.Roads.FindNearestNode(end, 20f);
            RouteResult route = RoadPathfinder.FindRoute(sim.Roads, nA.Id, nB.Id);
            Assert(route.Found && route.SegmentIds.Count >= 1, $"A* cross-river route found ({route.SegmentIds.Count} segs, {route.EstimatedTravelSeconds:F1}s)");

            // 4. Simulation stepping (60 frames of continuous Bezier vehicle movement + daily economy tick)
            Vec3 initialCarPos = sim.Vehicles[0].WorldPosition;
            for (int i = 0; i < 60; i++)
                sim.StepFrame(0.25f, 1.0f);
            float moved = Vec3.Distance(initialCarPos, sim.Vehicles[0].WorldPosition);
            Assert(moved > 1.0f, $"Vehicles smoothly traverse Bezier splines ({moved:F1}m moved)");
            Assert(sim.State.Day > 120, $"Simulation day counter advanced (Day {sim.State.Day})");

            // 5. Building Inspector pick, Historical Lock & BulldozeById
            BuildingInstance firstB = sim.Buildings[0];
            BuildingInstance picked = sim.FindBuildingAt(firstB.Position, 18f);
            Assert(picked != null && picked.Id == firstB.Id, $"Building Inspector picks building #{firstB.Id} cleanly");
            picked.HistoricalLocked = true;
            Assert(picked.HistoricalLocked, "Historical building lock toggled cleanly");
            int prevCount = sim.Buildings.Count;
            bool deleted = sim.BulldozeBuildingById(picked.Id);
            Assert(deleted && sim.Buildings.Count == prevCount - 1, $"BulldozeBuildingById removed building #{picked.Id}");

            Console.WriteLine("ALL CORE SIMULATION TESTS PASSED!");
            return 0;
        }
    }
}
