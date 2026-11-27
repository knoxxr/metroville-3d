import { DIRS, GRID, inBounds, isRoadType, playSound, setSoundEnabled, soundEnabled } from './sim/constants';
import { createDemoCity, createEmptyState, loadCityState, saveCityState } from './sim/state';
import {
  evaluateQuests,
  maintainVehicles,
  resolveEventChoice,
  runCitySimulation,
  simTick,
  updateVehicles,
  type SimRuntime,
} from './sim/simulation';
import { computeBrushPlan, executeSingleTile, getEffectiveBrushMode, isZoneTool } from './sim/builder';
import type { BrushMode, BrushPlan, Building, CityState, DistrictSpecId, InfoViewId, LightingMode, RoadDrawMode } from './sim/types';
import { ThreeEngine } from './engine/ThreeEngine';
import { HUDController } from './ui/hud';

interface UndoTileSnap {
  x: number;
  y: number;
  building: Building | null;
  zone: string | null;
  zoneProgress: number;
  pipe: boolean;
  wildTree: boolean;
  onFire: boolean;
}
interface UndoEntry {
  moneyBefore: number;
  tiles: UndoTileSnap[];
}

const canvas = document.getElementById('glCanvas') as HTMLCanvasElement;
const engine = new ThreeEngine(canvas);

let state: CityState = loadCityState() || createDemoCity();
let activeCategory = 'road';
let activeTool = 'inspect';
let trayOpen = false;
let touchCamMode: 'build' | 'pan' | 'orbit' = 'pan';
let brushMode: BrushMode = 'auto';
let roadDrawMode: RoadDrawMode = 'l_bend';
let snapEnabled = true;
let activeView: InfoViewId = 'none';
let manualView: InfoViewId = 'none';
let lightingMode: LightingMode = 'day';
let simSpeed = 1;
let selectedTile: { x: number; y: number } | null = null;
let hoverTile: { x: number; y: number } | null = null;
let dragStart: { x: number; y: number } | null = null;
let chainAnchor: { x: number; y: number } | null = null;
let currentPlan: BrushPlan | null = null;
let lastSnapKey = '';
let lastPointerX = 0;
let lastPointerY = 0;
const undoStack: UndoEntry[] = [];

const rt: SimRuntime = {
  vehicles: [],
  emergencyVehicles: [],
  activeRoutes: [],
  metroStations: [],
  animTime: 0,
  onChunkDirty: () => engine.markWorldDirty(false),
  onToast: (title, desc, kind) => hud.showToast(title, desc, kind),
  onMilestoneOrQuest: () => {
    hud.buildDockUI();
    hud.updateHUD();
  },
};

function isChainableTool(tool: string): boolean {
  const eff = getEffectiveBrushMode(tool, brushMode);
  return eff === 'line' && roadDrawMode !== 'upgrade';
}

function getEffectiveView(): InfoViewId {
  if (manualView !== 'none') return manualView;
  if (activeTool === 'water_pipe' || activeTool === 'water_pump' || activeTool === 'sewage') return 'water';
  if (activeTool === 'power_line' || activeTool === 'wind' || activeTool === 'coal' || activeTool === 'solar') return 'power';
  return 'none';
}

function syncViewAndWorld(withWater = false) {
  activeView = getEffectiveView();
  engine.markWorldDirty(withWater);
  hud.buildInfoViews();
}

function clearChain() {
  chainAnchor = null;
  dragStart = null;
  refreshPreview();
  hud.buildDockUI();
}

function performUndo() {
  const entry = undoStack.pop();
  if (!entry) return;
  state.money = entry.moneyBefore;
  for (const snap of entry.tiles) {
    const t = state.grid[snap.y][snap.x];
    t.building = snap.building ? { ...snap.building } : null;
    t.zone = snap.zone;
    t.zoneProgress = snap.zoneProgress;
    t.pipe = snap.pipe;
    t.wildTree = snap.wildTree;
    t.onFire = snap.onFire;
  }
  playSound('snap');
  runCitySimulation(state, rt);
  maintainVehicles(rt);
  engine.markWorldDirty(true);
  hud.buildDockUI();
  hud.updateHUD();
  hud.updateInspector();
  hud.renderMinimap(engine);
  saveCityState(state);
  hud.showToast('↩️ 실행 취소 완료', `이전 상태로 복원되었습니다. (남은 취소: ${undoStack.length}회)`, 'info');
}

