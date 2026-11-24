import {
  CITY_EVENTS,
  DIRS,
  DIRS8,
  DISTRICT_SPEC_MAP,
  GRID,
  MILESTONES,
  PIPE_OFFSETS,
  POLICIES,
  QUESTS,
  TOOL_MAP,
  ZONE_SPECS,
  inBounds,
  isRoadType,
  playSound,
  sectorIdx,
} from './constants';
import type { CityState, EmergencyVehicle, RouteInfo, Vehicle } from './types';

// Zero-allocation reusable BFS arrays
const bfsVis = new Int32Array(GRID * GRID);
const bfsPar = new Int32Array(GRID * GRID);
const bfsQ = new Int32Array(GRID * GRID);
let bfsGen = 1;

export interface SimRuntime {
  vehicles: Vehicle[];
  emergencyVehicles: EmergencyVehicle[];
  activeRoutes: RouteInfo[];
  metroStations: [number, number][];
  animTime: number;
  onChunkDirty: (gx: number, gy: number) => void;
  onToast: (title: string, desc: string, kind: 'success' | 'warn' | 'error' | 'info') => void;
  onMilestoneOrQuest: () => void;
}

export function getAdjRoad(state: CityState, x: number, y: number, allowHighway = false): [number, number] | null {
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const bt = state.grid[ny][nx].building?.type;
    if (isRoadType(bt) && (allowHighway || bt !== 'highway')) return [nx, ny];
  }
  return null;
}

export function findRoadPath(state: CityState, sx: number, sy: number, ex: number, ey: number): [number, number][] | null {
  if (sx === ex && sy === ey) return [[sx, sy]];
  const g = state.grid;
  bfsGen++;
  if (bfsGen > 2000000000) {
    bfsVis.fill(0);
    bfsGen = 1;
  }
  const startIdx = sy * GRID + sx;
  const endIdx = ey * GRID + ex;
  bfsVis[startIdx] = bfsGen;
  bfsPar[startIdx] = -1;
  let head = 0;
  let tail = 0;
  bfsQ[tail++] = startIdx;

  while (head < tail) {
    const cur = bfsQ[head++];
    if (cur === endIdx) {
      const path: [number, number][] = [];
      let p = cur;
      while (p !== -1) {
        path.push([p % GRID, (p / GRID) | 0]);
        p = bfsPar[p];
      }
      path.reverse();
      return path;
    }
    const cx = cur % GRID;
    const cy = (cur / GRID) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      const ni = ny * GRID + nx;
      if (bfsVis[ni] === bfsGen) continue;
      if (!isRoadType(g[ny][nx].building?.type)) continue;
      bfsVis[ni] = bfsGen;
      bfsPar[ni] = cur;
      bfsQ[tail++] = ni;
    }
  }
  return null;
}

function spreadRoadService(
  state: CityState,
  sources: { x: number; y: number; val: number }[],
  maxDist: number,
  field: 'fireCov' | 'policeCov' | 'healthCov' | 'eduCov' | 'garbageCov',
  mult = 1
) {
  const g = state.grid;
  const dist = new Int16Array(GRID * GRID).fill(999);
  const qx: number[] = [];
  const qy: number[] = [];
  const qv: number[] = [];

  for (const s of sources) {
    const r = getAdjRoad(state, s.x, s.y, true);
    if (!r) continue;
    const ri = r[1] * GRID + r[0];
    dist[ri] = 0;
    qx.push(r[0]);
    qy.push(r[1]);
    qv.push(s.val * mult);
  }

  for (let h = 0; h < qx.length; h++) {
    const cx = qx[h];
    const cy = qy[h];
    const baseV = qv[h];
    const cd = dist[cy * GRID + cx];
    const cov = Math.max(0, Math.round(baseV * (1 - cd / (maxDist + 1))));

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (inBounds(nx, ny) && cov > g[ny][nx][field]) {
          g[ny][nx][field] = cov;
        }
      }
    }
    if (cd >= maxDist) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny) || !isRoadType(g[ny][nx].building?.type)) continue;
      const ni = ny * GRID + nx;
      if (cd + 1 < dist[ni]) {
        dist[ni] = cd + 1;
        qx.push(nx);
        qy.push(ny);
        qv.push(baseV);
      }
    }
  }
}

