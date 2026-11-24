import * as THREE from 'three';
import { GRID, inBounds, isRoadType } from '../sim/constants';
import type { CityState, InfoViewId } from '../sim/types';
import { sampleNaturalElevation } from './architecture';

export const BRIDGE_DECK_Y = 0.24;
export const ROAD_SURFACE_OFFSET = 0.032;

export type RoadSurfaceKey = 'road' | 'ave' | 'hwy' | 'corner' | 'cross' | 'roundabout';

export interface CityElevationField {
  V: number;
  /** Graded terrain vertex heights (V x V) */
  terrainV: Float32Array;
  /** Continuous shared road corner vertex heights (V x V) */
  roadV: Float32Array;
  /** Per-tile graded ground center elevation (GRID x GRID) */
  tileGroundY: Float32Array;
  /** Per-tile smooth road center elevation (GRID x GRID) */
  roadCenterY: Float32Array;
  /** True if tile is a road on water or an elevated bridge approach ramp */
  isElevatedRoad: Uint8Array;
  /** Bilinear sample of the exact continuous road surface at world (wx, wz) */
  sampleRoadY: (wx: number, wz: number) => number;
  /** Bilinear sample of the graded terrain height at world (wx, wz) */
  sampleTerrainY: (wx: number, wz: number) => number;
}

export interface ConformingRoadMeshes {
  surfaces: Record<RoadSurfaceKey, THREE.BufferGeometry | null>;
  curbsGeo: THREE.BufferGeometry | null;
  railsGeo: THREE.BufferGeometry | null;
}

/**
 * Computes a continuous, step-free heightfield for both terrain and roads:
 * 1. Smoothly grades connected road networks using constrained Laplacian smoothing
 *    with water bridges pinned at BRIDGE_DECK_Y (generating silky-smooth bridge
 *    approach ramps and hill grades with zero stair-stepping!).
 * 2. Shares exact 3D corner vertex heights across all adjacent road tiles so
 *    connected roads, corners, intersections, and bridges have 0.000m vertical seams.
 * 3. Grades terrain vertices cleanly beneath land roads so grass never pokes through
 *    asphalt and roadbeds never float.
 */