const hud = new HUDController({
  getState: () => state,
  getActiveTool: () => activeTool,
  getActiveCategory: () => activeCategory,
  getActiveView: () => activeView,
  getBrushMode: () => brushMode,
  getRoadDrawMode: () => roadDrawMode,
  getSnapEnabled: () => snapEnabled,
  getTrayOpen: () => trayOpen,
  getChainActive: () => !!chainAnchor,
  getCanUndo: () => undoStack.length > 0,
  getTouchCamMode: () => touchCamMode,
  getLightingMode: () => lightingMode,
  getSimSpeed: () => simSpeed,
  getSelectedTile: () => selectedTile,

  onSelectCategory: (cat) => {
    if (trayOpen && activeCategory === cat) {
      trayOpen = false;
      activeTool = 'inspect';
      chainAnchor = null;
      syncViewAndWorld(false);
      refreshPreview();
      hud.buildDockUI();
      return;
    }
    trayOpen = true;
    touchCamMode = 'build';
    activeCategory = cat;
    const first =
      cat === 'road'
        ? 'road'
        : cat === 'zone'
          ? 'zone_res_low'
          : cat === 'util'
            ? 'water_pipe'
            : cat === 'svc'
              ? 'fire_station'
              : 'school';
    activeTool = first;
    chainAnchor = null;
    syncViewAndWorld(false);
    refreshPreview();
    hud.buildDockUI();
  },
  onSelectTool: (tool) => {
    activeTool = tool;
    chainAnchor = null;
    if (tool === 'inspect') {
      trayOpen = false;
    } else if (tool === 'bulldoze') {
      trayOpen = true;
      touchCamMode = 'build';
    } else {
      touchCamMode = 'build';
      selectedTile = null;
    }
    syncViewAndWorld(false);
    refreshPreview();
    hud.buildDockUI();
    hud.updateInspector();
  },
  onSelectView: (v) => {
    manualView = manualView === v ? 'none' : v;
    syncViewAndWorld(false);
  },
  onSelectBrush: (m) => {
    brushMode = m;
    chainAnchor = null;
    refreshPreview();
    hud.buildDockUI();
  },
  onSelectRoadDrawMode: (m) => {
    roadDrawMode = m;
    if (m === 'upgrade') chainAnchor = null;
    refreshPreview();
    hud.buildDockUI();
  },
  onSelectTouchCamMode: (m) => {
    touchCamMode = m;
    if (m !== 'build') dragStart = null;
    refreshPreview();
    hud.buildDockUI();
  },
  onCancelChain: () => {
    playSound('snap');
    clearChain();
  },
  onZoomStep: (dir) => {
    engine.cam.targetDist *= dir < 0 ? 0.78 : 1.28;
  },
  onToggleSnap: () => {
    snapEnabled = !snapEnabled;
    playSound('snap');
    refreshPreview();
    hud.buildDockUI();
  },
  onUndo: () => performUndo(),
  onSetSpeed: (s) => {
    simSpeed = s;
    hud.updateHUD();
  },
  onCycleLight: () => {
    const order: LightingMode[] = ['day', 'sunset', 'night', 'auto'];
    lightingMode = order[(order.indexOf(lightingMode) + 1) % order.length];
    hud.updateHUD();
  },
  onToggleSandbox: () => {
    state.sandboxUnlock = !state.sandboxUnlock;
    if (state.sandboxUnlock && state.money < 500000) state.money = 500000;
    engine.markWorldDirty(false);
    hud.buildDockUI();
    hud.updateHUD();
    hud.showToast(
      state.sandboxUnlock ? '🔓 샌드박스 모드 활성화' : '🔒 일반 모드 전환',
      state.sandboxUnlock ? '25개 전 구역 및 모든 고급 시설이 즉시 해금되었습니다!' : '마일스톤 및 부지 매입 규칙이 적용됩니다.',
      'info'
    );
  },
  onToggleSound: () => {
    setSoundEnabled(!soundEnabled);
    const btn = document.getElementById('btnSound');
    if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
  },
  onNewCity: () => {
    state = createEmptyState();
    undoStack.length = 0;
    chainAnchor = null;
    rt.vehicles = [];
    rt.emergencyVehicles = [];
    selectedTile = null;
    runCitySimulation(state, rt);
    maintainVehicles(rt);
    engine.cam.targetTx = -2;
    engine.cam.targetTz = -6;
    engine.cam.targetDist = 42;
    engine.markWorldDirty(true);
    hud.buildDockUI();
    hud.updateHUD();
    hud.updateInspector();
    hud.renderMinimap(engine);
    saveCityState(state);
    hud.showToast('🌱 새 도시 개척 시작!', '60×60 광역 지형에서 처음부터 메트로폴리스를 설계해 보세요!', 'success');
  },
  onDemoCity: () => {
    state = createDemoCity();
    undoStack.length = 0;
    chainAnchor = null;
    rt.vehicles = [];
    rt.emergencyVehicles = [];
    selectedTile = null;
    runCitySimulation(state, rt);
    maintainVehicles(rt);
    engine.cam.targetTx = -2;
    engine.cam.targetTz = -4;
    engine.cam.targetDist = 38;
    engine.markWorldDirty(true);
    hud.buildDockUI();
    hud.updateHUD();
    hud.updateInspector();
    hud.renderMinimap(engine);
    saveCityState(state);
    hud.showToast('🌆 네오 메가폴리스 로드 완료!', '시티즈 스타일 클릭-클릭 연속 시공과 우클릭 취소를 체험해 보세요!', 'success');
  },
  onResolveEvent: (pick) => {
    resolveEventChoice(state, rt, pick);
    hud.updateHUD();
    saveCityState(state);
  },
  onUpgradeTileRoad: (x, y, newType) => {
    const t = state.grid[y][x];
    const snap: UndoEntry = {
      moneyBefore: state.money,
      tiles: [{ x, y, building: t.building ? { ...t.building } : null, zone: t.zone, zoneProgress: t.zoneProgress, pipe: t.pipe, wildTree: t.wildTree, onFire: t.onFire }],
    };
    const res = executeSingleTile(state, x, y, newType, activeView, rt.animTime, true);
    if (res.applied) {
      undoStack.push(snap);
      if (undoStack.length > 15) undoStack.shift();
      playSound('build');
      runCitySimulation(state, rt);
      evaluateQuests(state, rt);
      engine.markWorldDirty(false);
      hud.buildDockUI();
      hud.updateHUD();
      hud.updateInspector();
      hud.renderMinimap(engine);
      saveCityState(state);
      hud.showToast('⬆️ 도로 업그레이드 완료!', `(${x + 1}, ${y + 1}) 도로가 개선되었습니다.`, 'success');
    } else if (res.reason) {
      playSound('error');
      hud.showToast('업그레이드 불가', res.reason, 'error');
    }
  },
  onToggleHistorical: (x, y) => {
    const b = state.grid[y]?.[x]?.building;
    if (!b) return;
    b.historical = !b.historical;
    playSound('snap');
    engine.markWorldDirty(false);
    hud.updateInspector();
    saveCityState(state);
    hud.showToast(
      b.historical ? '🏛️ 역사적 건물 보존 설정' : '🏛️ 역사적 건물 보존 해제',
      b.historical ? '현재 외관을 유지한 채 Lv.5까지 세수·인구가 성장합니다.' : '레벨에 따라 최신 고층 외관으로 자동 진화합니다.',
      'info'
    );
  },
  getRouteStats: (x, y) => {
    const t = state.grid[y]?.[x];
    const match = new Set<number>();
    if (t && isRoadType(t.building?.type)) {
      match.add(y * GRID + x);
    } else if (t?.building) {
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny) && isRoadType(state.grid[ny][nx].building?.type)) {
          match.add(ny * GRID + nx);
        }
      }
    }
    const res = { commute: 0, freight: 0, transit: 0, trade: 0 };
    if (match.size === 0) return res;
    for (const r of rt.activeRoutes) {
      let hit = false;
      for (let i = 0; i < r.path.length; i++) {
        if (match.has(r.path[i][1] * GRID + r.path[i][0])) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      const p = r.purpose || (r.kind === 'bus' ? 'transit' : r.kind === 'truck' ? 'freight' : 'commute');
      if (p === 'commute') res.commute++;
      else if (p === 'freight') res.freight++;
      else if (p === 'transit') res.transit++;
      else res.trade++;
    }
    return res;
  },
  onSyncSelection: () => {
    engine.updateRouteInspector(state, rt, selectedTile);
  },
  onBuySector: (secIdx) => {
    if (state.unlockedSectors[secIdx]) return;
    if (state.money < 12000) {
      playSound('error');
      hud.showToast('자금 부족', '광역 구역 매입에는 ₩12,000이 필요합니다.', 'error');
      return;
    }
    state.money -= 12000;
    state.unlockedSectors[secIdx] = true;
    playSound('milestone');
    engine.markWorldDirty(false);
    hud.updateHUD();
    hud.renderMinimap(engine);
    saveCityState(state);
    hud.showToast('🗺️ 광역 부지 확장 완료!', '새로운 12×12 구역 개발이 개방되었습니다!', 'success');
  },
  onSetSectorSpec: (secIdx, spec: DistrictSpecId) => {
    state.sectorSpecs[secIdx] = spec;
    playSound('build');
    runCitySimulation(state, rt);
    evaluateQuests(state, rt);
    engine.markWorldDirty(false);
    hud.updateHUD();
    hud.updateInspector();
    saveCityState(state);
  },
  onTogglePolicy: (id) => {
    state.policies[id] = !state.policies[id];
    playSound('zone');
    runCitySimulation(state, rt);
    hud.updateHUD();
    saveCityState(state);
  },
  onTaxChange: (k, val) => {
    state.taxes[k] = val;
    runCitySimulation(state, rt);
    hud.updateHUD();
  },
  onBudgetChange: (k, val) => {
    state.budgets[k] = val;
    runCitySimulation(state, rt);
    hud.updateHUD();
  },
  onTakeLoan: () => {
    if (state.loan >= 100000) {
      playSound('error');
      hud.showToast('대출 한도 초과', '최대 ₩100,000까지만 대출 가능합니다.', 'warn');
      return;
    }
    state.loan += 25000;
    state.money += 25000;
    playSound('milestone');
    runCitySimulation(state, rt);
    hud.updateHUD();
    saveCityState(state);
  },
  onCloseInspector: () => {
    selectedTile = null;
    hud.updateInspector();
  },
  onJumpCamera: (gx, gy) => {
    engine.cam.targetTx = gx - GRID / 2 + 0.5;
    engine.cam.targetTz = gy - GRID / 2 + 0.5;
  },
  onFocusTile: (gx, gy) => {
    if (!inBounds(gx, gy)) return;
    engine.cam.targetTx = gx - GRID / 2 + 0.5;
    engine.cam.targetTz = gy - GRID / 2 + 0.5;
    engine.cam.targetDist = Math.min(engine.cam.targetDist, 22);
    selectedTile = { x: gx, y: gy };
    playSound('snap');
    hud.updateInspector();
  },
  onCamPreset: (preset) => {
    if (preset === 'close') {
      engine.cam.targetDist = 18;
      engine.cam.targetPitch = 0.45;
    } else {
      engine.cam.targetDist = 84;
      engine.cam.targetPitch = 1.18;
      engine.cam.targetTx = 0;
      engine.cam.targetTz = 0;
    }
  },
});