export function runCitySimulation(state: CityState, rt: SimRuntime) {
  const g = state.grid;
  const utilMult = state.budgets.util / 100;
  const svcMult = state.budgets.svc / 100;

  // Aggregate active event buffs
  let evPowerMult = 1;
  let evTaxMult = 1;
  let evHappyBonus = 0;
  let evTrafficBonus = 0;
  for (const b of state.activeBuffs) {
    if (b.powerMult) evPowerMult *= b.powerMult;
    if (b.taxMult) evTaxMult *= b.taxMult;
    if (b.happyBonus) evHappyBonus += b.happyBonus;
    if (b.trafficBonus) evTrafficBonus += b.trafficBonus;
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const spec = state.sectorSpecs[sectorIdx(x, y)] || 'general';
      t.hasRoad = !!getAdjRoad(state, x, y, false);
      t.powerBlob = false;
      t.powered = false;
      t.powerIsland = 0;
      t.hasWater = false;
      t.waterPolluted = false;
      t.hasSewage = false;
      t.waterPollution = 0;
      t.fireCov = 0;
      t.policeCov = 0;
      t.healthCov = 0;
      t.eduCov = 0;
      t.garbageCov = 0;
      t.pollution = 0;
      t.noise = 0;
      t.landValue = (t.terrain === 'sand' ? 56 : 42) + (state.policies.hightech ? 15 : 0) + (spec === 'it_hub' ? 12 : spec === 'eco_garden' ? 8 : 0);
      t.happiness = 72 + evHappyBonus + (spec === 'eco_garden' ? 12 : 0);
      t.nearTransit = false;
    }
  }

  // 1. River Downstream Pollution (North -> South)
  const wq: [number, number][] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (g[y][x].building?.type === 'sewage') {
        g[y][x].pipe = true;
        for (const [dx, dy] of DIRS) {
          if (inBounds(x + dx, y + dy) && g[y + dy][x + dx].terrain === 'water') {
            g[y + dy][x + dx].waterPollution = 100;
            wq.push([x + dx, y + dy]);
          }
        }
      }
    }
  }
  for (let h = 0; h < wq.length; h++) {
    const [cx, cy] = wq[h];
    const cp = g[cy][cx].waterPollution;
    if (cp <= 10) continue;
    for (const [dx, dy] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny) || g[ny][nx].terrain !== 'water') continue;
      const np = cp - (dy === 1 ? (dx === 0 ? 4 : 8) : 18);
      if (np > g[ny][nx].waterPollution) {
        g[ny][nx].waterPollution = np;
        wq.push([nx, ny]);
      }
    }
  }

  // 2. Power Blobs + Power Islands + Extended Power-Line Connectivity (cardinal + diagonal + 2-tile span!)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const b = g[y][x].building;
      if (!b) continue;
      if (b.type === 'power_line') {
        g[y][x].powerBlob = true;
        continue;
      }
      if (!isRoadType(b.type)) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (inBounds(x + dx, y + dy) && Math.hypot(dx, dy) <= 2.25) {
              g[y + dy][x + dx].powerBlob = true;
            }
          }
        }
      }
    }
  }

  // Label connected power islands for natural bridge detection
  let nextIsland = 1;
  const islandQ: [number, number][] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!g[y][x].powerBlob || g[y][x].powerIsland > 0) continue;
      const id = nextIsland++;
      g[y][x].powerIsland = id;
      islandQ.length = 0;
      islandQ.push([x, y]);
      for (let h = 0; h < islandQ.length; h++) {
        const [cx, cy] = islandQ[h];
        const isLine = g[cy][cx].building?.type === 'power_line';
        const dirs = isLine ? DIRS8 : DIRS;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (inBounds(nx, ny) && g[ny][nx].powerBlob && g[ny][nx].powerIsland === 0) {
            g[ny][nx].powerIsland = id;
            islandQ.push([nx, ny]);
          }
        }
        // Allow power_line to bridge 2-tile spans (rivers/highways) cleanly
        if (isLine) {
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx * 2;
            const ny = cy + dy * 2;
            if (inBounds(nx, ny) && g[ny][nx].building?.type === 'power_line' && g[ny][nx].powerIsland === 0) {
              g[ny][nx].powerIsland = id;
              islandQ.push([nx, ny]);
            }
          }
        }
      }
    }
  }

  let powerGen = 0;
  let greenPower = 0;
  const poweredIslands = new Set<number>();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const b = g[y][x].building;
      if (b && TOOL_MAP[b.type]?.powerGen) {
        const amt = Math.round((TOOL_MAP[b.type].powerGen || 0) * utilMult * evPowerMult);
        powerGen += amt;
        if (b.type === 'wind' || b.type === 'solar') greenPower += amt;
        poweredIslands.add(g[y][x].powerIsland);
      }
    }
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (g[y][x].powerIsland > 0 && poweredIslands.has(g[y][x].powerIsland)) {
        g[y][x].powered = true;
      }
    }
  }

  // 3. Underground Water & Sewage Pipe Network BFS (4-tile supply radius!)
  let waterGen = 0;
  let sewageGen = 0;
  let anyPumpPolluted = false;
  const pipeVisW = new Uint8Array(GRID * GRID);
  const pipeDirtyW = new Uint8Array(GRID * GRID);
  const pwq: [number, number, boolean][] = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      if (t.building?.type === 'water_pump') {
        t.pipe = true;
        if (t.powered) {
          waterGen += Math.round((TOOL_MAP.water_pump.waterGen || 620) * utilMult);
          const dirty = DIRS.some(
            ([dx, dy]) =>
              inBounds(x + dx, y + dy) &&
              g[y + dy][x + dx].terrain === 'water' &&
              g[y + dy][x + dx].waterPollution > 18
          );
          if (dirty) anyPumpPolluted = true;
          pipeVisW[y * GRID + x] = 1;
          if (dirty) pipeDirtyW[y * GRID + x] = 1;
          pwq.push([x, y, dirty]);
        }
      }
    }
  }
  for (let h = 0; h < pwq.length; h++) {
    const [cx, cy, dirty] = pwq[h];
    for (let k = 0; k < PIPE_OFFSETS.length; k++) {
      const nx = cx + PIPE_OFFSETS[k][0];
      const ny = cy + PIPE_OFFSETS[k][1];
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
        g[ny][nx].hasWater = true;
        if (dirty) g[ny][nx].waterPolluted = true;
      }
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = ny * GRID + nx;
      if (!g[ny][nx].pipe) continue;
      if (!pipeVisW[ni] || (dirty && !pipeDirtyW[ni])) {
        pipeVisW[ni] = 1;
        if (dirty) pipeDirtyW[ni] = 1;
        pwq.push([nx, ny, dirty]);
      }
    }
  }

  const pipeVisS = new Uint8Array(GRID * GRID);
  const psq: [number, number][] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      if (t.building?.type === 'sewage' && t.powered) {
        sewageGen += Math.round((TOOL_MAP.sewage.sewageGen || 620) * utilMult);
        pipeVisS[y * GRID + x] = 1;
        psq.push([x, y]);
      }
    }
  }
  for (let h = 0; h < psq.length; h++) {
    const [cx, cy] = psq[h];
    for (let k = 0; k < PIPE_OFFSETS.length; k++) {
      const nx = cx + PIPE_OFFSETS[k][0];
      const ny = cy + PIPE_OFFSETS[k][1];
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) g[ny][nx].hasSewage = true;
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = ny * GRID + nx;
      if (g[ny][nx].pipe && !pipeVisS[ni]) {
        pipeVisS[ni] = 1;
        psq.push([nx, ny]);
      }
    }
  }

  // 4. City Services, Transit, Pollution, Land Value & Utility Consumption
  let powerUse = 0;
  let waterUse = 0;
  let sewageUse = 0;
  let garbageCap = 0;
  let garbageNeed = 0;
  let baseUpkeep = 0;

  const fireSrc: { x: number; y: number; val: number }[] = [];
  const polSrc: { x: number; y: number; val: number }[] = [];
  const hlthSrc: { x: number; y: number; val: number }[] = [];
  const eduSrc: { x: number; y: number; val: number }[] = [];
  const garSrc: { x: number; y: number; val: number }[] = [];
  const busStops: [number, number][] = [];
  rt.metroStations = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      if (t.pipe) baseUpkeep += 0.22;
      const b = t.building;
      if (!b) continue;
      const def = TOOL_MAP[b.type];
      const zs = ZONE_SPECS[b.type];
      const spec = state.sectorSpecs[sectorIdx(x, y)] || 'general';
      const lvMult = 1 + ((b.level || 1) - 1) * 0.5;

      if (def?.upkeep && !b.locked) {
        const bm = def.cat === 'util' ? utilMult : def.cat === 'svc' || def.cat === 'edu' ? svcMult : 1;
        baseUpkeep += def.upkeep * bm;
      }
      if (!b.abandoned) {
        if (def?.powerUse) powerUse += def.powerUse;
        if (def?.waterUse) {
          waterUse += def.waterUse;
          sewageUse += def.waterUse;
        }
        if (def?.garbageCap && t.powered) garbageCap += Math.round(def.garbageCap * svcMult);
        if (zs) {
          powerUse += Math.round(zs.power * lvMult);
          waterUse += Math.round(zs.water * lvMult);
          sewageUse += Math.round(zs.water * lvMult);
          const garFactor = (state.policies.recycling ? 0.7 : 1) * (spec === 'eco_garden' ? 0.72 : 1);
          garbageNeed += Math.round(zs.garbage * lvMult * garFactor);
        }
      }

      if (t.powered && t.hasRoad) {
        if (b.type === 'fire_station') fireSrc.push({ x, y, val: 95 });
        if (b.type === 'police_station') polSrc.push({ x, y, val: 95 });
        if (b.type === 'hospital') hlthSrc.push({ x, y, val: 95 });
        if (b.type === 'school') eduSrc.push({ x, y, val: 65 });
        if (b.type === 'university') eduSrc.push({ x, y, val: 100 });
        if (b.type === 'landfill' || b.type === 'incinerator') garSrc.push({ x, y, val: 95 });
        if (b.type === 'bus_stop') busStops.push([x, y]);
        if (b.type === 'metro') rt.metroStations.push([x, y]);
      }

      const pol = def?.pollution || (zs?.pollution && !b.abandoned ? zs.pollution : 0);
      if (pol) {
        const pAmt = pol * (state.policies.recycling ? 0.85 : 1) * (spec === 'smart_port' ? 0.75 : 1);
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.hypot(dx, dy);
            if (inBounds(x + dx, y + dy) && d <= 3.1) {
              g[y + dy][x + dx].pollution += Math.round(pAmt * (1 - d / 3.6));
            }
          }
        }
      }
      const ns = def?.noise || (zs?.noise && !b.abandoned ? zs.noise : 0);
      if (ns) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inBounds(x + dx, y + dy)) g[y + dy][x + dx].noise += ns;
          }
        }
      }
      if (def?.happyAura) {
        const r = def.radius || 4;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const d = Math.hypot(dx, dy);
            if (inBounds(x + dx, y + dy) && d <= r + 0.3) {
              const f = 1 - d / (r + 1.2);
              g[y + dy][x + dx].happiness += Math.round(def.happyAura * f);
              g[y + dy][x + dx].landValue += Math.round((def.lvAura || 16) * f);
              if (b.type === 'park') g[y + dy][x + dx].pollution = Math.max(0, g[y + dy][x + dx].pollution - 12);
            }
          }
        }
      }
    }
  }

  spreadRoadService(state, fireSrc, Math.round(13 * svcMult), 'fireCov', svcMult);
  spreadRoadService(state, polSrc, Math.round(13 * svcMult), 'policeCov', svcMult);
  spreadRoadService(state, hlthSrc, Math.round(15 * svcMult), 'healthCov', svcMult);
  spreadRoadService(state, eduSrc, Math.round(16 * svcMult), 'eduCov', svcMult);
  spreadRoadService(state, garSrc, Math.round(18 * svcMult), 'garbageCov', svcMult);

  const metroActive = rt.metroStations.length >= 2;
  for (const [bx, by] of busStops) {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (inBounds(bx + dx, by + dy) && Math.hypot(dx, dy) <= 6.2) g[by + dy][bx + dx].nearTransit = true;
      }
    }
  }
  if (metroActive) {
    for (const [mx, my] of rt.metroStations) {
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          if (inBounds(mx + dx, my + dy) && Math.hypot(dx, dy) <= 8.2) g[my + dy][mx + dx].nearTransit = true;
        }
      }
    }
  }

  // Global capacity checks
  const powerOk = powerGen >= powerUse || powerUse === 0;
  const waterOk = waterGen >= waterUse || waterUse === 0;
  const sewageOk = sewageGen >= sewageUse || sewageUse === 0;
  const garbageOk = garbageCap >= garbageNeed || garbageNeed === 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const spec = state.sectorSpecs[sectorIdx(x, y)] || 'general';
      if (!powerOk) t.powered = false;
      if (!waterOk) t.hasWater = false;
      if (!sewageOk) t.hasSewage = false;
      if (spec === 'eco_garden') t.pollution = Math.max(0, Math.round(t.pollution * 0.72));
      t.landValue = Math.max(
        5,
        Math.min(
          100,
          t.landValue +
            Math.round((t.policeCov + t.eduCov + t.healthCov) * 0.14) -
            Math.round(t.pollution * 0.9) -
            Math.round(t.noise * 0.35)
        )
      );
      t.crime = Math.max(0, Math.min(100, 35 - Math.round(t.policeCov * 0.5) - Math.round(t.eduCov * 0.2)));
    }
  }

  // 5. Traffic Simulation
  computeTrafficFlow(state, rt, metroActive);

  // 6. Population, Jobs, Tax (with District Specializations!), Education & RCI Demand
  let totalPop = 0;
  let totalJobs = 0;
  let comJobs = 0;
  let indJobs = 0;
  let totalTax = 0;
  let eduSum = 0;
  let eduW = 0;
  let happySum = 0;
  let happyW = 0;
  let activeFires = 0;
  let roadCnt = 0;
  let congSum = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const b = t.building;
      const spec = state.sectorSpecs[sectorIdx(x, y)] || 'general';
      if (t.onFire) activeFires++;
      if (isRoadType(b?.type) && !b?.locked) {
        roadCnt++;
        if (t.congestion > 0.85) congSum += Math.min(1.5, t.congestion - 0.7);
      }
      let ac = 0;
      for (const [dx, dy] of DIRS) {
        if (inBounds(x + dx, y + dy) && isRoadType(g[y + dy][x + dx].building?.type)) {
          ac = Math.max(ac, g[y + dy][x + dx].congestion);
        }
      }
      t.adjCongestion = ac;

      let hp = t.happiness - Math.round(t.pollution * 0.85) - Math.round(t.crime * 0.35);
      if (t.waterPolluted) hp -= 35;
      if (t.garbageAccum > 45) hp -= 18;
      if (!t.powered && b && ZONE_SPECS[b.type]) hp -= 25;
      if ((!t.hasWater || !t.hasSewage) && b && ZONE_SPECS[b.type]) hp -= 25;
      t.happiness = Math.max(5, Math.min(100, hp));

      if (!b || b.abandoned || t.onFire) continue;
      const zs = ZONE_SPECS[b.type];
      const def = TOOL_MAP[b.type];
      if (zs) {
        const taxKey = (b.type === 'office' ? 'O' : zs.group) as 'R' | 'C' | 'I' | 'O';
        const taxRate = state.taxes[taxKey] || 10;
        const taxFactor = (taxRate / 10) * evTaxMult;
        const taxPenalty = Math.max(0, (taxRate - 11) * 4);
        t.happiness = Math.max(5, t.happiness - taxPenalty);

        const utilEff =
          (t.hasRoad ? 1 : 0.1) *
          (t.powered ? 1 : 0.3) *
          (t.hasWater && t.hasSewage ? 1 : 0.4) *
          (t.waterPolluted ? 0.45 : 1);
        const trfEff = ac > 1.25 ? 0.72 : 1;
        const lvMultP = b.level === 1 ? 1 : b.level === 2 ? 2.1 : 3.7;
        const lvMultT = b.level === 1 ? 1 : b.level === 2 ? 2.0 : 3.5;

        if (zs.group === 'R') {
          const p = Math.round((zs.pop || 15) * lvMultP * utilEff * (0.55 + (0.45 * t.happiness) / 100));
          totalPop += p;
          totalTax += Math.round(zs.tax * lvMultT * utilEff * taxFactor);
          eduSum += t.eduCov * p;
          eduW += p;
          happySum += t.happiness * (1 + b.level);
          happyW += 1 + b.level;
        } else if (zs.group === 'C') {
          const specBoost = spec === 'tourism' ? 1.32 : 1;
          const j = Math.round((zs.jobs || 12) * lvMultP * utilEff * trfEff);
          totalJobs += j;
          comJobs += j;
          totalTax += Math.round(zs.tax * lvMultT * utilEff * trfEff * taxFactor * specBoost);
        } else {
          const specBoost =
            b.type === 'office'
              ? spec === 'it_hub'
                ? 1.32
                : 1
              : spec === 'smart_port'
                ? 1.3
                : 1;
          const eduEff = b.type === 'office' ? (t.eduCov >= 30 || spec === 'it_hub' ? 1 : 0.45) : 1;
          const j = Math.round((zs.jobs || 20) * lvMultP * utilEff * trfEff * eduEff);
          totalJobs += j;
          indJobs += j;
          totalTax += Math.round(zs.tax * lvMultT * utilEff * trfEff * eduEff * taxFactor * specBoost);
        }
      } else if (b.type === 'landmark' && def?.taxBase) {
        const specBoost = spec === 'tourism' ? 1.35 : 1;
        totalTax += Math.round(def.taxBase * (t.powered && t.hasRoad ? 1 : 0.3) * specBoost * evTaxMult);
        happySum += 300;
        happyW += 3;
      }
    }
  }

  for (const p of POLICIES) if (state.policies[p.id]) baseUpkeep += p.cost;
  for (let i = 0; i < 25; i++) {
    if (state.unlockedSectors[i]) baseUpkeep += DISTRICT_SPEC_MAP[state.sectorSpecs[i] || 'general'].upkeep;
  }

  const loanInterest = Math.round(state.loan * 0.008);
  const totalUpkeep = Math.round(baseUpkeep) + loanInterest;
  const avgHappy = happyW > 0 ? Math.min(100, Math.round(happySum / happyW)) : 76;
  const avgEdu = eduW > 0 ? Math.min(100, Math.round(eduSum / eduW)) : 0;
  const rawFlow = roadCnt > 0 ? 100 - (congSum / Math.max(4, roadCnt)) * 120 : 100;
  const trafficFlow = Math.max(25, Math.min(100, Math.round(rawFlow + evTrafficBonus)));
  const greenPowerPct = powerGen > 0 ? Math.min(100, Math.round((greenPower / powerGen) * 100)) : 0;

  const taxModR = (10 - state.taxes.R) * 4.5;
  const taxModC = (10 - state.taxes.C) * 4.5;
  const taxModI = (10 - (state.taxes.I + state.taxes.O) * 0.5) * 4.5;
  let dR = 68 + taxModR;
  let dC = 36 + taxModC;
  let dI = 48 + taxModI;
  if (totalPop > 0 || totalJobs > 0) {
    dR =
      52 +
      ((totalJobs - totalPop * 0.56) / Math.max(20, totalPop * 0.45)) * 55 +
      (avgHappy - 68) * 1.1 +
      taxModR -
      (anyPumpPolluted ? 45 : 0);
    if (totalPop < 45) dR = Math.max(dR, 65 + taxModR);
    dC = 30 + ((totalPop * 0.34 - comJobs) / Math.max(15, totalPop * 0.25)) * 65 + taxModC;
    dI = 32 + ((totalPop * 0.36 + comJobs * 0.4 - indJobs) / Math.max(18, totalPop * 0.3)) * 60 + taxModI;
  }
  state.demand = {
    R: Math.max(0, Math.min(100, Math.round(dR))),
    C: Math.max(0, Math.min(100, Math.round(dC))),
    I: Math.max(0, Math.min(100, Math.round(dI))),
  };

  state.stats = {
    population: totalPop,
    jobs: totalJobs,
    education: avgEdu,
    powerGen,
    powerUse,
    greenPowerPct,
    waterGen,
    waterUse,
    waterPolluted: anyPumpPolluted,
    sewageGen,
    sewageUse,
    garbageCap,
    garbageNeed,
    trafficFlow,
    happiness: avgHappy,
    activeFires,
    taxIncome: totalTax,
    upkeep: totalUpkeep,
    netIncome: totalTax - totalUpkeep,
  };

  // Chirper Citizen Alerts
  if (activeFires > 0) {
    state.chirp = `🔥 #긴급화재 "건물에 불이 났어요(${activeFires}곳)! 소방서(🚒)와 도로 연결을 확인하세요!"`;
  } else if (anyPumpPolluted) {
    state.chirp = '🤢 #오염수비상 "수돗물이 오염됐어요! 취수장을 하수 배출구보다 강 상류(북쪽)로 옮기세요!"';
  } else if (powerUse > powerGen) {
    state.chirp = '⚡ #전력부족 "전력이 부족합니다! 발전소를 추가하거나 고압 송전선(🗼)으로 전력망을 연결하세요."';
  } else if (waterUse > waterGen || sewageUse > sewageGen) {
    state.chirp = '💧 #상하수도경보 "물이나 하수 용량 부족! 지하 수도관(🔧)과 취수장·하수구를 확충하세요."';
  } else if (!garbageOk) {
    state.chirp = '🗑️ #쓰레기대란 "쓰레기가 쌓이고 있어요! 매립지나 소각 발전소를 지어주세요."';
  } else if (trafficFlow < 75) {
    state.chirp = '🚗 #교통체증 "혼잡 교차로에 🔄 회전교차로를 올리거나 4차선 대로·지하철역으로 확장해 보세요!"';
  } else {
    state.chirp = `🏙️ #${state.name} "인구 ${totalPop.toLocaleString()}명 · 교통흐름 ${trafficFlow}% · 친환경 전력 ${greenPowerPct}% — 야경이 눈부신 메가폴리스!"`;
  }
}

