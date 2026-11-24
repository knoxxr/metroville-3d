import { QUESTS, TOOL_MAP, playSound } from './sim/constants';
import { createDemoCity } from './sim/state';
import { evaluateQuests, maintainVehicles, runCitySimulation, simTick, updateVehicles, type SimRuntime } from './sim/simulation';
import { computeBrushPlan, executeSingleTile, isZoneTool } from './sim/builder';
import type { BrushPlan, InfoViewId, LightingMode } from './sim/types';
import { ThreeEngine } from './engine/ThreeEngine';

const canvas = document.getElementById('inlineCanvas') as HTMLCanvasElement;
const engine = new ThreeEngine(canvas);
engine.cam.tx = -3;
engine.cam.tz = -5;
engine.cam.targetTx = -3;
engine.cam.targetTz = -5;
engine.cam.dist = 28;
engine.cam.targetDist = 28;
engine.cam.pitch = 0.62;
engine.cam.targetPitch = 0.62;

const state = createDemoCity();
let activeTool = 'road';
let manualView: InfoViewId = 'none';
let activeView: InfoViewId = 'none';
let lightingMode: LightingMode = 'sunset';
let hoverTile: { x: number; y: number } | null = null;
let dragStart: { x: number; y: number } | null = null;
let currentPlan: BrushPlan | null = null;
let isOrbiting = false;
let lastOX = 0;
let lastOY = 0;
let lastPX = 0;
let lastPY = 0;

const QUICK_TOOLS = [
  { id: 'road', label: '🛣️ 도로' },
  { id: 'avenue', label: '🛤️ 대로' },
  { id: 'roundabout', label: '🔄 로터리' },
  { id: 'water_pipe', label: '🔧 수도관' },
  { id: 'power_line', label: '🗼 송전선' },
  { id: 'zone_res_high', label: '🏢 주거' },
  { id: 'zone_com_high', label: '🏬 상업' },
  { id: 'city_block', label: '📐 단지' },
  { id: 'bulldoze', label: '🚜 철거' },
];

const rt: SimRuntime = {
  vehicles: [],
  emergencyVehicles: [],
  activeRoutes: [],
  metroStations: [],
  animTime: 0,
  onChunkDirty: () => engine.markWorldDirty(false),
  onToast: (t, d) => {
    const st = document.getElementById('iStatus');
    if (st) st.textContent = `${t} ${d}`;
  },
  onMilestoneOrQuest: () => updateStats(),
};

function syncView() {
  if (manualView !== 'none') activeView = manualView;
  else if (activeTool === 'water_pipe') activeView = 'water';
  else if (activeTool === 'power_line') activeView = 'power';
  else activeView = 'none';
  engine.markWorldDirty(false);
  const vBtn = document.getElementById('iView');
  if (vBtn) {
    const labels: Record<string, string> = { none: '👁️ 기본', power: '⚡ 전력망', water: '💧 수도관', traffic: '🚗 교통', district: '🏘️ 특화지구' };
    vBtn.textContent = labels[activeView] || '👁️ 기본';
  }
}

function renderTools() {
  const box = document.getElementById('iTools');
  if (!box) return;
  box.innerHTML = '';
  for (const t of QUICK_TOOLS) {
    const b = document.createElement('button');
    b.className = `i-btn px-2 py-1 rounded-lg border border-[var(--card-border)] hover:bg-white/10 transition text-xs ${t.id === activeTool ? 'active' : ''}`;
    b.textContent = t.label;
    b.addEventListener('click', () => {
      activeTool = t.id;
      manualView = 'none';
      syncView();
      renderTools();
      const st = document.getElementById('iStatus');
      if (st && TOOL_MAP[t.id]) st.textContent = TOOL_MAP[t.id].desc;
    });
    box.appendChild(b);
  }
}

function updateStats() {
  const pop = document.getElementById('iPop');
  const mon = document.getElementById('iMoney');
  const trf = document.getElementById('iTrf');
  const qEl = document.getElementById('iQuest');
  if (pop) pop.textContent = `${state.stats.population.toLocaleString()}명`;
  if (mon) mon.textContent = `₩${Math.round(state.money).toLocaleString()}`;
  if (trf) trf.textContent = `🚗 ${state.stats.trafficFlow}%`;
  const nextQ = QUESTS.find(q => !state.completedQuests.includes(q.id));
  if (qEl && nextQ) qEl.textContent = `🎯 ${nextQ.title}: ${nextQ.check(state).label}`;
}

document.getElementById('iLight')?.addEventListener('click', () => {
  const order: LightingMode[] = ['day', 'sunset', 'night', 'auto'];
  lightingMode = order[(order.indexOf(lightingMode) + 1) % order.length];
  const labels: Record<LightingMode, string> = { day: '☀️ 낮', sunset: '🌇 노을', night: '🌃 야경', auto: '🕒 자동' };
  const btn = document.getElementById('iLight');
  if (btn) btn.textContent = labels[lightingMode];
});

document.getElementById('iView')?.addEventListener('click', () => {
  const order: InfoViewId[] = ['none', 'power', 'water', 'traffic', 'district'];
  manualView = order[(order.indexOf(manualView) + 1) % order.length];
  syncView();
});