// ==================== CITIES: SKYLINES POINTER & CAMERA CONTROLS ====================
let isOrbiting = false;
let orbitMovedPx = 0;
let orbitButton = -1;
let lastOrbitX = 0;
let lastOrbitY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let lastClickTime = 0;
let lastClickKey = '';
const pressedKeys = new Set<string>();

function refreshPreview() {
  if (!hoverTile || activeTool === 'inspect') {
    currentPlan = null;
    engine.updateLivePreview(state, activeTool, null, null, null);
    hud.updateCursorHudTag(0, 0, null, activeTool);
    return;
  }
  const anchor = chainAnchor || dragStart;
  const sx = anchor ? anchor.x : hoverTile.x;
  const sy = anchor ? anchor.y : hoverTile.y;
  currentPlan = computeBrushPlan(
    state,
    activeTool,
    brushMode,
    sx,
    sy,
    hoverTile.x,
    hoverTile.y,
    roadDrawMode,
    snapEnabled
  );
  engine.updateLivePreview(state, activeTool, hoverTile, currentPlan, anchor);
  hud.updateCursorHudTag(lastPointerX, lastPointerY, currentPlan, activeTool);

  if (currentPlan.snapEnd.snapped) {
    const sk = `${currentPlan.snapEnd.x},${currentPlan.snapEnd.y},${currentPlan.snapEnd.kind}`;
    if (sk !== lastSnapKey) {
      lastSnapKey = sk;
      playSound('snap');
    }
  } else {
    lastSnapKey = '';
  }
}