export function computeTrafficFlow(state: CityState, rt: SimRuntime, metroActive: boolean) {
  const g = state.grid;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      g[y][x].trafficLoad = 0;
      g[y][x].congestion = 0;
    }
  }
  const resN: { rx: number; ry: number; wt: number; x: number; y: number }[] = [];
  const comN: { rx: number; ry: number; wt: number; x: number; y: number }[] = [];
  const indN: { rx: number; ry: number; wt: number; x: number; y: number }[] = [];
  const transitFactor = state.policies.free_transit ? 0.35 : 0.5;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const b = t.building;
      if (!b || b.abandoned || t.onFire || !ZONE_SPECS[b.type]) continue;
      const r = getAdjRoad(state, x, y);
      if (!r) continue;
      const wt =
        ZONE_SPECS[b.type].traffic *
        (1 + (b.level - 1) * 0.5) *
        (t.nearTransit ? (metroActive ? transitFactor : 0.7) : 1);
      const n = { rx: r[0], ry: r[1], wt, x, y };
      if (ZONE_SPECS[b.type].group === 'R') resN.push(n);
      else if (ZONE_SPECS[b.type].group === 'C') comN.push(n);
      else indN.push(n);
    }
  }

  const nr: RouteInfo[] = [];
  const hwyEW: [number, number][] = [];
  const hwyNS: [number, number][] = [];
  for (let x = 0; x < GRID; x++) if (g[2]?.[x]?.building?.type === 'highway') hwyEW.push([x, 2]);
  for (let y = 0; y < 52; y++) if (g[y]?.[3]?.building?.type === 'highway') hwyNS.push([3, y]);
  if (hwyEW.length > 10) {
    nr.push({ path: hwyEW, kind: 'car' });
    nr.push({ path: [...hwyEW].reverse(), kind: 'truck' });
  }
  if (hwyNS.length > 10) {
    nr.push({ path: hwyNS, kind: 'truck' });
    nr.push({ path: [...hwyNS].reverse(), kind: 'car' });
  }

  const works = [...comN, ...indN];
  if (works.length && resN.length) {
    const maxSamples = 60;
    const stride = Math.max(1, Math.ceil(resN.length / maxSamples));
    const scaleW = Math.min(2.2, stride * 0.75);
    for (let i = state.day % stride; i < resN.length; i += stride) {
      const s = resN[i];
      const d = works[(i * 7 + s.x * 3 + s.y) % works.length];
      const p = findRoadPath(state, s.rx, s.ry, d.rx, d.ry);
      if (p && p.length > 1) {
        const load = s.wt * scaleW;
        for (let k = 0; k < p.length; k++) g[p[k][1]][p[k][0]].trafficLoad += load;
        if (nr.length < 75) nr.push({ path: p, kind: i % 5 === 0 ? 'bus' : 'car' });
      }
    }
  }
  if (comN.length && indN.length) {
    const maxInd = 25;
    const stride = Math.max(1, Math.ceil(indN.length / maxInd));
    const scaleW = Math.min(2.2, stride * 0.8);
    for (let i = state.day % stride; i < indN.length; i += stride) {
      const s = indN[i];
      const d = comN[(i * 5 + s.y * 3) % comN.length];
      const p = findRoadPath(state, s.rx, s.ry, d.rx, d.ry);
      if (p && p.length > 1) {
        const load = s.wt * scaleW;
        for (let k = 0; k < p.length; k++) g[p[k][1]][p[k][0]].trafficLoad += load;
        if (nr.length < 105) nr.push({ path: p, kind: 'truck' });
      }
    }
  }
  rt.activeRoutes = nr;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      if (isRoadType(t.building?.type)) {
        t.congestion = t.trafficLoad / (TOOL_MAP[t.building!.type]?.cap || 18);
      }
    }
  }
}