let chainAnchor: { x: number; y: number } | null = null;
let orbitMoved = 0;
let orbitBtn = -1;

function refreshPreview() {
  const tag = document.getElementById('iCursorTag');
  if (!hoverTile) {
    currentPlan = null;
    engine.updateLivePreview(state, activeTool, null, null, null);
    tag?.classList.add('hidden');
    return;
  }
  const anchor = chainAnchor || dragStart;
  const sx = anchor ? anchor.x : hoverTile.x;
  const sy = anchor ? anchor.y : hoverTile.y;
  currentPlan = computeBrushPlan(state, activeTool, 'auto', sx, sy, hoverTile.x, hoverTile.y, 'l_bend', true);
  engine.updateLivePreview(state, activeTool, hoverTile, currentPlan, anchor);

  if (tag) {
    const def = TOOL_MAP[activeTool];
    const main = document.getElementById('iTagMain');
    const sub = document.getElementById('iTagSub');
    if (main) main.textContent = `${def?.icon || ''} ${def?.name || activeTool} ${currentPlan.length > 1 ? currentPlan.meters + 'm ' : ''}₩${currentPlan.estCost.toLocaleString()}`;
    if (sub) sub.textContent = currentPlan.connectionNote || (chainAnchor ? '클릭: 연속 시공 · 우클릭: 종료' : `적용 가능 ${currentPlan.validCount}타일`);
    const rect = canvas.getBoundingClientRect();
    tag.style.left = `${Math.min(rect.width - 175, Math.max(8, lastPX - rect.left + 14))}px`;
    tag.style.top = `${Math.max(8, lastPY - rect.top - 42)}px`;
    tag.classList.remove('hidden');
  }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  lastPX = e.clientX;
  lastPY = e.clientY;
  if (e.button === 2 || e.button === 1 || e.shiftKey) {
    isOrbiting = true;
    orbitMoved = 0;
    orbitBtn = e.button;
    lastOX = e.clientX;
    lastOY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
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
  lastPX = e.clientX;
  lastPY = e.clientY;
  if (isOrbiting) {
    const dx = e.clientX - lastOX;
    const dy = e.clientY - lastOY;
    orbitMoved += Math.hypot(dx, dy);
    engine.cam.targetYaw -= dx * 0.008;
    engine.cam.targetPitch += dy * 0.006;
    lastOX = e.clientX;
    lastOY = e.clientY;
    return;
  }
  const gPos = engine.screenToGrid(e.clientX, e.clientY);
  if (gPos && (!hoverTile || gPos.x !== hoverTile.x || gPos.y !== hoverTile.y)) {
    hoverTile = gPos;
    refreshPreview();
  } else if (!gPos) {
    hoverTile = null;
    refreshPreview();
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (isOrbiting) {
    const shortRight = orbitBtn === 2 && orbitMoved < 6;
    isOrbiting = false;
    orbitBtn = -1;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (shortRight && chainAnchor) {
      chainAnchor = null;
      playSound('snap');
      refreshPreview();
    }
    return;
  }
  if (dragStart && hoverTile && currentPlan) {
    const isLine = activeTool === 'road' || activeTool === 'avenue' || activeTool === 'water_pipe' || activeTool === 'power_line';
    const sameTile = dragStart.x === hoverTile.x && dragStart.y === hoverTile.y;
    if (isLine && !chainAnchor && sameTile) {
      chainAnchor = { x: currentPlan.startX, y: currentPlan.startY };
      playSound('snap');
      dragStart = null;
      refreshPreview();
      return;
    }
    let applied = 0;
    for (const it of currentPlan.items) {
      const r = executeSingleTile(state, it.x, it.y, it.tool, activeView, rt.animTime, !!it.withPipe, !!it.ignoreRoadCheck);
      if (r.applied) applied++;
    }
    if (applied > 0) {
      playSound(activeTool === 'bulldoze' ? 'bulldoze' : isZoneTool(activeTool) ? 'zone' : 'build');
      runCitySimulation(state, rt);
      evaluateQuests(state, rt);
      maintainVehicles(rt);
      engine.markWorldDirty(false);
      updateStats();
    }
    chainAnchor = isLine && chainAnchor && applied > 0 ? { x: currentPlan.endX, y: currentPlan.endY } : null;
  }
  dragStart = null;
  refreshPreview();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  engine.cam.targetDist *= 1 + Math.sign(e.deltaY) * 0.1;
}, { passive: false });

window.addEventListener('resize', () => engine.resize());

runCitySimulation(state, rt);
maintainVehicles(rt);
syncView();
renderTools();
updateStats();
const lightBtn = document.getElementById('iLight');
if (lightBtn) lightBtn.textContent = '🌇 노을';

let lastT = performance.now();
let simAcc = 0;
const emptyKeys = new Set<string>();

function loop(now: number) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  rt.animTime += dt;
  engine.updateCamera(dt, emptyKeys);
  updateVehicles(state, rt, dt, 1);
  simAcc += dt;
  if (simAcc >= 2.6) {
    simAcc = 0;
    simTick(state, rt);
    updateStats();
  }
  engine.renderFrame(state, rt, activeView, activeTool, lightingMode, rt.animTime);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
