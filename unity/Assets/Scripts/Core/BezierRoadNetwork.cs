using System;
using System.Collections.Generic;

namespace Metroville.Core
{
    /// <summary>
    /// Cities: Skylines style continuous Cubic Bezier Spline Road Graph.
    /// Eliminates grid-stepped roads by representing every road segment as a smooth
    /// C1-continuous 3D Bezier curve with automatic node snapping, bridge clearance,
    /// lane offset sampling, and roadside zoning lot placement.
    /// </summary>
    public sealed class BezierRoadNetwork
    {
        private readonly Dictionary<int, RoadNode> _nodes = new Dictionary<int, RoadNode>();
        private readonly Dictionary<int, RoadSegment> _segments = new Dictionary<int, RoadSegment>();
        private int _nextNodeId = 1;
        private int _nextSegmentId = 1;

        public IReadOnlyDictionary<int, RoadNode> Nodes => _nodes;
        public IReadOnlyDictionary<int, RoadSegment> Segments => _segments;

        public void Clear()
        {
            _nodes.Clear();
            _segments.Clear();
            _nextNodeId = 1;
            _nextSegmentId = 1;
        }

        public RoadNode FindNearestNode(Vec3 worldPos, float snapRadiusMeters)
        {
            RoadNode best = null;
            float bestDistSq = snapRadiusMeters * snapRadiusMeters;
            foreach (RoadNode node in _nodes.Values)
            {
                float dx = node.Position.X - worldPos.X;
                float dz = node.Position.Z - worldPos.Z;
                float dSq = dx * dx + dz * dz;
                if (dSq <= bestDistSq)
                {
                    bestDistSq = dSq;
                    best = node;
                }
            }
            return best;
        }

        public RoadNode GetOrCreateNode(Vec3 position, float snapRadius = 8.0f, float elevationOffset = 0f, bool isHighwayConnection = false)
        {
            RoadNode existing = FindNearestNode(position, snapRadius);
            if (existing != null)
            {
                if (isHighwayConnection) existing.IsHighwayConnection = true;
                return existing;
            }

            var node = new RoadNode
            {
                Id = _nextNodeId++,
                Position = position,
                ElevationOffset = elevationOffset,
                IsHighwayConnection = isHighwayConnection
            };
            _nodes[node.Id] = node;
            return node;
        }

        /// <summary>
        /// Adds a straight or smoothly curved cubic Bezier road segment between two world coordinates.
        /// Pass curveMidpoint to bend the road smoothly (Cities: Skylines Curved Road Tool!).
        /// </summary>
        public RoadSegment AddSegment(
            Vec3 startPos,
            Vec3 endPos,
            RoadType type,
            Func<float, float, float> terrainHeightSampler,
            Vec3? curveMidpoint = null,
            float snapRadius = 8.0f)
        {
            RoadNode start = GetOrCreateNode(startPos, snapRadius);
            RoadNode end = GetOrCreateNode(endPos, snapRadius);
            if (start.Id == end.Id) return null;

            // Avoid duplicate parallel segment between identical nodes
            foreach (int segId in start.ConnectedSegmentIds)
            {
                if (_segments.TryGetValue(segId, out RoadSegment existing))
                {
                    if ((existing.StartNodeId == start.Id && existing.EndNodeId == end.Id) ||
                        (existing.StartNodeId == end.Id && existing.EndNodeId == start.Id))
                    {
                        existing.Type = type;
                        return existing;
                    }
                }
            }

            Vec3 p0 = start.Position;
            Vec3 p3 = end.Position;
            Vec3 p1;
            Vec3 p2;

            if (curveMidpoint.HasValue)
            {
                // Convert quadratic control midpoint M into exact equivalent cubic Bezier control points
                Vec3 m = curveMidpoint.Value;
                p1 = p0 + (m - p0) * (2f / 3f);
                p2 = p3 + (m - p3) * (2f / 3f);
            }
            else
            {
                p1 = Vec3.Lerp(p0, p3, 1f / 3f);
                p2 = Vec3.Lerp(p0, p3, 2f / 3f);
            }

            // Detect water crossings along the spline and smoothly arch the bridge deck!
            bool crossesWater = false;
            const int checkSamples = 12;
            for (int i = 1; i < checkSamples; i++)
            {
                float t = i / (float)checkSamples;
                Vec3 sp = EvaluateCubic(p0, p1, p2, p3, t);
                float groundY = terrainHeightSampler != null ? terrainHeightSampler(sp.X, sp.Z) : CityConstants.WaterLevelMeters + 2f;
                if (groundY < CityConstants.WaterLevelMeters + 0.6f)
                {
                    crossesWater = true;
                    break;
                }
            }

            if (crossesWater)
            {
                float deckPeakY = Math.Max(Math.Max(p0.Y, p3.Y), CityConstants.WaterLevelMeters) + CityConstants.BridgeClearanceMeters;
                p1.Y = Math.Max(p1.Y, deckPeakY);
                p2.Y = Math.Max(p2.Y, deckPeakY);
            }
            else if (terrainHeightSampler != null)
            {
                p1.Y = terrainHeightSampler(p1.X, p1.Z) + 0.15f;
                p2.Y = terrainHeightSampler(p2.X, p2.Z) + 0.15f;
            }

            var seg = new RoadSegment
            {
                Id = _nextSegmentId++,
                StartNodeId = start.Id,
                EndNodeId = end.Id,
                ControlPoint1 = p1,
                ControlPoint2 = p2,
                Type = type,
                IsBridge = crossesWater || start.ElevationOffset > 1f || end.ElevationOffset > 1f
            };
            seg.LengthMeters = EstimateArcLength(p0, p1, p2, p3, 20);

            _segments[seg.Id] = seg;
            start.ConnectedSegmentIds.Add(seg.Id);
            end.ConnectedSegmentIds.Add(seg.Id);
            return seg;
        }