export function dispatchEmergency(
  state: CityState,
  rt: SimRuntime,
  stationTypes: string[],
  targetX: number,
  targetY: number,
  kind: 'fire' | 'police' | 'ambulance'
) {
  if (rt.emergencyVehicles.length >= 12) return;
  const g = state.grid;
  const dstR = getAdjRoad(state, targetX, targetY);
  if (!dstR) return;
  let bestPath: [number, number][] | null = null;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const b = g[y][x].building;
      if (!b || !stationTypes.includes(b.type) || !g[y][x].powered) continue;
      const srcR = getAdjRoad(state, x, y);
      if (!srcR) continue;
      const p = findRoadPath(state, srcR[0], srcR[1], dstR[0], dstR[1]);
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
  }
  if (bestPath && bestPath.length > 1) {
    rt.emergencyVehicles.push({ path: bestPath, idx: 0, t: 0, kind, targetX, targetY });
    if (kind === 'fire') playSound('siren');
  }
}

export function maintainVehicles(rt: SimRuntime) {
  const CAR_COLS = [0xe2e8f0, 0xfef08a, 0x93c5fd, 0xfca5a5, 0xcbd5e1, 0x6ee7b7, 0xfdba74];
  const target = Math.min(110, rt.activeRoutes.length * 2 + 12);
  while (rt.vehicles.length < target && rt.activeRoutes.length > 0) {
    const r = rt.activeRoutes[Math.floor(Math.random() * rt.activeRoutes.length)];
    rt.vehicles.push({
      path: r.path,
      idx: Math.floor(Math.random() * Math.max(1, r.path.length - 1)),
      t: Math.random(),
      speed: r.kind === 'bus' ? 2.4 : r.kind === 'truck' ? 2.7 : 3.4 + Math.random() * 1.1,
      kind: r.kind,
      color:
        r.kind === 'bus'
          ? 0x2563eb
          : r.kind === 'truck'
            ? 0xf59e0b
            : CAR_COLS[Math.floor(Math.random() * CAR_COLS.length)],
      lane: 0.14,
    });
  }
  if (rt.vehicles.length > target + 10) rt.vehicles.length = target;
}