export function computeCityElevationField(state: CityState): CityElevationField {
  const V = GRID + 1;
  const g = state.grid;
  const rawTileY = new Float32Array(GRID * GRID);
  const roadTileY = new Float32Array(GRID * GRID);
  const isRoad = new Uint8Array(GRID * GRID);
  const isWater = new Uint8Array(GRID * GRID);
  const isElevatedRoad = new Uint8Array(GRID * GRID);

  // 1. Sample raw natural elevation and identify roads / bridges
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const t = g[y][x];
      const water = t.terrain === 'water';
      const sand = t.terrain === 'sand';
      const nat = sampleNaturalElevation(x, y, t.elev, water, sand);
      rawTileY[idx] = nat;
      if (water) isWater[idx] = 1;
      if (isRoadType(t.building?.type)) {
        isRoad[idx] = 1;
        // Bridges sit at BRIDGE_DECK_Y; land roads start cleanly above coastal sand/water
        roadTileY[idx] = water ? BRIDGE_DECK_Y : Math.max(0.035, nat + ROAD_SURFACE_OFFSET);
      }
    }
  }

  // 2. Identify distance to bridges along connected road graph (for approach ramps)
  const bridgeDist = new Int16Array(GRID * GRID).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < GRID * GRID; i++) {
    if (isRoad[i] && isWater[i]) {
      bridgeDist[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = bridgeDist[cur];
    if (d >= 3) continue;
    const cx = cur % GRID;
    const cy = (cur / GRID) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const nIdx = ny * GRID + nx;
      if (isRoad[nIdx] && bridgeDist[nIdx] > d + 1) {
        bridgeDist[nIdx] = d + 1;
        queue.push(nIdx);
      }
    }
  }

  // Give bridge approach tiles (dist 1..2) an initial ramp lift before Laplacian relaxation
  for (let i = 0; i < GRID * GRID; i++) {
    if (!isRoad[i] || isWater[i]) continue;
    const baseLand = Math.max(0.035, rawTileY[i] + ROAD_SURFACE_OFFSET);
    if (bridgeDist[i] === 1) {
      roadTileY[i] = baseLand + (BRIDGE_DECK_Y - baseLand) * 0.56;
      isElevatedRoad[i] = 1;
    } else if (bridgeDist[i] === 2) {
      roadTileY[i] = baseLand + (BRIDGE_DECK_Y - baseLand) * 0.22;
    }
  }
  for (let i = 0; i < GRID * GRID; i++) {
    if (isRoad[i] && isWater[i]) isElevatedRoad[i] = 1;
  }

  // 3. Constrained Laplacian smoothing along connected road tiles for silky grades
  const nextRoadY = new Float32Array(roadTileY);
  for (let iter = 0; iter < 4; iter++) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const idx = y * GRID + x;
        if (!isRoad[idx]) continue;
        if (isWater[idx]) {
          nextRoadY[idx] = BRIDGE_DECK_Y;
          continue;
        }
        let sum = 0;
        let cnt = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const nIdx = ny * GRID + nx;
          if (isRoad[nIdx]) {
            sum += roadTileY[nIdx];
            cnt++;
          }
        }
        const baseLand = Math.max(0.035, rawTileY[idx] + ROAD_SURFACE_OFFSET);
        if (cnt > 0) {
          const avgN = sum / cnt;
          // Approaches relax freely between bridge and land; regular roads follow terrain smoothly
          const anchorW = bridgeDist[idx] <= 2 ? 0.14 : 0.28;
          nextRoadY[idx] = Math.max(0.03, baseLand * anchorW + avgN * (1 - anchorW));
        } else {
          nextRoadY[idx] = baseLand;
        }
      }
    }
    roadTileY.set(nextRoadY);
  }

  // 4. Compute exact shared road corner vertices roadV (V x V)
  //    Only adjacent road tiles contribute to a road vertex so bridges stay level across width
  //    and connected road tiles always share identical corner heights!
  const roadV = new Float32Array(V * V);
  const roadVCount = new Uint8Array(V * V);
  const roadVHasLand = new Uint8Array(V * V);
  const roadVHasWater = new Uint8Array(V * V);

  for (let vy = 0; vy < V; vy++) {
    for (let vx = 0; vx < V; vx++) {
      let rSum = 0;
      let rCnt = 0;
      let hasLandR = 0;
      let hasWaterR = 0;
      for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx + ox;
        const ty = vy + oy;
        if (!inBounds(tx, ty)) continue;
        const tIdx = ty * GRID + tx;
        if (isRoad[tIdx]) {
          rSum += roadTileY[tIdx];
          rCnt++;
          if (isWater[tIdx]) hasWaterR = 1;
          else hasLandR = 1;
        }
      }
      const vi = vy * V + vx;
      if (rCnt > 0) {
        roadV[vi] = rSum / rCnt;
        roadVCount[vi] = rCnt;
        roadVHasLand[vi] = hasLandR;
        roadVHasWater[vi] = hasWaterR;
      }
    }
  }

  // 5. Compute graded terrain vertices terrainV (V x V) that conform cleanly under land roads!
  const terrainV = new Float32Array(V * V);
  for (let vy = 0; vy < V; vy++) {
    for (let vx = 0; vx < V; vx++) {
      let sumY = 0;
      let cnt = 0;
      let touchesWaterTile = false;
      for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx + ox;
        const ty = vy + oy;
        if (!inBounds(tx, ty)) continue;
        const tIdx = ty * GRID + tx;
        sumY += rawTileY[tIdx];
        if (isWater[tIdx]) touchesWaterTile = true;
        cnt++;
      }
      const vi = vy * V + vx;
      let tyVal = cnt ? sumY / cnt : 0;

      // Grade earth right beneath land roads (not water bridge piers) so terrain hugs asphalt cleanly
      if (roadVCount[vi] > 0 && roadVHasLand[vi] && !touchesWaterTile) {
        tyVal = roadV[vi] - ROAD_SURFACE_OFFSET;
      } else if (roadVCount[vi] > 0 && roadVHasLand[vi] && touchesWaterTile && !roadVHasWater[vi]) {
        // Coastal land road corner next to water: keep terrain slightly below roadbed
        tyVal = Math.min(tyVal, roadV[vi] - ROAD_SURFACE_OFFSET);
      }
      terrainV[vi] = tyVal;
    }
  }

  // 6. Compute per-tile center heights from vertex corners so buildings/vehicles match exact mesh
  const tileGroundY = new Float32Array(GRID * GRID);
  const roadCenterY = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i00 = y * V + x;
      const i10 = i00 + 1;
      const i01 = (y + 1) * V + x;
      const i11 = i01 + 1;
      const tIdx = y * GRID + x;
      tileGroundY[tIdx] = (terrainV[i00] + terrainV[i10] + terrainV[i01] + terrainV[i11]) * 0.25;
      if (isRoad[tIdx]) {
        roadCenterY[tIdx] = (roadV[i00] + roadV[i10] + roadV[i01] + roadV[i11]) * 0.25;
      } else {
        roadCenterY[tIdx] = tileGroundY[tIdx];
      }
    }
  }

  const sampleBilinear = (verts: Float32Array, wx: number, wz: number): number => {
    const gx = Math.max(0, Math.min(GRID - 0.001, wx + GRID / 2));
    const gz = Math.max(0, Math.min(GRID - 0.001, wz + GRID / 2));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const h00 = verts[z0 * V + x0];
    const h10 = verts[z0 * V + x0 + 1];
    const h01 = verts[(z0 + 1) * V + x0];
    const h11 = verts[(z0 + 1) * V + x0 + 1];
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  };

  return {
    V,
    terrainV,
    roadV,
    tileGroundY,
    roadCenterY,
    isElevatedRoad,
    sampleRoadY: (wx, wz) => {
      const gx = Math.floor(wx + GRID / 2);
      const gz = Math.floor(wz + GRID / 2);
      if (inBounds(gx, gz) && isRoad[gz * GRID + gx]) {
        return sampleBilinear(roadV, wx, wz);
      }
      return sampleBilinear(terrainV, wx, wz) + ROAD_SURFACE_OFFSET;
    },
    sampleTerrainY: (wx, wz) => sampleBilinear(terrainV, wx, wz),
  };
}

