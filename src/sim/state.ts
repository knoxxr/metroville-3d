import { DIRS, GRID, SAVE_KEY, SECS, ZONE_SPECS, inBounds, isRoadType } from './constants';
import type { CityState, DistrictSpecId, Tile } from './types';

export function computeCoastFlags(grid: Tile[][]) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = grid[y][x];
      t.isCoast =
        t.terrain !== 'water' &&
        DIRS.some(([dx, dy]) => inBounds(x + dx, y + dy) && grid[y + dy][x + dx].terrain === 'water');
    }
  }
}

export function createEmptyState(seed = Math.random() * 100): CityState {
  const grid: Tile[][] = [];
  for (let y = 0; y < GRID; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID; x++) {
      const mainRivX = 37.5 + Math.sin(y * 0.11 + seed * 0.2) * 2.1;
      const dMain = Math.abs(x - mainRivX);
      const tribY = 21.0 + x * 0.27 + Math.sin(x * 0.17 + seed * 0.3) * 1.4;
      const dTrib = x <= mainRivX + 0.8 ? Math.abs(y - tribY) : 99;
      const bayY = 53.8 + Math.sin(x * 0.13 + seed * 0.15) * 1.3;

      const isWater = dMain < 1.55 || dTrib < 1.15 || y >= bayY;
      const isSand = !isWater && (dMain < 2.35 || dTrib < 1.85 || y >= bayY - 1.25);
      const terrain = isWater ? 'water' : isSand ? 'sand' : 'grass';
      // Subtle rolling terrain elevation for hills on far edges
      const edgeHill =
        terrain === 'grass'
          ? Math.max(0, (Math.hypot(x - 30, y - 28) - 24) * 0.04)
          : 0;
      const elev =
        terrain === 'water'
          ? -0.45
          : terrain === 'sand'
            ? -0.04
            : 0.04 * Math.sin(x * 0.22 + seed) * Math.cos(y * 0.22) + edgeHill;
      const hash = (((Math.sin(x * 12.98 + y * 78.23 + seed) * 43758.54) % 1) + 1) % 1;

      row.push({
        x,
        y,
        terrain,
        elev,
        hash,
        wildTree: terrain === 'grass' && y > 3 && x > 4 && hash > 0.76,
        isCoast: false,
        pipe: false,
        zone: null,
        zoneProgress: 0,
        building: null,
        hasRoad: false,
        powerBlob: false,
        powered: false,
        powerIsland: 0,
        hasWater: false,
        waterPolluted: false,
        hasSewage: false,
        waterPollution: 0,
        fireCov: 0,
        policeCov: 0,
        healthCov: 0,
        eduCov: 0,
        garbageCov: 0,
        crime: 0,
        garbageAccum: 0,
        sick: false,
        onFire: false,
        fireTimer: 0,
        pollution: 0,
        noise: 0,
        landValue: 46,
        happiness: 76,
        trafficLoad: 0,
        congestion: 0,
        adjCongestion: 0,
        nearTransit: false,
      });
    }
    grid.push(row);
  }
  computeCoastFlags(grid);

  // Intersecting Regional Highways
  for (let x = 0; x < GRID; x++) {
    grid[2][x].wildTree = false;
    grid[2][x].building = { type: 'highway', level: 1, locked: true };
  }
  for (let y = 0; y < 52; y++) {
    grid[y][3].wildTree = false;
    grid[y][3].building = { type: 'highway', level: 1, locked: true };
  }
  for (let y = 3; y <= 6; y++) {
    for (const ix of [24, 46]) {
      grid[y][ix].wildTree = false;
      grid[y][ix].building = { type: 'avenue', level: 1 };
      grid[y][ix].pipe = true;
    }
  }
  for (let x = 4; x <= 7; x++) {
    grid[36][x].wildTree = false;
    grid[36][x].building = { type: 'avenue', level: 1 };
    grid[36][x].pipe = true;
  }

  const unlockedSectors = Array<boolean>(25).fill(false);
  for (let sy = 0; sy <= 2; sy++) {
    for (let sx = 1; sx <= 3; sx++) unlockedSectors[sy * SECS + sx] = true;
  }
  const sectorSpecs: DistrictSpecId[] = Array<DistrictSpecId>(25).fill('general');

  return {
    name: '그랜드 스카이라인',
    money: 88000,
    day: 1,
    milestone: 0,
    sandboxUnlock: false,
    unlockedSectors,
    sectorSpecs,
    taxes: { R: 10, C: 10, I: 10, O: 10 },
    budgets: { util: 100, svc: 100 },
    loan: 0,
    policies: { free_transit: false, recycling: false, smoke_det: false, hightech: false },
    grid,
    demand: { R: 82, C: 48, I: 58 },
    stats: {
      population: 0,
      jobs: 0,
      education: 0,
      unemploymentPct: 0,
      eduTiers: [40, 30, 20, 10],
      goodsProduced: 0,
      goodsDemand: 0,
      goodsImported: 0,
      goodsExported: 0,
      outsideConnections: 3,
      problemCount: 0,
      roadHierarchyPct: 100,
      powerGen: 0,
      powerUse: 0,
      greenPowerPct: 0,
      waterGen: 0,
      waterUse: 0,
      waterPolluted: false,
      sewageGen: 0,
      sewageUse: 0,
      garbageCap: 0,
      garbageNeed: 0,
      trafficFlow: 100,
      happiness: 76,
      activeFires: 0,
      taxIncome: 0,
      upkeep: 0,
      netIncome: 0,
    },
    statsHistory: [],
    completedQuests: [],
    activeEvent: null,
    activeBuffs: [],
    nextEventDay: 14,
    chirp: 'Three.js 3D 엔진 탑재! 도로·수도관·송전선 자동 스냅과 회전교차로·특화 지구로 꿈의 메가폴리스를 건설하세요!',
  };
}