export function updateVehicles(state: CityState, rt: SimRuntime, dt: number, simSpeed: number) {
  if (simSpeed === 0) return;
  const step = dt * (0.75 + simSpeed * 0.45);
  for (let i = 0; i < rt.vehicles.length; i++) {
    const v = rt.vehicles[i];
    if (!v.path || v.path.length < 2) continue;
    const [cx, cy] = v.path[v.idx];
    const tile = state.grid[cy]?.[cx];
    const roadSpd = tile?.building ? TOOL_MAP[tile.building.type]?.spd || 1 : 1;
    const congSlow = tile && tile.congestion > 1 ? Math.max(0.35, 1.35 - tile.congestion * 0.5) : 1;
    v.t += v.speed * roadSpd * congSlow * step;
    while (v.t >= 1) {
      v.t -= 1;
      v.idx++;
      if (v.idx >= v.path.length - 1) {
        if (rt.activeRoutes.length > 0) {
          const r = rt.activeRoutes[Math.floor(Math.random() * rt.activeRoutes.length)];
          v.path = r.path;
          v.idx = 0;
          v.kind = r.kind;
        } else {
          v.idx = 0;
        }
      }
    }
  }
  for (let i = rt.emergencyVehicles.length - 1; i >= 0; i--) {
    const ev = rt.emergencyVehicles[i];
    ev.t += 6.2 * step;
    while (ev.t >= 1) {
      ev.t -= 1;
      ev.idx++;
      if (ev.idx >= ev.path.length - 1) {
        const tgt = state.grid[ev.targetY]?.[ev.targetX];
        if (ev.kind === 'fire' && tgt?.onFire) {
          tgt.onFire = false;
          tgt.fireTimer = 0;
          rt.onChunkDirty(ev.targetX, ev.targetY);
        }
        rt.emergencyVehicles.splice(i, 1);
        break;
      }
    }
  }
}