        public bool RemoveSegment(int segmentId)
        {
            if (!_segments.TryGetValue(segmentId, out RoadSegment seg)) return false;
            _segments.Remove(segmentId);

            if (_nodes.TryGetValue(seg.StartNodeId, out RoadNode start))
            {
                start.ConnectedSegmentIds.Remove(segmentId);
                if (start.ConnectedSegmentIds.Count == 0 && !start.IsHighwayConnection)
                    _nodes.Remove(start.Id);
            }
            if (_nodes.TryGetValue(seg.EndNodeId, out RoadNode end))
            {
                end.ConnectedSegmentIds.Remove(segmentId);
                if (end.ConnectedSegmentIds.Count == 0 && !end.IsHighwayConnection)
                    _nodes.Remove(end.Id);
            }
            return true;
        }

        public Vec3 SamplePosition(RoadSegment seg, float t)
        {
            RoadNode a = _nodes[seg.StartNodeId];
            RoadNode b = _nodes[seg.EndNodeId];
            return EvaluateCubic(a.Position, seg.ControlPoint1, seg.ControlPoint2, b.Position, Clamp01(t));
        }

        public Vec3 SampleTangent(RoadSegment seg, float t)
        {
            RoadNode a = _nodes[seg.StartNodeId];
            RoadNode b = _nodes[seg.EndNodeId];
            return EvaluateCubicDerivative(a.Position, seg.ControlPoint1, seg.ControlPoint2, b.Position, Clamp01(t)).Normalized;
        }

        public Vec3 SampleRight(RoadSegment seg, float t)
        {
            Vec3 tan = SampleTangent(seg, t);
            // Cross(Up, Forward) = Right in Unity's left-handed Y-up coordinate system
            var right = new Vec3(tan.Z, 0f, -tan.X);
            return right.Normalized;
        }

        /// <summary>
        /// Samples right-hand driving lane position & forward direction for vehicles traveling on this spline.
        /// </summary>
        public void SampleLanePose(RoadSegment seg, float t, bool forward, out Vec3 worldPos, out Vec3 worldForward)
        {
            float evalT = forward ? Clamp01(t) : 1f - Clamp01(t);
            Vec3 center = SamplePosition(seg, evalT);
            Vec3 tan = SampleTangent(seg, evalT);
            Vec3 dir = forward ? tan : tan * -1f;
            Vec3 right = new Vec3(dir.Z, 0f, -dir.X).Normalized;

            RoadSpec spec = CityConstants.Roads[seg.Type];
            float laneOffset = spec.AsphaltWidth * 0.24f;
            worldPos = center + right * laneOffset + new Vec3(0f, 0.25f, 0f);
            worldForward = dir;
        }

        /// <summary>
        /// Generates roadside buildable parcel poses along both sides of a non-bridge, non-highway road segment.
        /// </summary>
        public List<(Vec3 position, float yawDegrees)> GenerateRoadsideLots(RoadSegment seg, float lotSpacingMeters = 22f)
        {
            var lots = new List<(Vec3, float)>();
            if (seg.IsBridge || seg.Type == RoadType.SixLaneHighway) return lots;

            RoadSpec spec = CityConstants.Roads[seg.Type];
            float lateralOffset = spec.TotalWidth * 0.5f + 11.5f;
            int steps = Math.Max(1, (int)Math.Floor((seg.LengthMeters - 16f) / lotSpacingMeters));
            if (steps <= 0) return lots;

            for (int i = 0; i < steps; i++)
            {
                float t = (i + 0.5f) / steps;
                // Keep clear of intersections at endpoints
                if (t < 0.12f || t > 0.88f) continue;

                Vec3 center = SamplePosition(seg, t);
                Vec3 tan = SampleTangent(seg, t);
                Vec3 right = new Vec3(tan.Z, 0f, -tan.X).Normalized;
                float baseYaw = (float)(Math.Atan2(tan.X, tan.Z) * (180.0 / Math.PI));

                lots.Add((center + right * lateralOffset, baseYaw - 90f));
                lots.Add((center - right * lateralOffset, baseYaw + 90f));
            }
            return lots;
        }

        public static Vec3 EvaluateCubic(Vec3 p0, Vec3 p1, Vec3 p2, Vec3 p3, float t)
        {
            float u = 1f - t;
            float tt = t * t;
            float uu = u * u;
            float uuu = uu * u;
            float ttt = tt * t;
            return (uuu * p0) + (3f * uu * t * p1) + (3f * u * tt * p2) + (ttt * p3);
        }

        public static Vec3 EvaluateCubicDerivative(Vec3 p0, Vec3 p1, Vec3 p2, Vec3 p3, float t)
        {
            float u = 1f - t;
            return 3f * u * u * (p1 - p0)
                 + 6f * u * t * (p2 - p1)
                 + 3f * t * t * (p3 - p2);
        }

        public static float EstimateArcLength(Vec3 p0, Vec3 p1, Vec3 p2, Vec3 p3, int samples = 20)
        {
            float len = 0f;
            Vec3 prev = p0;
            for (int i = 1; i <= samples; i++)
            {
                Vec3 cur = EvaluateCubic(p0, p1, p2, p3, i / (float)samples);
                len += Vec3.Distance(prev, cur);
                prev = cur;
            }
            return len;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
    }
}