interface GeomAccumulator {
  pos: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

function makeAcc(): GeomAccumulator {
  return { pos: [], uv: [], col: [], idx: [] };
}

function finalizeGeo(acc: GeomAccumulator): THREE.BufferGeometry | null {
  if (acc.idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  geo.setIndex(acc.idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds continuous, slope-conforming road surface meshes (grouped by road texture)
 * PLUS seamless sloped concrete roadbed skirts, retaining walls, and bridge guardrails!
 */
export function buildConformingRoadMeshes(
  state: CityState,
  activeView: InfoViewId,
  elev: CityElevationField
): ConformingRoadMeshes {
  const g = state.grid;
  const V = elev.V;
  const isR = (x: number, y: number) => inBounds(x, y) && isRoadType(g[y][x].building?.type);

  const accs: Record<RoadSurfaceKey, GeomAccumulator> = {
    road: makeAcc(),
    ave: makeAcc(),
    hwy: makeAcc(),
    corner: makeAcc(),
    cross: makeAcc(),
    roundabout: makeAcc(),
  };
  const curbAcc = makeAcc();
  const railAcc = makeAcc();
  const tmpCol = new THREE.Color();

  const pushSurfaceQuad = (
    acc: GeomAccumulator,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    hNW: number,
    hNE: number,
    hSE: number,
    hSW: number,
    rot: number,
    tintHex: number
  ) => {
    const base = acc.pos.length / 3;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    tmpCol.setHex(tintHex);

    // Corner local offsets from tile center: NW, NE, SE, SW
    const corners: [number, number, number, number, number][] = [
      [x0, hNW, z0, -0.5, -0.5],
      [x1, hNE, z0, 0.5, -0.5],
      [x1, hSE, z1, 0.5, 0.5],
      [x0, hSW, z1, -0.5, 0.5],
    ];
    for (const [px, py, pz, dx, dz] of corners) {
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      acc.pos.push(px, py, pz);
      acc.uv.push(lx + 0.5, 0.5 - lz);
      acc.col.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
    // Counter-clockwise upward-facing winding in right-handed Three.js (NW -> SW -> NE, NE -> SW -> SE)
    acc.idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
  };

  // Emit a 2-sided vertical or sloped concrete skirt/wall quad between (ax, az) and (bx, bz)
  const pushWallQuad = (
    acc: GeomAccumulator,
    ax: number,
    ayTop: number,
    ayBot: number,
    az: number,
    bx: number,
    byTop: number,
    byBot: number,
    bz: number,
    topColHex: number,
    botColHex: number
  ) => {
    const base = acc.pos.length / 3;
    const cTop = new THREE.Color(topColHex);
    const cBot = new THREE.Color(botColHex);
    acc.pos.push(
      ax, ayTop, az,
      bx, byTop, bz,
      bx, byBot, bz,
      ax, ayBot, az
    );
    acc.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    acc.col.push(
      cTop.r, cTop.g, cTop.b,
      cTop.r, cTop.g, cTop.b,
      cBot.r, cBot.g, cBot.b,
      cBot.r, cBot.g, cBot.b
    );
    acc.idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
  };

  // Emit a crisp sloped 3D guardrail beam (top + inner + outer faces) along an elevated road edge
  const pushSlopedRail = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    nx: number,
    nz: number
  ) => {
    const halfW = 0.028;
    const hBot = 0.0;
    const hTop = 0.088;
    // Outer & inner face
    pushWallQuad(
      railAcc,
      ax + nx * halfW, ay + hTop, ay + hBot, az + nz * halfW,
      bx + nx * halfW, by + hTop, by + hBot, bz + nz * halfW,
      0xe2e8f0,
      0x94a3b8
    );
    pushWallQuad(
      railAcc,
      bx - nx * halfW, by + hTop, by + hBot, bz - nz * halfW,
      ax - nx * halfW, ay + hTop, ay + hBot, az - nz * halfW,
      0xd8dee6,
      0x8c96a4
    );
    // Top cap
    const base = railAcc.pos.length / 3;
    const c = new THREE.Color(0xeef2f6);
    railAcc.pos.push(
      ax - nx * halfW, ay + hTop, az - nz * halfW,
      ax + nx * halfW, ay + hTop, az + nz * halfW,
      bx + nx * halfW, by + hTop, bz + nz * halfW,
      bx - nx * halfW, by + hTop, bz - nz * halfW
    );
    railAcc.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) railAcc.col.push(c.r, c.g, c.b);
    railAcc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const b = t.building;
      if (!b || !isRoadType(b.type)) continue;

      const bt = b.type;
      const isBridge = t.terrain === 'water';
      const isElevated = elev.isElevatedRoad[y * GRID + x] === 1;
      const nN = isR(x, y - 1);
      const nS = isR(x, y + 1);
      const nW = isR(x - 1, y);
      const nE = isR(x + 1, y);
      const deg = (nN ? 1 : 0) + (nS ? 1 : 0) + (nW ? 1 : 0) + (nE ? 1 : 0);

      const x0 = x - GRID / 2;
      const x1 = x0 + 1;
      const z0 = y - GRID / 2;
      const z1 = z0 + 1;

      const iNW = y * V + x;
      const iNE = iNW + 1;
      const iSW = (y + 1) * V + x;
      const iSE = iSW + 1;

      const hNW = elev.roadV[iNW];
      const hNE = elev.roadV[iNE];
      const hSE = elev.roadV[iSE];
      const hSW = elev.roadV[iSW];

      const roadTint =
        activeView === 'traffic'
          ? t.congestion > 1.2
            ? 0xf87171
            : t.congestion > 0.7
              ? 0xfbbf24
              : 0x4ade80
          : 0xffffff;

      let key: RoadSurfaceKey = 'road';
      let rot = 0;
      if (bt === 'roundabout') {
        key = 'roundabout';
      } else if (deg >= 3) {
        key = 'cross';
      } else if (deg === 2 && ((nN && nE) || (nE && nS) || (nS && nW) || (nW && nN))) {
        key = 'corner';
        if (nE && nS) rot = 0;
        else if (nS && nW) rot = -Math.PI / 2;
        else if (nW && nN) rot = Math.PI;
        else if (nN && nE) rot = Math.PI / 2;
      } else {
        const horiz = (nE || nW) && !(nN || nS);
        rot = horiz ? Math.PI / 2 : 0;
        key = bt === 'highway' ? 'hwy' : bt === 'avenue' ? 'ave' : 'road';
      }

      pushSurfaceQuad(accs[key], x0, z0, x1, z1, hNW, hNE, hSE, hSW, rot, roadTint);

      // Sloped concrete roadbed skirt / retaining wall along every exposed non-road edge
      // Ensures ZERO floating asphalt edges on slopes, curves, and bridge approaches!
      const skirtDrop = isBridge ? 0.14 : isElevated ? 0.34 : 0.12;
      const wallTopCol = isBridge ? 0x9aa4b0 : 0xaab2bc;
      const wallBotCol = isBridge ? 0x56606d : 0x5c646e;

      // North edge (outward normal = 0, -1): NE -> NW so outward face points -Z
      if (!nN) {
        pushWallQuad(curbAcc, x1, hNE, hNE - skirtDrop, z0, x0, hNW, hNW - skirtDrop, z0, wallTopCol, wallBotCol);
        if (isElevated) pushSlopedRail(x1, hNE, z0 + 0.03, x0, hNW, z0 + 0.03, 0, -1);
      }
      // South edge (outward normal = 0, +1): SW -> SE so outward face points +Z
      if (!nS) {
        pushWallQuad(curbAcc, x0, hSW, hSW - skirtDrop, z1, x1, hSE, hSE - skirtDrop, z1, wallTopCol, wallBotCol);
        if (isElevated) pushSlopedRail(x0, hSW, z1 - 0.03, x1, hSE, z1 - 0.03, 0, 1);
      }
      // West edge (outward normal = -1, 0): NW -> SW so outward face points -X
      if (!nW) {
        pushWallQuad(curbAcc, x0, hNW, hNW - skirtDrop, z0, x0, hSW, hSW - skirtDrop, z1, wallTopCol, wallBotCol);
        if (isElevated) pushSlopedRail(x0 + 0.03, hNW, z0, x0 + 0.03, hSW, z1, -1, 0);
      }
      // East edge (outward normal = +1, 0): SE -> NE so outward face points +X
      if (!nE) {
        pushWallQuad(curbAcc, x1, hSE, hSE - skirtDrop, z1, x1, hNE, hNE - skirtDrop, z0, wallTopCol, wallBotCol);
        if (isElevated) pushSlopedRail(x1 - 0.03, hSE, z1, x1 - 0.03, hNE, z0, 1, 0);
      }

      // Bridge underside soffit deck (conforms seamlessly to exact bridge slope!)
      if (isBridge) {
        const base = curbAcc.pos.length / 3;
        const cBot = new THREE.Color(0x4b5563);
        curbAcc.pos.push(
          x0, hNW - 0.14, z0,
          x1, hNE - 0.14, z0,
          x1, hSE - 0.14, z1,
          x0, hSW - 0.14, z1
        );
        curbAcc.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
        for (let k = 0; k < 4; k++) curbAcc.col.push(cBot.r, cBot.g, cBot.b);
        // Downward-facing underside
        curbAcc.idx.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
      }
    }
  }

  return {
    surfaces: {
      road: finalizeGeo(accs.road),
      ave: finalizeGeo(accs.ave),
      hwy: finalizeGeo(accs.hwy),
      corner: finalizeGeo(accs.corner),
      cross: finalizeGeo(accs.cross),
      roundabout: finalizeGeo(accs.roundabout),
    },
    curbsGeo: finalizeGeo(curbAcc),
    railsGeo: finalizeGeo(railAcc),
  };
}