export function createDemoCity(): CityState {
  const s = createEmptyState(4.2);
  s.name = '네오 메가폴리스';
  s.money = 135000;
  s.day = 240;
  s.milestone = 4;
  s.unlockedSectors = Array<boolean>(25).fill(true);
  s.policies.recycling = true;
  s.policies.free_transit = true;

  // Assign strategic district specializations to showcase the system
  s.sectorSpecs[1 * SECS + 2] = 'tourism';     // Central CBD Skyline
  s.sectorSpecs[1 * SECS + 3] = 'it_hub';      // East Tech Office Valley
  s.sectorSpecs[0 * SECS + 1] = 'eco_garden';  // North Garden Suburbs
  s.sectorSpecs[3 * SECS + 2] = 'smart_port';  // South Harbor Logistics Port

  const put = (x: number, y: number, type: string, level = 1, withPipe = true) => {
    if (!inBounds(x, y)) return false;
    const t = s.grid[y][x];
    if (t.building?.locked) return false;
    if (t.terrain === 'water' && !isRoadType(type) && type !== 'power_line') return false;
    t.wildTree = false;
    t.building = { type, level, growth: 0, neglect: 0, abandoned: false, builtAt: 0 };
    if (ZONE_SPECS[type]) t.zone = type;
    if (withPipe && t.terrain !== 'water') t.pipe = true;
    return true;
  };

  const roadLine = (x0: number, y0: number, x1: number, y1: number, rType = 'road') => {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let cx = x0;
    let cy = y0;
    while (true) {
      put(cx, cy, rType, 1, true);
      if (s.grid[cy][cx].terrain === 'water') s.grid[cy][cx].pipe = true;
      if (cx === x1 && cy === y1) break;
      if (cx !== x1) cx += dx;
      else cy += dy;
    }
  };

  const fillDistrictBlock = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    step: number,
    types: string[],
    lvMin = 2,
    lvMax = 3
  ) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.grid[y][x];
        if (t.building?.locked) continue;
        const onGrid = (x - x0) % step === 0 || (y - y0) % step === 0 || x === x1 || y === y1;
        if (onGrid) {
          if (t.terrain !== 'water') put(x, y, 'road', 1, true);
        } else if (t.terrain !== 'water' && !t.isCoast) {
          const nearGrid =
            (x - x0) % step === 1 ||
            (x - x0) % step === step - 1 ||
            (y - y0) % step === 1 ||
            (y - y0) % step === step - 1 ||
            x === x1 - 1 ||
            y === y1 - 1;
          if (nearGrid) {
            const pick = types[(x * 7 + y * 13) % types.length];
            const lv = lvMin + ((x * 3 + y * 5) % (lvMax - lvMin + 1));
            put(x, y, pick, lv, true);
          } else if ((x + y) % 5 === 0) {
            put(x, y, 'park', 1, true);
          }
        }
      }
    }
  };

  // Grand Arterial 4-Lane Avenues & Bridges
  roadLine(24, 3, 24, 46, 'avenue');
  roadLine(46, 3, 46, 46, 'avenue');
  roadLine(4, 15, 53, 15, 'avenue');
  roadLine(12, 23, 53, 23, 'avenue');
  roadLine(4, 36, 52, 36, 'avenue');

  // District 1: Central Peninsula CBD
  fillDistrictBlock(16, 15, 33, 25, 5, ['com_high', 'res_high', 'com_high', 'office'], 2, 3);
  put(23, 18, 'landmark', 1);
  put(22, 18, 'park', 1);
  put(25, 18, 'park', 1);
  put(20, 16, 'hospital', 1);
  put(26, 16, 'fire_station', 1);
  put(28, 16, 'police_station', 1);
  put(19, 22, 'university', 1);
  put(26, 22, 'metro', 1);
  put(17, 16, 'metro', 1);

  // District 2: North Valley Garden Suburbs
  fillDistrictBlock(12, 5, 32, 14, 5, ['res_low', 'res_low', 'com_low', 'res_low'], 2, 3);
  put(18, 9, 'school', 1);
  put(29, 9, 'university', 1);
  put(26, 9, 'fire_station', 1);
  put(22, 9, 'bus_stop', 1);
  put(28, 13, 'metro', 1);

  // District 3: East Riverfront Tech Valley & Clean Energy Plateau
  fillDistrictBlock(42, 8, 55, 25, 5, ['office', 'office', 'com_high', 'res_high'], 2, 3);
  put(47, 14, 'metro', 1);
  put(47, 22, 'bus_stop', 1);
  put(45, 16, 'university', 1);
  put(48, 16, 'police_station', 1);
  put(50, 16, 'fire_station', 1);
  roadLine(46, 5, 56, 5, 'road');
  for (let x = 48; x <= 55; x++) put(x, 4, x < 53 ? 'solar' : 'wind', 1, true);
  for (let x = 50; x <= 55; x++) put(x, 6, 'wind', 1, true);

  // District 4: Southwest Confluence Waterfront Apartments
  fillDistrictBlock(8, 31, 22, 43, 5, ['res_high', 'res_low', 'com_low', 'res_high'], 2, 3);
  put(14, 35, 'school', 1);
  put(16, 40, 'university', 1);
  put(16, 35, 'hospital', 1);
  put(18, 35, 'fire_station', 1);
  put(12, 36, 'metro', 1);
  put(19, 39, 'bus_stop', 1);

  // District 5: Southern Harbor Industrial Port, Power & Waste Complex
  fillDistrictBlock(25, 36, 34, 46, 5, ['ind', 'ind', 'com_low'], 2, 3);
  fillDistrictBlock(42, 36, 53, 46, 5, ['ind', 'ind', 'ind'], 2, 3);
  put(28, 37, 'fire_station', 1);
  put(45, 37, 'fire_station', 1);
  put(30, 40, 'bus_stop', 1);
  put(47, 40, 'bus_stop', 1);
  roadLine(42, 46, 53, 46, 'road');
  put(43, 47, 'incinerator', 1);
  put(44, 47, 'incinerator', 1);
  put(45, 47, 'incinerator', 1);
  put(47, 47, 'incinerator', 1);
  put(49, 47, 'coal', 1);
  put(50, 47, 'coal', 1);
  put(51, 47, 'coal', 1);
  put(53, 47, 'landfill', 1);

  // Scenic Signature Roundabouts at Major Arterial Intersections!
  put(24, 15, 'roundabout', 1, true);
  put(24, 23, 'roundabout', 1, true);
  put(46, 23, 'roundabout', 1, true);

  // Upstream Clean Water Pumps (North y=5..10)
  let pumpsPlaced = 0;
  let lastPumpX = 35;
  let lastPumpY = 9;
  for (let y = 5; y <= 10 && pumpsPlaced < 5; y++) {
    for (let x = 32; x <= 40; x++) {
      if (s.grid[y][x].isCoast && !s.grid[y][x].building) {
        roadLine(24, y, x - 1, y, 'road');
        put(x, y, 'water_pump', 1, true);
        lastPumpX = x;
        lastPumpY = y;
        pumpsPlaced++;
        break;
      }
    }
  }
  for (let px = 29; px <= lastPumpX; px++) {
    if (inBounds(px, lastPumpY + 1) && s.grid[lastPumpY + 1][px].terrain !== 'water') {
      put(px, lastPumpY + 1, 'power_line', 1, true);
    }
  }

  // Downstream Harbor Sewage Treatment Plants (Far South y=48..54)
  let sewPlaced = 0;
  for (let y = 48; y <= 54 && sewPlaced < 5; y++) {
    for (let x = 33; x <= 44; x++) {
      if (s.grid[y][x].isCoast && !s.grid[y][x].building) {
        const hubX = x > 38 ? 46 : 28;
        const adjX = x > 38 ? x + 1 : x - 1;
        if (inBounds(adjX, y) && s.grid[y][adjX].terrain !== 'water') roadLine(hubX, y, adjX, y, 'road');
        put(x, y, 'sewage', 1, true);
        s.grid[y][x].pipe = true;
        for (let py = 46; py <= y; py++) {
          s.grid[py][hubX].pipe = true;
          if (!s.grid[py][hubX].building && s.grid[py][hubX].terrain !== 'water') {
            put(hubX, py, 'power_line', 1, true);
          }
        }
        const stepX = Math.sign(x - hubX) || 1;
        for (let px = hubX; px !== x; px += stepX) {
          s.grid[y][px].pipe = true;
          if (inBounds(px, y - 1) && !s.grid[y - 1][px].building && s.grid[y - 1][px].terrain !== 'water') {
            put(px, y - 1, 'power_line', 1, false);
          }
        }
        sewPlaced++;
        break;
      }
    }
  }

  // High-Voltage Power Lines + Sub-River Pipes connecting all 5 districts
  for (let x = 31; x <= 43; x++) {
    s.grid[15][x].pipe = true;
    if (!s.grid[14][x].building) put(x, 14, 'power_line', 1, false);
  }
  for (let x = 28; x <= 45; x++) {
    s.grid[36][x].pipe = true;
    if (!s.grid[45][x].building) put(x, 45, 'power_line', 1, false);
  }
  for (let y = 23; y <= 33; y++) {
    s.grid[y][24].pipe = true;
    if (!s.grid[y][16].building) put(16, y, 'power_line', 1, false);
  }

  // Seed smooth historical growth snapshots for the statistics chart
  for (let i = 15; i >= 1; i--) {
    const k = 1 - i * 0.032;
    s.statsHistory.push({
      day: 240 - i * 4,
      population: Math.round(12400 * k),
      netIncome: Math.round(78000 * (k - 0.08 + Math.sin(i) * 0.03)),
      happiness: Math.round(75 + (15 - i) * 0.45),
      trafficFlow: Math.round(79 + (15 - i) * 0.4),
    });
  }
  s.completedQuests = ['q_infra', 'q_roundabout', 'q_district', 'q_green'];
  s.nextEventDay = 248;

  return s;
}

export function saveCityState(state: CityState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* storage full or restricted */ }
}

export function loadCityState(): CityState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CityState;
    if (!parsed?.grid || parsed.grid.length !== GRID) return null;
    if (!parsed.sectorSpecs || parsed.sectorSpecs.length !== 25) {
      parsed.sectorSpecs = Array<DistrictSpecId>(25).fill('general');
    }
    if (!parsed.statsHistory) parsed.statsHistory = [];
    if (!parsed.completedQuests) parsed.completedQuests = [];
    if (!parsed.activeBuffs) parsed.activeBuffs = [];
    if (!parsed.nextEventDay) parsed.nextEventDay = (parsed.day || 1) + 12;
    computeCoastFlags(parsed.grid);
    return parsed;
  } catch {
    return null;
  }
}
