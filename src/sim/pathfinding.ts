import { DIRS, GRID, TOOL_MAP, isRoadType } from './constants';
import type { CityState } from './types';

// Zero-allocation typed arrays for ultra-fast weighted A* road hierarchy routing
const N = GRID * GRID;
const gScore = new Float32Array(N);
const visitedGen = new Int32Array(N);
const closedGen = new Int32Array(N);
const parentIdx = new Int32Array(N);
const heapNode = new Int32Array(N * 2);
const heapF = new Float32Array(N * 2);
let searchGen = 1;

/**
 * Cities: Skylines Speed-Weighted & Congestion-Aware Road Hierarchy A* Pathfinder.
 * - Highways (spd 1.95 -> cost ~0.51) and 4-lane Avenues (spd 1.40 -> cost ~0.71)
 *   act as true high-speed arterials over 2-lane local streets (cost 1.00).
 * - Congested roads add dynamic delay penalties so commuters & freight organically
 *   reroute onto boulevards, roundabouts, and highways!
 */
export function findOptimalRoadPath(
  state: CityState,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  ignoreCongestion = false
): [number, number][] | null {
  if (sx === ex && sy === ey) return [[sx, sy]];
  const g = state.grid;

  searchGen++;
  if (searchGen > 2_000_000_000) {
    visitedGen.fill(0);
    closedGen.fill(0);
    searchGen = 1;
  }

  const start = sy * GRID + sx;
  const goal = ey * GRID + ex;
  // Minimum possible per-tile cost (highway 1/1.95 ≈ 0.512) -> admissible heuristic weight 0.49
  const H_WEIGHT = 0.49;

  visitedGen[start] = searchGen;
  gScore[start] = 0;
  parentIdx[start] = -1;

  let heapSize = 0;
  const pushHeap = (node: number, f: number) => {
    let i = heapSize++;
    heapNode[i] = node;
    heapF[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      const tn = heapNode[p];
      const tf = heapF[p];
      heapNode[p] = heapNode[i];
      heapF[p] = heapF[i];
      heapNode[i] = tn;
      heapF[i] = tf;
      i = p;
    }
  };

  const popHeap = (): number => {
    const top = heapNode[0];
    heapSize--;
    if (heapSize > 0) {
      heapNode[0] = heapNode[heapSize];
      heapF[0] = heapF[heapSize];
      let i = 0;
      while (true) {
        const l = (i << 1) + 1;
        const r = l + 1;
        let sm = i;
        if (l < heapSize && heapF[l] < heapF[sm]) sm = l;
        if (r < heapSize && heapF[r] < heapF[sm]) sm = r;
        if (sm === i) break;
        const tn = heapNode[i];
        const tf = heapF[i];
        heapNode[i] = heapNode[sm];
        heapF[i] = heapF[sm];
        heapNode[sm] = tn;
        heapF[sm] = tf;
        i = sm;
      }
    }
    return top;
  };

  pushHeap(start, (Math.abs(ex - sx) + Math.abs(ey - sy)) * H_WEIGHT);

  while (heapSize > 0) {
    const cur = popHeap();
    if (closedGen[cur] === searchGen) continue;
    closedGen[cur] = searchGen;

    if (cur === goal) {
      const path: [number, number][] = [];
      let p = cur;
      while (p !== -1) {
        path.push([p % GRID, (p / GRID) | 0]);
        p = parentIdx[p];
      }
      path.reverse();
      return path;
    }

    const cx = cur % GRID;
    const cy = (cur / GRID) | 0;
    const curG = gScore[cur];

    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      const ni = ny * GRID + nx;
      if (closedGen[ni] === searchGen) continue;

      const nt = g[ny][nx];
      const bt = nt.building?.type;
      if (!isRoadType(bt)) continue;

      // Speed-weighted road hierarchy cost + dynamic congestion delay
      const spd = TOOL_MAP[bt!]?.spd || 1.0;
      const congDelay = ignoreCongestion ? 0 : Math.min(2.4, Math.max(0, nt.congestion - 0.55) * 1.35);
      const stepCost = (1.0 / spd) * (1.0 + congDelay);
      const nextG = curG + stepCost;

      if (visitedGen[ni] !== searchGen || nextG < gScore[ni]) {
        visitedGen[ni] = searchGen;
        gScore[ni] = nextG;
        parentIdx[ni] = cur;
        const h = (Math.abs(ex - nx) + Math.abs(ey - ny)) * H_WEIGHT;
        pushHeap(ni, nextG + h);
      }
    }
  }
  return null;
}

/**
 * Finds all active regional highway / road outside connections along the map border
 * for Cities: Skylines Import/Export freight trucks & regional commuter inflow!
 */
export function findOutsideConnections(state: CityState): [number, number][] {
  const portals: [number, number][] = [];
  const g = state.grid;
  for (let i = 0; i < GRID; i++) {
    if (isRoadType(g[0][i].building?.type)) portals.push([i, 0]);
    if (isRoadType(g[GRID - 1][i].building?.type)) portals.push([i, GRID - 1]);
    if (i > 0 && i < GRID - 1) {
      if (isRoadType(g[i][0].building?.type)) portals.push([0, i]);
      if (isRoadType(g[i][GRID - 1].building?.type)) portals.push([GRID - 1, i]);
    }
  }
  return portals;
}