function applyPlan(plan: BrushPlan): boolean {
  // Capture undo snapshot before mutating tiles
  const undoEntry: UndoEntry = {
    moneyBefore: state.money,
    tiles: plan.items.map(it => {
      const t = state.grid[it.y][it.x];
      return {
        x: it.x,
        y: it.y,
        building: t.building ? { ...t.building } : null,
        zone: t.zone,
        zoneProgress: t.zoneProgress,
        pipe: t.pipe,
        wildTree: t.wildTree,
        onFire: t.onFire,
      };
    }),
  };

  let appliedCount = 0;
  let lastReason = '';
  let touchedWater = false;
  for (const it of plan.items) {
    const res = executeSingleTile(
      state,
      it.x,
      it.y,
      it.tool,
      activeView,
      rt.animTime,
      !!it.withPipe,
      !!it.ignoreRoadCheck
    );
    if (res.applied) {
      appliedCount++;
      if (it.tool === 'sewage' || it.tool === 'water_pump') touchedWater = true;
    } else if (res.reason) {
      lastReason = res.reason;
    }
  }

  if (appliedCount > 0) {
    undoStack.push(undoEntry);
    if (undoStack.length > 15) undoStack.shift();
    playSound(activeTool === 'bulldoze' ? 'bulldoze' : isZoneTool(activeTool) ? 'zone' : 'build');
    runCitySimulation(state, rt);
    evaluateQuests(state, rt);
    maintainVehicles(rt);
    engine.markWorldDirty(touchedWater);
    hud.buildDockUI();
    hud.updateHUD();
    hud.updateInspector();
    hud.renderMinimap(engine);
    saveCityState(state);
    return true;
  } else if (lastReason) {
    playSound('error');
    hud.showToast('건설 불가', lastReason, 'warn');
  }
  return false;
}

