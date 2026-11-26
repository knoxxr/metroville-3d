using System;
using System.Collections.Generic;

namespace Metroville.Core
{
    public sealed class RouteResult
    {
        public bool Found;
        public readonly List<int> NodeIds = new List<int>();
        public readonly List<int> SegmentIds = new List<int>();
        public float EstimatedTravelSeconds;
    }

    /// <summary>
    /// Cities: Skylines speed-limit & congestion-weighted A* pathfinder operating
    /// directly on the continuous BezierRoadNetwork graph.
    /// </summary>
    public static class RoadPathfinder
    {
        public static RouteResult FindRoute(BezierRoadNetwork network, int startNodeId, int goalNodeId)
        {
            var result = new RouteResult();
            if (startNodeId == goalNodeId ||
                !network.Nodes.ContainsKey(startNodeId) ||
                !network.Nodes.ContainsKey(goalNodeId))
            {
                return result;
            }

            RoadNode goalNode = network.Nodes[goalNodeId];
            var openSet = new List<int> { startNodeId };
            var inOpen = new HashSet<int> { startNodeId };
            var closed = new HashSet<int>();
            var cameFromNode = new Dictionary<int, int>();
            var cameFromSeg = new Dictionary<int, int>();
            var gScore = new Dictionary<int, float> { [startNodeId] = 0f };
            var fScore = new Dictionary<int, float> { [startNodeId] = Heuristic(network.Nodes[startNodeId], goalNode) };

            while (openSet.Count > 0)
            {
                // Pop lowest fScore node
                int bestIdx = 0;
                int currentId = openSet[0];
                float bestF = fScore[currentId];
                for (int i = 1; i < openSet.Count; i++)
                {
                    int candidate = openSet[i];
                    float cf = fScore[candidate];
                    if (cf < bestF)
                    {
                        bestF = cf;
                        currentId = candidate;
                        bestIdx = i;
                    }
                }

                if (currentId == goalNodeId)
                {
                    Reconstruct(startNodeId, goalNodeId, cameFromNode, cameFromSeg, result);
                    result.EstimatedTravelSeconds = gScore[goalNodeId];
                    result.Found = true;
                    return result;
                }

                openSet.RemoveAt(bestIdx);
                inOpen.Remove(currentId);
                closed.Add(currentId);

                RoadNode current = network.Nodes[currentId];
                foreach (int segId in current.ConnectedSegmentIds)
                {
                    if (!network.Segments.TryGetValue(segId, out RoadSegment seg)) continue;
                    int neighborId = seg.StartNodeId == currentId ? seg.EndNodeId : seg.StartNodeId;
                    if (closed.Contains(neighborId)) continue;

                    RoadSpec spec = CityConstants.Roads[seg.Type];
                    float congestionPenalty = 1f + Math.Max(0f, seg.CongestionRatio) * 1.45f;
                    float travelSeconds = (seg.LengthMeters / Math.Max(4f, spec.SpeedLimitMps)) * congestionPenalty;
                    float tentativeG = gScore[currentId] + travelSeconds;

                    if (!gScore.TryGetValue(neighborId, out float existingG) || tentativeG < existingG)
                    {
                        cameFromNode[neighborId] = currentId;
                        cameFromSeg[neighborId] = segId;
                        gScore[neighborId] = tentativeG;
                        fScore[neighborId] = tentativeG + Heuristic(network.Nodes[neighborId], goalNode);
                        if (!inOpen.Contains(neighborId))
                        {
                            openSet.Add(neighborId);
                            inOpen.Add(neighborId);
                        }
                    }
                }
            }

            return result;
        }

        private static float Heuristic(RoadNode a, RoadNode b)
        {
            // Admissible lower bound using max highway speed (31 m/s)
            return Vec3.Distance(a.Position, b.Position) / 31.0f;
        }

        private static void Reconstruct(
            int startId,
            int goalId,
            Dictionary<int, int> cameFromNode,
            Dictionary<int, int> cameFromSeg,
            RouteResult result)
        {
            int cur = goalId;
            result.NodeIds.Add(cur);
            while (cur != startId && cameFromNode.ContainsKey(cur))
            {
                result.SegmentIds.Add(cameFromSeg[cur]);
                cur = cameFromNode[cur];
                result.NodeIds.Add(cur);
            }
            result.NodeIds.Reverse();
            result.SegmentIds.Reverse();
        }
    }
}