export function evaluateQuests(state: CityState, rt: SimRuntime) {
  for (const q of QUESTS) {
    if (state.completedQuests.includes(q.id)) continue;
    const res = q.check(state);
    if (res.done) {
      state.completedQuests.push(q.id);
      state.money += q.reward;
      playSound('milestone');
      rt.onToast(`🎯 시장 미션 달성: ${q.title}!`, `보상금 +₩${q.reward.toLocaleString()} 지급!`, 'success');
      rt.onMilestoneOrQuest();
    }
  }
}

export function resolveEventChoice(state: CityState, rt: SimRuntime, pick: 'A' | 'B') {
  if (!state.activeEvent) return;
  const ev = CITY_EVENTS.find(e => e.id === state.activeEvent!.id);
  if (!ev) {
    state.activeEvent = null;
    return;
  }
  const choice = pick === 'A' ? ev.choiceA : ev.choiceB;
  const eff = pick === 'A' ? ev.effectA : ev.effectB;
  if (choice.cost > 0 && state.money < choice.cost) {
    playSound('error');
    rt.onToast('자금 부족', `₩${choice.cost.toLocaleString()}이 필요합니다!`, 'error');
    return;
  }
  state.money -= choice.cost;
  state.activeBuffs = state.activeBuffs.filter(b => b.id !== eff.buffId);
  state.activeBuffs.push({
    id: eff.buffId,
    name: eff.name,
    icon: eff.icon,
    daysLeft: eff.days,
    powerMult: eff.powerMult,
    taxMult: eff.taxMult,
    happyBonus: eff.happyBonus,
    trafficBonus: eff.trafficBonus,
  });
  state.activeEvent = null;
  playSound('milestone');
  rt.onToast(`${eff.icon} 시장 결정 발효: ${eff.name}`, choice.desc, 'info');
  runCitySimulation(state, rt);
}