const activeTouches = new Map<number, { x: number; y: number }>();
let isPinching = false;
let prevPinchDist = 0;
let prevPinchMidX = 0;
let prevPinchMidY = 0;
let prevPinchAngle = 0;
let touchPanMovedPx = 0;
let inspectTapCandidate: { x: number; y: number } | null = null;

function panCameraByScreenDelta(dx: number, dy: number) {
  const scale = engine.cam.dist * 0.0024;
  const cos = Math.cos(engine.cam.yaw);
  const sin = Math.sin(engine.cam.yaw);
  engine.cam.targetTx -= (dx * cos + dy * sin) * scale;
  engine.cam.targetTz -= (-dx * sin + dy * cos) * scale;
}

function getPinchMetrics() {
  const pts = Array.from(activeTouches.values());
  const a = pts[0];
  const b = pts[1];
  return {
    dist: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y)),
    midX: (a.x + b.x) * 0.5,
    midY: (a.y + b.y) * 0.5,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  // Track touch pointers for 2-finger pinch-to-zoom, pan & twist!
  if (e.pointerType === 'touch') {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (activeTouches.size >= 2) {
      isPinching = true;
      isPanning = false;
      isOrbiting = false;
      dragStart = null;
      inspectTapCandidate = null;
      const m = getPinchMetrics();
      prevPinchDist = m.dist;
      prevPinchMidX = m.midX;
      prevPinchMidY = m.midY;
      prevPinchAngle = m.angle;
      refreshPreview();
      return;
    }
  }

  // Mobile 1-finger Orbit mode OR Desktop Right/Middle/Shift Drag = Orbit & Tilt!
  if (e.button === 2 || e.button === 1 || e.shiftKey || (e.pointerType === 'touch' && touchCamMode === 'orbit')) {
    isOrbiting = true;
    orbitMovedPx = 0;
    orbitButton = e.button;
    lastOrbitX = e.clientX;
    lastOrbitY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    return;
  }

  // Default Move/Inspect Mode OR Alt+Drag OR Mobile Pan = Smooth Camera Pan (short click inspects tile!)
  if (
    (e.button === 0 && (e.altKey || activeTool === 'inspect')) ||
    (e.pointerType === 'touch' && touchCamMode === 'pan')
  ) {
    isPanning = true;
    touchPanMovedPx = 0;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    inspectTapCandidate = activeTool === 'inspect' ? engine.screenToGrid(e.clientX, e.clientY) : null;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    return;
  }

  if (e.button !== 0) return;
  const gPos = engine.screenToGrid(e.clientX, e.clientY);
  if (!gPos) return;
  hoverTile = gPos;

  dragStart = gPos;
  refreshPreview();
});

