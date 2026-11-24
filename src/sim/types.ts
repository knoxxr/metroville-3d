export type TerrainType = 'grass' | 'sand' | 'water';
export type InfoViewId =
  | 'none'
  | 'power'
  | 'water'
  | 'traffic'
  | 'fire'
  | 'police'
  | 'health'
  | 'edu'
  | 'garbage'
  | 'landvalue'
  | 'district';

export type DistrictSpecId = 'general' | 'it_hub' | 'eco_garden' | 'tourism' | 'smart_port';
export type LightingMode = 'day' | 'sunset' | 'night' | 'auto';
export type BrushMode = 'auto' | 'free' | 'box' | 'grid';
export type RoadDrawMode = 'straight' | 'l_bend' | 'curve' | 'upgrade';

export interface Building {
  type: string;
  level: number;
  growth?: number;
  neglect?: number;
  abandoned?: boolean;
  locked?: boolean;
  builtAt?: number;
}

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  elev: number;
  hash: number;
  wildTree: boolean;
  isCoast: boolean;
  pipe: boolean;
  zone: string | null;
  zoneProgress: number;
  building: Building | null;
  hasRoad: boolean;
  powerBlob: boolean;
  powered: boolean;
  powerIsland: number;
  hasWater: boolean;
  waterPolluted: boolean;
  hasSewage: boolean;
  waterPollution: number;
  fireCov: number;
  policeCov: number;
  healthCov: number;
  eduCov: number;
  garbageCov: number;
  crime: number;
  garbageAccum: number;
  sick: boolean;
  onFire: boolean;
  fireTimer: number;
  pollution: number;
  noise: number;
  landValue: number;
  happiness: number;
  trafficLoad: number;
  congestion: number;
  adjCongestion: number;
  nearTransit: boolean;
}

export interface CityStats {
  population: number;
  jobs: number;
  education: number;
  powerGen: number;
  powerUse: number;
  greenPowerPct: number;
  waterGen: number;
  waterUse: number;
  waterPolluted: boolean;
  sewageGen: number;
  sewageUse: number;
  garbageCap: number;
  garbageNeed: number;
  trafficFlow: number;
  happiness: number;
  activeFires: number;
  taxIncome: number;
  upkeep: number;
  netIncome: number;
}

export interface StatsSnapshot {
  day: number;
  population: number;
  netIncome: number;
  happiness: number;
  trafficFlow: number;
}

export interface ActiveEvent {
  id: string;
  title: string;
  icon: string;
  desc: string;
  choiceA: { label: string; cost: number; desc: string };
  choiceB: { label: string; cost: number; desc: string };
}

export interface ActiveBuff {
  id: string;
  name: string;
  icon: string;
  daysLeft: number;
  powerMult?: number;
  taxMult?: number;
  happyBonus?: number;
  trafficBonus?: number;
}

export interface CityState {
  name: string;
  money: number;
  day: number;
  milestone: number;
  sandboxUnlock: boolean;
  unlockedSectors: boolean[];
  sectorSpecs: DistrictSpecId[];
  taxes: { R: number; C: number; I: number; O: number };
  budgets: { util: number; svc: number };
  loan: number;
  policies: Record<string, boolean>;
  grid: Tile[][];
  demand: { R: number; C: number; I: number };
  stats: CityStats;
  statsHistory: StatsSnapshot[];
  completedQuests: string[];
  activeEvent: ActiveEvent | null;
  activeBuffs: ActiveBuff[];
  nextEventDay: number;
  chirp: string;
}

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  bridgeCost?: number;
  cat: string;
  ms: number;
  key?: string;
  upkeep?: number;
  cap?: number;
  spd?: number;
  noise?: number;
  powerUse?: number;
  waterUse?: number;
  powerGen?: number;
  waterGen?: number;
  sewageGen?: number;
  garbageCap?: number;
  pollution?: number;
  coastOnly?: boolean;
  svc?: string;
  eduBoost?: number;
  radius?: number;
  happyAura?: number;
  lvAura?: number;
  taxBase?: number;
  zCol?: string;
  desc: string;
}

export interface ZoneSpec {
  group: 'R' | 'C' | 'I';
  name: string;
  power: number;
  water: number;
  garbage: number;
  pop?: number;
  jobs?: number;
  tax: number;
  traffic: number;
  noise?: number;
  pollution?: number;
  needEdu?: number;
  density: number;
}

export interface BrushPlanItem {
  x: number;
  y: number;
  tool: string;
  withPipe?: boolean;
  ignoreRoadCheck?: boolean;
  ok?: boolean;
}

export interface SnapInfo {
  x: number;
  y: number;
  snapped: boolean;
  kind: 'none' | 'road' | 'pipe' | 'power' | 'coast';
  label: string;
}

export interface BrushPlan {
  mode: string;
  items: BrushPlanItem[];
  validCount: number;
  estCost: number;
  length: number;
  meters: number;
  angleDeg: number;
  hasTurn: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  snapStart: SnapInfo;
  snapEnd: SnapInfo;
  connectionNote: string;
}

export interface RouteInfo {
  path: [number, number][];
  kind: 'car' | 'truck' | 'bus';
}

export interface Vehicle {
  path: [number, number][];
  idx: number;
  t: number;
  speed: number;
  kind: 'car' | 'truck' | 'bus';
  color: number;
  lane: number;
}

export interface EmergencyVehicle {
  path: [number, number][];
  idx: number;
  t: number;
  kind: 'fire' | 'police' | 'ambulance';
  targetX: number;
  targetY: number;
}