export function simTick(state: CityState, rt: SimRuntime) {
  state.day += 1;

  // Tick down active event buffs
  for (let i = state.activeBuffs.length - 1; i >= 0; i--) {
    state.activeBuffs[i].daysLeft -= 1;
    if (state.activeBuffs[i].daysLeft <= 0) state.activeBuffs.splice(i, 1);
  }

  runCitySimulation(state, rt);

  let repay = 0;
  if (state.loan > 0) {
    repay = Math.min(state.loan, 250);
    state.loan -= repay;
  }
  state.money += state.stats.netIncome - repay;

  const g = state.grid;
  let builtThisTick = 0;
  const fireChanceBase = state.policies.smoke_det ? 0.00012 : 0.00028;
  let firesStarted = state.stats.activeFires;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      if (t.zone && !t.building && t.hasRoad && builtThisTick < 10) {
        const zs = ZONE_SPECS[t.zone];
        const dem = state.demand[zs.group];
        const eduOk = !zs.needEdu || t.eduCov >= 20 || state.stats.education >= 20;
        if (dem >= 12 && eduOk) {
          t.zoneProgress = (t.zoneProgress || 0) + Math.round(24 + dem * 0.55);
          if (t.zoneProgress >= 100) {
            t.zoneProgress = 0;
            t.wildTree = false;
            t.building = { type: t.zone, level: 1, growth: 0, neglect: 0, abandoned: false, builtAt: rt.animTime };
            builtThisTick++;
            rt.onChunkDirty(x, y);
          }
        }
      }

      const b = t.building;
      if (!b || !ZONE_SPECS[b.type]) continue;
      const zs = ZONE_SPECS[b.type];

      if (t.onFire) {
        t.fireTimer = (t.fireTimer || 0) + 1;
        if (t.fireCov >= 40 && t.fireTimer >= 4) {
          t.onFire = false;
          t.fireTimer = 0;
          rt.onChunkDirty(x, y);
        } else if (t.fireTimer >= 12) {
          t.onFire = false;
          t.fireTimer = 0;
          b.abandoned = true;
          rt.onChunkDirty(x, y);
        }
        continue;
      } else if (!b.abandoned && state.stats.population > 120 && firesStarted < 2) {
        const risk = fireChanceBase * (1 - t.fireCov / 120);
        if (risk > 0 && Math.random() < risk) {
          t.onFire = true;
          t.fireTimer = 0;
          firesStarted++;
          rt.onChunkDirty(x, y);
          dispatchEmergency(state, rt, ['fire_station'], x, y, 'fire');
          rt.onToast('🔥 화재 발생!', `(${x + 1}, ${y + 1}) 구역에 화재가 발생했습니다! 소방차가 출동합니다.`, 'error');
          continue;
        }
      }

      const garOk = state.stats.garbageCap >= state.stats.garbageNeed && (t.garbageCov > 10 || state.stats.garbageCap > state.stats.garbageNeed * 1.15);
      t.garbageAccum = garOk ? Math.max(0, t.garbageAccum - 15) : Math.min(100, t.garbageAccum + 8);
      const wasSick = t.sick;
      t.sick = (t.waterPolluted || t.garbageAccum > 75 || (zs.group === 'R' && t.pollution > 25)) && t.healthCov < 60;
      if (t.sick && !wasSick) dispatchEmergency(state, rt, ['hospital'], x, y, 'ambulance');
      if (t.crime > 30 && Math.random() < 0.018) dispatchEmergency(state, rt, ['police_station'], x, y, 'police');

      const healthy = t.hasRoad && t.powered && t.hasWater && t.hasSewage && !t.waterPolluted && t.garbageAccum < 85;
      if (!healthy) {
        b.neglect = (b.neglect || 0) + 1;
        if (b.neglect >= 12 && !b.abandoned) {
          b.abandoned = true;
          rt.onChunkDirty(x, y);
        }
      } else {
        b.neglect = Math.max(0, (b.neglect || 0) - 2);
        if (b.abandoned && b.neglect === 0 && state.demand[zs.group] >= 15) {
          b.abandoned = false;
          rt.onChunkDirty(x, y);
        }
        if (!b.abandoned && b.level < 3) {
          const reqLV = b.level === 1 ? 48 : 66;
          const reqEdu = b.type === 'office' ? (b.level === 1 ? 35 : 65) : b.level === 2 ? 25 : 0;
          if (t.landValue >= reqLV && t.eduCov >= reqEdu && t.happiness >= 70) {
            b.growth = (b.growth || 0) + (state.policies.hightech ? 24 : 16);
            if (b.growth >= 100) {
              b.level += 1;
              b.growth = 0;
              rt.onChunkDirty(x, y);
            }
          }
        }
      }
    }
  }

  // Milestones
  while (state.milestone < MILESTONES.length - 1 && state.stats.population >= MILESTONES[state.milestone + 1].pop) {
    state.milestone += 1;
    const ms = MILESTONES[state.milestone];
    state.money += ms.reward;
    playSound('milestone');
    rt.onToast(`🏆 도시 승격: ${ms.name}!`, `신규 시설 해금 및 축하금 +₩${ms.reward.toLocaleString()}!`, 'success');
    rt.onMilestoneOrQuest();
  }

  // Record rolling history snapshot every 2 days for trend chart
  if (state.day % 2 === 0) {
    state.statsHistory.push({
      day: state.day,
      population: state.stats.population,
      netIncome: state.stats.netIncome,
      happiness: state.stats.happiness,
      trafficFlow: state.stats.trafficFlow,
    });
    if (state.statsHistory.length > 36) state.statsHistory.shift();
  }

  // Trigger periodic dynamic city events!
  if (!state.activeEvent && state.day >= state.nextEventDay && state.stats.population >= 100) {
    const pick = CITY_EVENTS[Math.floor(Math.random() * CITY_EVENTS.length)];
    state.activeEvent = {
      id: pick.id,
      icon: pick.icon,
      title: pick.title,
      desc: pick.desc,
      choiceA: pick.choiceA,
      choiceB: pick.choiceB,
    };
    state.nextEventDay = state.day + 22 + Math.floor(Math.random() * 14);
    playSound('snap');
  }

  evaluateQuests(state, rt);
  maintainVehicles(rt);
  runCitySimulation(state, rt);
}