canvas.addEventListener('pointermove', (e) => {
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isPinching && activeTouches.size >= 2) {
      const m = getPinchMetrics();
      // 1. Pinch-to-Zoom
      const ratio = prevPinchDist / m.dist;
      engine.cam.targetDist *= Math.max(0.82, Math.min(1.22, ratio));
      // 2. Two-finger Pan
      panCameraByScreenDelta(m.midX - prevPinchMidX, m.midY - prevPinchMidY);
      // 3. Two-finger Twist Orbit
      let dAng = m.angle - prevPinchAngle;
      if (dAng > Math.PI) dAng -= Math.PI * 2;
      if (dAng < -Math.PI) dAng += Math.PI * 2;
      if (Math.abs(dAng) < 0.4) engine.cam.targetYaw -= dAng * 0.85;

      prevPinchDist = m.dist;
      prevPinchMidX = m.midX;
      prevPinchMidY = m.midY;
      prevPinchAngle = m.angle;
      return;
    }
  }

  if (isPanning) {
    const dx = e.clientX - lastPanX;
    const dy = e.clientY - lastPanY;
    touchPanMovedPx += Math.hypot(dx, dy);
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    panCameraByScreenDelta(dx, dy);
    return;
  }

  if (isOrbiting) {
    const dx = e.clientX - lastOrbitX;
    const dy = e.clientY - lastOrbitY;
    orbitMovedPx += Math.hypot(dx, dy);
    lastOrbitX = e.clientX;
    lastOrbitY = e.clientY;
    engine.cam.targetYaw -= dx * 0.007;
    engine.cam.targetPitch += dy * 0.006;
    return;
  }

  const gPos = engine.screenToGrid(e.clientX, e.clientY);
  if (gPos && (!hoverTile || gPos.x !== hoverTile.x || gPos.y !== hoverTile.y)) {
    hoverTile = gPos;
    refreshPreview();
  } else if (!gPos) {
    hoverTile = null;
    refreshPreview();
  } else if (currentPlan) {
    hud.updateCursorHudTag(lastPointerX, lastPointerY, currentPlan, activeTool);
  }
});

function handlePointerEnd(e: PointerEvent, canceled = false) {
  if (e.pointerType === 'touch') {
    activeTouches.delete(e.pointerId);
    if (isPinching) {
      if (activeTouches.size < 2) isPinching = false;
      return;
    }
  }

  if (isPanning) {
    const wasShortInspectTap = !canceled && touchPanMovedPx < 10 && inspectTapCandidate && activeTool === 'inspect';
    isPanning = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasShortInspectTap && inspectTapCandidate) {
      selectedTile = inspectTapCandidate;
      hud.updateInspector();
    }
    inspectTapCandidate = null;
    return;
  }

  if (isOrbiting) {
    const wasShortRightClick = !canceled && orbitButton === 2 && orbitMovedPx < 6;
    isOrbiting = false;
    orbitButton = -1;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    if (wasShortRightClick) {
      if (chainAnchor) {
        playSound('snap');
        clearChain();
      } else if (activeTool !== 'inspect') {
        playSound('snap');
        activeTool = 'inspect';
        trayOpen = false;
        syncViewAndWorld(false);
        refreshPreview();
        hud.buildDockUI();
      } else if (selectedTile) {
        selectedTile = null;
        hud.updateInspector();
      }
    }
    return;
  }

  if (!canceled && dragStart && hoverTile && currentPlan) {
    const sameTileClick = dragStart.x === hoverTile.x && dragStart.y === hoverTile.y;

    if (isChainableTool(activeTool)) {
      if (!chainAnchor && sameTileClick) {
        chainAnchor = { x: currentPlan.startX, y: currentPlan.startY };
        playSound('snap');
        dragStart = null;
        refreshPreview();
        hud.buildDockUI();
        return;
      } else if (chainAnchor) {
        const endX = currentPlan.endX;
        const endY = currentPlan.endY;
        const ok = applyPlan(currentPlan);
        chainAnchor = ok ? { x: endX, y: endY } : null;
        dragStart = null;
        refreshPreview();
        hud.buildDockUI();
        return;
      } else {
        applyPlan(currentPlan);
        chainAnchor = null;
        dragStart = null;
        refreshPreview();
        return;
      }
    }

    applyPlan(currentPlan);
  }
  dragStart = null;
  refreshPreview();
}

canvas.addEventListener('pointerup', (e) => handlePointerEnd(e, false));
canvas.addEventListener('pointercancel', (e) => handlePointerEnd(e, true));

canvas.addEventListener('pointerleave', () => {
  if (!dragStart && !chainAnchor) {
    hoverTile = null;
    refreshPreview();
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    engine.cam.targetDist *= 1 + Math.sign(e.deltaY) * 0.11;
  },
  { passive: false }
);

window.addEventListener('resize', () => engine.resize());

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();

  // Ctrl+Z Undo!
  if ((e.ctrlKey || e.metaKey) && k === 'z') {
    e.preventDefault();
    performUndo();
    return;
  }

  if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'z', 'x', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    pressedKeys.add(k);
  }
  if (e.code === 'Space') {
    e.preventDefault();
    simSpeed = simSpeed === 0 ? 1 : 0;
    hud.updateHUD();
  } else if (k === 'i') {
    hud.toggleInfoViews();
  } else if (k === 'm') {
    hud.toggleMinimap();
  } else if (k === 'g') {
    snapEnabled = !snapEnabled;
    playSound('snap');
    refreshPreview();
    hud.buildDockUI();
  } else if (k === 'v') {
    activeTool = 'inspect';
    trayOpen = false;
    chainAnchor = null;
    syncViewAndWorld(false);
    refreshPreview();
    hud.buildDockUI();
  } else if (k === 'b') {
    activeTool = 'bulldoze';
    trayOpen = true;
    chainAnchor = null;
    syncViewAndWorld(false);
    refreshPreview();
    hud.buildDockUI();
  } else if (k === '1') {
    simSpeed = 1;
    hud.updateHUD();
  } else if (k === '2') {
    simSpeed = 2;
    hud.updateHUD();
  } else if (k === '3') {
    simSpeed = 3;
    hud.updateHUD();
  } else if (k === 'escape') {
    if (chainAnchor) {
      clearChain();
    } else {
      dragStart = null;
      refreshPreview();
      hud.closeModal('modalEconomy');
      hud.closeModal('modalSectors');
      hud.closeModal('modalPolicies');
    }
  }
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.key.toLowerCase());
});

// ==================== BOOT & MAIN GAME LOOP ====================
runCitySimulation(state, rt);
maintainVehicles(rt);
syncViewAndWorld(true);
hud.buildDockUI();
hud.updateHUD();
hud.renderMinimap(engine);

let lastTime = performance.now();
let simAccum = 0;
let minimapAccum = 0;

function loop(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  rt.animTime += dt;

  engine.updateCamera(dt, pressedKeys);
  updateVehicles(state, rt, dt, simSpeed);

  if (simSpeed > 0) {
    const tickInterval = simSpeed === 1 ? 2.4 : simSpeed === 2 ? 1.15 : 0.45;
    simAccum += dt;
    if (simAccum >= tickInterval) {
      simAccum = 0;
      simTick(state, rt);
      engine.refreshProblemIcons(state);
      hud.updateHUD();
      hud.updateInspector();
      if (state.day % 5 === 0) saveCityState(state);
    }
  }

  minimapAccum += dt;
  if (minimapAccum >= 0.4) {
    minimapAccum = 0;
    hud.renderMinimap(engine);
  }

  engine.renderFrame(state, rt, activeView, activeTool, lightingMode, rt.animTime);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
