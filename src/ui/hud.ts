import {
  CATEGORIES,
  DISTRICT_SPECS,
  DISTRICT_SPEC_MAP,
  GRID,
  INFO_VIEWS,
  MILESTONES,
  POLICIES,
  QUESTS,
  SECS,
  SECTOR,
  TOOL_MAP,
  TOOLS,
  ZONE_SPECS,
  isRoadType,
  sectorIdx,
} from '../sim/constants';
import { isToolUnlocked, isZoneTool } from '../sim/builder';
import type { BrushMode, BrushPlan, CityState, DistrictSpecId, InfoViewId, LightingMode, RoadDrawMode } from '../sim/types';
import type { ThreeEngine } from '../engine/ThreeEngine';

export interface HUDCallbacks {
  getState: () => CityState;
  getActiveTool: () => string;
  getActiveCategory: () => string;
  getActiveView: () => InfoViewId;
  getBrushMode: () => BrushMode;
  getRoadDrawMode: () => RoadDrawMode;
  getSnapEnabled: () => boolean;
  getTrayOpen: () => boolean;
  getChainActive: () => boolean;
  getCanUndo: () => boolean;
  getTouchCamMode: () => 'build' | 'pan' | 'orbit';
  getLightingMode: () => LightingMode;
  getSimSpeed: () => number;
  getSelectedTile: () => { x: number; y: number } | null;
  onSelectCategory: (cat: string) => void;
  onSelectTool: (tool: string) => void;
  onSelectView: (v: InfoViewId) => void;
  onSelectBrush: (m: BrushMode) => void;
  onSelectRoadDrawMode: (m: RoadDrawMode) => void;
  onSelectTouchCamMode: (m: 'build' | 'pan' | 'orbit') => void;
  onCancelChain: () => void;
  onZoomStep: (dir: number) => void;
  onToggleSnap: () => void;
  onUndo: () => void;
  onSetSpeed: (s: number) => void;
  onCycleLight: () => void;
  onToggleSandbox: () => void;
  onToggleSound: () => void;
  onNewCity: () => void;
  onDemoCity: () => void;
  onResolveEvent: (pick: 'A' | 'B') => void;
  onUpgradeTileRoad: (x: number, y: number, newType: string) => void;
  onToggleHistorical: (x: number, y: number) => void;
  getRouteStats: (x: number, y: number) => { commute: number; freight: number; transit: number; trade: number };
  onSyncSelection: () => void;
  onBuySector: (secIdx: number) => void;
  onSetSectorSpec: (secIdx: number, spec: DistrictSpecId) => void;
  onTogglePolicy: (id: string) => void;
  onTaxChange: (k: 'R' | 'C' | 'I' | 'O', val: number) => void;
  onBudgetChange: (k: 'util' | 'svc', val: number) => void;
  onTakeLoan: () => void;
  onCloseInspector: () => void;
  onJumpCamera: (gx: number, gy: number) => void;
  onFocusTile: (gx: number, gy: number) => void;
  onCamPreset: (preset: 'close' | 'sat') => void;
}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const CAT_ICONS: Record<string, { icon: string; short: string }> = {
  road: { icon: '🛣️', short: '도로·교통' },
  zone: { icon: '🏗️', short: '구역(RCI)' },
  util: { icon: '⚡', short: '전기·수도' },
  svc:  { icon: '🚒', short: '도시서비스' },
  edu:  { icon: '🎓', short: '교육·타워' },
};

export class HUDController {
  private cb: HUDCallbacks;
  private selectedSectorForModal = 7;
  private chirpHistory: { msg: string; target: { x: number; y: number } | null }[] = [];

  constructor(cb: HUDCallbacks) {
    this.cb = cb;
    this.bindStaticEvents();
    this.buildInfoViews();
    this.buildCategoryTabs();
  }

  private bindStaticEvents() {
    document.querySelectorAll<HTMLButtonElement>('.spd-btn').forEach(btn => {
      btn.addEventListener('click', () => this.cb.onSetSpeed(Number(btn.dataset.speed || 1)));
    });
    document.querySelectorAll<HTMLButtonElement>('.brush-btn').forEach(btn => {
      btn.addEventListener('click', () => this.cb.onSelectBrush((btn.dataset.brush as BrushMode) || 'auto'));
    });
    document.querySelectorAll<HTMLButtonElement>('.rmode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.cb.onSelectRoadDrawMode((btn.dataset.rmode as RoadDrawMode) || 'l_bend'));
    });
    document.querySelectorAll<HTMLButtonElement>('.mcam-btn').forEach(btn => {
      btn.addEventListener('click', () => this.cb.onSelectTouchCamMode((btn.dataset.mcam as 'build' | 'pan' | 'orbit') || 'build'));
    });

    el('btnToggleInfoViews')?.addEventListener('click', () => this.toggleInfoViews());
    el('btnChirper')?.addEventListener('click', () => {
      const s = this.cb.getState();
      if (s.chirpTarget) {
        this.cb.onFocusTile(s.chirpTarget.x, s.chirpTarget.y);
      }
      el('chirperDropdown')?.classList.toggle('hidden');
    });
    el('btnToggleMinimap')?.addEventListener('click', () => this.toggleMinimap());
    el('btnToggleSnap')?.addEventListener('click', () => this.cb.onToggleSnap());
    el('btnUndo')?.addEventListener('click', () => this.cb.onUndo());
    el('btnCancelChain')?.addEventListener('click', () => this.cb.onCancelChain());
    el('btnMobileZoomIn')?.addEventListener('click', () => this.cb.onZoomStep(-1));
    el('btnMobileZoomOut')?.addEventListener('click', () => this.cb.onZoomStep(1));

    // Mobile Menu & Quest Drawer toggles
    const closeMobMenu = () => el('mobileMenuDrawer')?.classList.add('hidden');
    el('btnMobileMenu')?.addEventListener('click', () => el('mobileMenuDrawer')?.classList.toggle('hidden'));
    el('btnCloseMobileMenu')?.addEventListener('click', closeMobMenu);
    el('btnMobileQuest')?.addEventListener('click', () => el('questCard')?.classList.toggle('hidden'));
    el('mBtnEconomy')?.addEventListener('click', () => { closeMobMenu(); this.renderEconomyModal(); this.openModal('modalEconomy'); });
    el('mBtnSectors')?.addEventListener('click', () => { closeMobMenu(); this.renderSectorsModal(); this.openModal('modalSectors'); });
    el('mBtnPolicies')?.addEventListener('click', () => { closeMobMenu(); this.renderPoliciesModal(); this.openModal('modalPolicies'); });
    el('mBtnMinimap')?.addEventListener('click', () => { closeMobMenu(); this.toggleMinimap(); });
    el('mBtnSandbox')?.addEventListener('click', () => this.cb.onToggleSandbox());
    el('mBtnLight')?.addEventListener('click', () => this.cb.onCycleLight());
    el('mBtnNewCity')?.addEventListener('click', () => { closeMobMenu(); this.cb.onNewCity(); });
    el('mBtnDemoCity')?.addEventListener('click', () => { closeMobMenu(); this.cb.onDemoCity(); });

    el('btnLight')?.addEventListener('click', () => this.cb.onCycleLight());
    el('btnSandbox')?.addEventListener('click', () => this.cb.onToggleSandbox());
    el('btnSound')?.addEventListener('click', () => this.cb.onToggleSound());
    el('btnNewCity')?.addEventListener('click', () => this.cb.onNewCity());
    el('btnDemoCity')?.addEventListener('click', () => this.cb.onDemoCity());
    el('btnQuickInspect')?.addEventListener('click', () => this.cb.onSelectTool('inspect'));
    el('btnQuickBulldoze')?.addEventListener('click', () => this.cb.onSelectTool('bulldoze'));
    const focusActiveEvent = () => {
      const tgt = this.cb.getState().activeEvent?.target || this.cb.getState().chirpTarget;
      if (tgt) this.cb.onFocusTile(tgt.x, tgt.y);
    };
    el('eventHeader')?.addEventListener('click', focusActiveEvent);
    el('evDesc')?.addEventListener('click', focusActiveEvent);
    el('btnEvA')?.addEventListener('click', () => this.cb.onResolveEvent('A'));
    el('btnEvB')?.addEventListener('click', () => this.cb.onResolveEvent('B'));
    el('btnCloseInsp')?.addEventListener('click', () => this.cb.onCloseInspector());
    el('btnCamClose')?.addEventListener('click', () => this.cb.onCamPreset('close'));
    el('btnCamSat')?.addEventListener('click', () => this.cb.onCamPreset('sat'));

    el('btnOpenEconomy')?.addEventListener('click', () => {
      this.renderEconomyModal();
      this.openModal('modalEconomy');
    });
    el('btnOpenSectors')?.addEventListener('click', () => {
      this.renderSectorsModal();
      this.openModal('modalSectors');
    });
    el('btnOpenPolicies')?.addEventListener('click', () => {
      this.renderPoliciesModal();
      this.openModal('modalPolicies');
    });
    el('btnTakeLoan')?.addEventListener('click', () => {
      this.cb.onTakeLoan();
      this.renderEconomyModal();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.closeModal!));
    });

    const mm = el<HTMLCanvasElement>('minimapCanvas');
    mm?.addEventListener('pointerdown', (e) => {
      const rect = mm.getBoundingClientRect();
      const gx = Math.floor(((e.clientX - rect.left) / rect.width) * GRID);
      const gy = Math.floor(((e.clientY - rect.top) / rect.height) * GRID);
      this.cb.onJumpCamera(Math.max(0, Math.min(GRID - 1, gx)), Math.max(0, Math.min(GRID - 1, gy)));
    });
  }

  public toggleInfoViews() {
    el('infoViewDrawer')?.classList.toggle('hidden');
  }

  public toggleMinimap() {
    el('minimapBox')?.classList.toggle('hidden');
  }

  public openModal(id: string) {
    const m = el(id);
    if (m) {
      m.classList.remove('hidden');
      m.classList.add('flex');
    }
  }

  public closeModal(id: string) {
    const m = el(id);
    if (m) {
      m.classList.add('hidden');
      m.classList.remove('flex');
    }
  }

  public showToast(title: string, desc: string, kind: 'success' | 'warn' | 'error' | 'info' = 'info') {
    const stack = el('toastStack');
    if (!stack) return;
    const borderCol =
      kind === 'success'
        ? 'border-emerald-400/60'
        : kind === 'error'
          ? 'border-rose-400/60'
          : kind === 'warn'
            ? 'border-amber-400/60'
            : 'border-sky-400/60';
    const div = document.createElement('div');
    div.className = `glass ${borderCol} rounded-xl px-3.5 py-2 shadow-2xl max-w-md transition-all duration-300`;
    div.innerHTML = `<div class="font-bold text-xs">${title}</div><div class="text-[11px] text-[var(--muted-foreground)]">${desc}</div>`;
    stack.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transform = 'translateY(-8px)';
      setTimeout(() => div.remove(), 300);
    }, 3200);
  }

  public buildInfoViews() {
    const box = el('infoViewList');
    if (!box) return;
    const active = this.cb.getActiveView();
    const activeInfo = INFO_VIEWS.find(v => v.id === active);
    const badge = el('activeViewBadge');
    if (badge && activeInfo) badge.textContent = activeInfo.name;

    box.innerHTML = '';
    for (const v of INFO_VIEWS) {
      const b = document.createElement('button');
      b.className = `view-btn px-2 py-1.5 rounded-lg text-left text-xs flex items-center gap-1.5 bg-slate-900/50 hover:bg-white/10 transition ${v.id === active ? 'active' : ''}`;
      b.title = v.name;
      b.innerHTML = `<span>${v.icon}</span><span class="truncate">${v.name}</span>`;
      b.addEventListener('click', () => this.cb.onSelectView(v.id));
      box.appendChild(b);
    }
  }

  public buildCategoryTabs() {
    const box = el('catTabs');
    if (!box) return;
    const activeCat = this.cb.getActiveCategory();
    const trayOpen = this.cb.getTrayOpen();
    box.innerHTML = '';
    for (const c of CATEGORIES) {
      const meta = CAT_ICONS[c.id] || { icon: '🛠️', short: c.name };
      const b = document.createElement('button');
      const isAct = trayOpen && c.id === activeCat;
      b.className = `cat-circle w-10 h-10 rounded-full border border-[var(--border)] bg-slate-900/75 hover:bg-slate-800 flex items-center justify-center text-base transition shrink-0 ${isAct ? 'active' : ''}`;
      b.title = `${meta.short} (${c.name})`;
      b.textContent = meta.icon;
      b.addEventListener('click', () => this.cb.onSelectCategory(c.id));
      box.appendChild(b);
    }
  }

  public buildDockUI() {
    this.buildCategoryTabs();
    const tray = el('buildTray');
    const trayOpen = this.cb.getTrayOpen();
    if (tray) tray.classList.toggle('hidden', !trayOpen);

    const dock = el('toolDock');
    if (!dock) return;
    const state = this.cb.getState();
    const activeCat = this.cb.getActiveCategory();
    const activeTool = this.cb.getActiveTool();
    dock.innerHTML = '';

    for (const t of TOOLS) {
      if (t.cat !== activeCat) continue;
      const unlocked = isToolUnlocked(state, t.id);
      const btn = document.createElement('button');
      btn.className = `tool-btn flex flex-col items-center justify-center min-w-[70px] px-2 py-1.5 rounded-xl border border-[var(--border)] bg-slate-900/60 hover:bg-slate-800/80 transition ${t.id === activeTool ? 'active' : ''} ${!unlocked ? 'opacity-45' : ''}`;
      btn.title = t.desc;
      btn.innerHTML = `
        <span class="text-base leading-none">${t.icon}</span>
        <span class="text-[11px] font-semibold mt-1 whitespace-nowrap">${t.name}</span>
        <span class="text-[10px] ${unlocked ? 'text-amber-300' : 'text-rose-300'}">${unlocked ? (t.cost ? '₩' + t.cost.toLocaleString() : '무료') : '🔒 Lv.' + t.ms}</span>
      `;
      btn.addEventListener('click', () => this.cb.onSelectTool(t.id));
      dock.appendChild(btn);
    }

    // Show Cities: Skylines Road/Utility Sub-Mode Mini-Panel vs Zone Brush Sub-Panel
    const isLineTool =
      (isRoadType(activeTool) && activeTool !== 'roundabout') ||
      activeTool === 'water_pipe' ||
      activeTool === 'power_line';
    const isAreaTool = isZoneTool(activeTool) || activeTool === 'zone_clear' || activeTool === 'city_block' || activeTool === 'bulldoze';

    const roadPanel = el('roadSubPanel');
    const brushPanel = el('brushSubPanel');
    if (roadPanel) {
      roadPanel.classList.toggle('hidden', !isLineTool);
      roadPanel.classList.toggle('flex', isLineTool);
    }
    if (brushPanel) {
      brushPanel.classList.toggle('hidden', !isAreaTool);
      brushPanel.classList.toggle('flex', isAreaTool);
    }

    const rMode = this.cb.getRoadDrawMode();
    document.querySelectorAll<HTMLButtonElement>('.rmode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rmode === rMode);
      // Upgrade button only relevant for roads
      if (btn.dataset.rmode === 'upgrade') {
        btn.disabled = !isRoadType(activeTool);
        btn.classList.toggle('opacity-35', !isRoadType(activeTool));
      }
    });

    const snapBtn = el('btnToggleSnap');
    const snapOn = this.cb.getSnapEnabled();
    if (snapBtn) {
      snapBtn.textContent = snapOn ? '🧲 스냅 ON' : '🧲 스냅 OFF';
      snapBtn.className = snapOn
        ? 'px-2.5 py-1 md:w-full md:px-2 md:py-0.5 rounded-lg bg-sky-500/25 text-sky-200 border border-sky-400/50 text-[11px] font-semibold whitespace-nowrap shrink-0'
        : 'px-2.5 py-1 md:w-full md:px-2 md:py-0.5 rounded-lg bg-slate-900/70 text-slate-400 border border-[var(--border)] text-[11px] whitespace-nowrap shrink-0';
    }

    document.querySelectorAll<HTMLButtonElement>('.brush-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.brush === this.cb.getBrushMode());
    });
    const tCam = this.cb.getTouchCamMode();
    document.querySelectorAll<HTMLButtonElement>('.mcam-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mcam === tCam);
    });

    el('btnQuickInspect')?.classList.toggle('active', activeTool === 'inspect');
    el('btnQuickBulldoze')?.classList.toggle('active', activeTool === 'bulldoze');

    const undoBtn = el<HTMLButtonElement>('btnUndo');
    if (undoBtn) undoBtn.disabled = !this.cb.getCanUndo();

    const chainOn = this.cb.getChainActive();
    el('chainBadge')?.classList.toggle('hidden', !chainOn);
    el('touchChainBar')?.classList.toggle('hidden', !chainOn);

    const tDef = TOOL_MAP[activeTool];
    const descEl = el('toolDescText');
    if (descEl && tDef) {
      const hint = isLineTool ? ' · 클릭 A → 클릭 B 연속 시공 (우클릭 취소)' : '';
      descEl.textContent = `${tDef.icon} ${tDef.name}: ${tDef.desc}${hint}`;
    }
  }

  public updateCursorHudTag(clientX: number, clientY: number, plan: BrushPlan | null, activeTool: string) {
    const tag = el('cursorHudTag');
    if (!tag) return;
    if (!plan || activeTool === 'inspect') {
      tag.classList.add('hidden');
      return;
    }
    const def = TOOL_MAP[activeTool];
    const main = el('cursorHudMain');
    const sub = el('cursorHudSub');
    if (!main || !sub) return;

    const costTxt = plan.estCost > 0 ? `₩${plan.estCost.toLocaleString()}` : plan.validCount > 0 ? '무료' : '설치 불가';
    const dimTxt = plan.length > 1 ? `${plan.meters}m · ${plan.angleDeg}°` : '';
    main.innerHTML = `<span>${def?.icon || ''} ${def?.name || activeTool}</span> ${dimTxt ? `<span class="text-slate-300 font-mono">${dimTxt}</span>` : ''} <span class="${plan.validCount > 0 ? 'text-amber-300' : 'text-rose-400'}">${costTxt}</span>`;
    sub.textContent =
      plan.connectionNote ||
      (this.cb.getChainActive()
        ? '탭/클릭: 연속 시공 · 연결 종료로 취소'
        : plan.validCount > 0
          ? `적용 가능 ${plan.validCount}타일`
          : '다른 위치를 선택하세요');

    tag.style.left = `${Math.max(8, Math.min(window.innerWidth - 220, clientX + 14))}px`;
    tag.style.top = `${Math.max(54, clientY - 56)}px`;
    tag.classList.remove('hidden');
  }

  public updateHUD() {
    const s = this.cb.getState();
    const st = s.stats;
    const ms = MILESTONES[s.milestone] || MILESTONES[0];

    const set = (id: string, txt: string) => {
      const e = el(id);
      if (e) e.textContent = txt;
    };

    const fmtCompact = (n: number) =>
      Math.abs(n) >= 1000000
        ? `${(n / 1000000).toFixed(1)}M`
        : Math.abs(n) >= 10000
          ? `${Math.round(n / 1000)}k`
          : Math.round(n).toLocaleString();

    set('hudCityName', s.name);
    set('hudMilestone', `${ms.name} · ${s.day}일차`);
    set('hudPop', `${st.population.toLocaleString()}명`);
    set('hudMoney', `₩${Math.round(s.money).toLocaleString()}`);
    // Compact mobile KPI bar
    set('mMoney', `₩${fmtCompact(s.money)}`);
    set('mPop', `${fmtCompact(st.population)}명`);
    set('mHappy', `${st.happiness}%`);
    set('mTraffic', `${st.trafficFlow}%`);

    const netEl = el('hudNet');
    if (netEl) {
      netEl.textContent = `${st.netIncome >= 0 ? '+' : ''}₩${st.netIncome.toLocaleString()}/일`;
      netEl.className = `text-[11px] font-semibold leading-tight whitespace-nowrap ${st.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    set('hudHappy', `${st.happiness}%`);
    set('hudTraffic', `${st.trafficFlow}%`);
    set('hudPower', `${st.powerUse}/${st.powerGen}MW`);
    set('hudWater', `${st.waterUse}/${st.waterGen}m³`);
    set('hudChirp', s.chirp);

    if (s.chirp && this.chirpHistory[0]?.msg !== s.chirp) {
      this.chirpHistory.unshift({ msg: s.chirp, target: s.chirpTarget ? { ...s.chirpTarget } : null });
      if (this.chirpHistory.length > 6) this.chirpHistory.pop();
      const cl = el('chirperList');
      if (cl) {
        cl.innerHTML = '';
        for (const item of this.chirpHistory) {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'w-full text-left p-1.5 rounded-lg bg-slate-900/60 hover:bg-sky-500/25 border border-[var(--border)] hover:border-sky-400/50 transition flex items-start justify-between gap-1.5 cursor-pointer';
          row.innerHTML = `<span class="flex-1 leading-snug">${item.msg}</span>${item.target ? '<span class="text-[10px] text-sky-300 shrink-0 font-semibold">📍이동</span>' : ''}`;
          row.addEventListener('click', () => {
            const t = item.target || this.cb.getState().chirpTarget;
            if (t) this.cb.onFocusTile(t.x, t.y);
            el('chirperDropdown')?.classList.add('hidden');
          });
          cl.appendChild(row);
        }
      }
    }

    const rR = el('rciR'); if (rR) rR.style.height = `${Math.max(8, s.demand.R)}%`;
    const rC = el('rciC'); if (rC) rC.style.height = `${Math.max(8, s.demand.C)}%`;
    const rI = el('rciI'); if (rI) rI.style.height = `${Math.max(8, s.demand.I)}%`;

    const spd = this.cb.getSimSpeed();
    document.querySelectorAll<HTMLButtonElement>('.spd-btn').forEach(btn => {
      const active = Number(btn.dataset.speed) === spd;
      btn.className = `spd-btn px-2 py-1 rounded-lg text-xs ${active ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-900/70 md:bg-transparent hover:bg-white/10'}`;
    });

    const lightLabels: Record<LightingMode, string> = {
      day: '☀️ 낮',
      sunset: '🌇 노을',
      night: '🌃 야경',
      auto: '🕒 자동',
    };
    set('btnLight', lightLabels[this.cb.getLightingMode()]);
    set('mBtnLight', lightLabels[this.cb.getLightingMode()]);
    const sbLabel = s.sandboxUnlock ? '🔓 샌드박스' : '🔒 일반';
    set('btnSandbox', sbLabel);
    set('mBtnSandbox', sbLabel);

    const undoBtn = el<HTMLButtonElement>('btnUndo');
    if (undoBtn) undoBtn.disabled = !this.cb.getCanUndo();
    const chainOn = this.cb.getChainActive();
    el('chainBadge')?.classList.toggle('hidden', !chainOn);
    el('touchChainBar')?.classList.toggle('hidden', !chainOn);

    this.renderQuestTracker();
    this.renderEventBanner();
    this.renderBuffChips();
  }

  public renderQuestTracker() {
    const s = this.cb.getState();
    const nextQ = QUESTS.find(q => !s.completedQuests.includes(q.id));
    const cnt = el('questCount');
    if (cnt) cnt.textContent = `${s.completedQuests.length}/${QUESTS.length} 완료`;

    if (!nextQ) {
      const t = el('questTitle'); if (t) t.textContent = '🏆 모든 시장 미션 완료!';
      const d = el('questDesc'); if (d) d.textContent = '메트로빌이 세계 최고의 친환경 미래 메가폴리스로 거듭났습니다!';
      const b = el('questBar'); if (b) b.style.width = '100%';
      const p = el('questProgress'); if (p) p.textContent = '마스터 시장 달성';
      const r = el('questReward'); if (r) r.textContent = '✨ 완료';
      return;
    }
    const res = nextQ.check(s);
    const t = el('questTitle'); if (t) t.textContent = nextQ.title;
    const d = el('questDesc'); if (d) d.textContent = nextQ.desc;
    const b = el('questBar'); if (b) b.style.width = `${res.progress}%`;
    const p = el('questProgress'); if (p) p.textContent = res.label;
    const r = el('questReward'); if (r) r.textContent = `보상 +₩${nextQ.reward.toLocaleString()}`;
  }

  public renderEventBanner() {
    const s = this.cb.getState();
    const card = el('eventCard');
    if (!card) return;
    if (!s.activeEvent) {
      card.classList.add('hidden');
      return;
    }
    const ev = s.activeEvent;
    card.classList.remove('hidden');
    const set = (id: string, txt: string) => { const e = el(id); if (e) e.textContent = txt; };
    set('evIcon', ev.icon);
    set('evTitle', ev.title);
    set('evDesc', ev.desc);
    set('evALabel', ev.choiceA.label);
    set('evADesc', ev.choiceA.desc);
    set('evBLabel', ev.choiceB.label);
    set('evBDesc', ev.choiceB.desc);
  }

  public renderBuffChips() {
    const s = this.cb.getState();
    const row = el('buffRow');
    if (!row) return;
    row.innerHTML = '';
    for (const b of s.activeBuffs) {
      const chip = document.createElement('div');
      chip.className = 'glass rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border-sky-400/40';
      chip.textContent = `${b.icon} ${b.name} (${b.daysLeft}일)`;
      row.appendChild(chip);
    }
  }

  public updateInspector() {
    this.cb.onSyncSelection();
    const card = el('inspectorCard');
    const sel = this.cb.getSelectedTile();
    if (!card || !sel) {
      card?.classList.add('hidden');
      return;
    }
    const s = this.cb.getState();
    const t = s.grid[sel.y]?.[sel.x];
    if (!t) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    const b = t.building;
    const spec = DISTRICT_SPEC_MAP[s.sectorSpecs[sectorIdx(t.x, t.y)] || 'general'];
    const titleEl = el('inspTitle');
    const bodyEl = el('inspBody');
    const actEl = el('inspActions');
    if (!titleEl || !bodyEl || !actEl) return;

    const zs = b ? ZONE_SPECS[b.type] : undefined;
    const lv = b ? Math.min(5, Math.max(1, b.level || 1)) : 0;
    const name = b
      ? (TOOL_MAP[b.type]?.name || zs?.name || b.type) + (zs ? ` Lv.${lv}` : '')
      : t.zone
        ? `${ZONE_SPECS[t.zone]?.name || t.zone} 예정지`
        : t.terrain === 'water'
          ? '대하천 / 항만 수역'
          : '미개발 지형';
    titleEl.textContent = `${name} (${t.x + 1}, ${t.y + 1})`;

    const PROB_LABEL: Record<string, string> = {
      fire: '🔥 화재 발생',
      abandoned: '🏚️ 건물 폐가화',
      road: '🛣️ 도로 미연결',
      power: '⚡ 전력 부족',
      water: '💧 급수 부족/오염',
      sewage: '🌊 하수 처리 부족',
      sick: '🏥 시민 질병 발생',
      garbage: '🗑️ 쓰레기 적체',
      crime: '🚨 범죄율 경보',
      goods: '📦 판매 상품 부족',
      workers: '👷 인력/고학력 부족',
    };

    const stars = zs ? '★'.repeat(lv) + '☆'.repeat(5 - lv) : '';
    const rStats = b && (isRoadType(b.type) || zs) ? this.cb.getRouteStats(t.x, t.y) : null;
    const rTotal = rStats ? rStats.commute + rStats.freight + rStats.transit + rStats.trade : 0;

    bodyEl.innerHTML = `
      ${t.problem ? `<div class="px-2 py-1 rounded-lg bg-rose-500/20 border border-rose-400/50 text-rose-200 font-bold text-[11px] mb-1">${PROB_LABEL[t.problem] || t.problem}</div>` : ''}
      ${zs ? `
        <div class="mb-1.5 p-1.5 rounded-lg bg-slate-900/70 border border-[var(--border)]">
          <div class="flex justify-between items-center text-[11px]">
            <span class="text-amber-300 tracking-wider font-bold">${stars}</span>
            <span class="text-[10px] text-sky-300">${b?.historical ? '🏛️ 역사 보존' : `Lv.${lv}/5`}</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
            <div class="h-full bg-gradient-to-r from-sky-400 to-emerald-400" style="width:${lv >= 5 ? 100 : Math.min(100, Math.round(b?.growth || 0))}%"></div>
          </div>
          <div class="text-[10px] text-slate-300 mt-1">${t.levelHint || ''}</div>
        </div>
      ` : ''}
      <div class="flex justify-between"><span class="text-[var(--muted-foreground)]">특화 지구</span><span class="font-semibold">${spec.icon} ${spec.name}</span></div>
      <div class="flex justify-between"><span class="text-[var(--muted-foreground)]">전기 · 수도</span><span>${t.powered ? '⚡공급' : '⚡미연결'} · ${t.hasWater && t.hasSewage ? '💧완비' : '💧부족'}</span></div>
      <div class="flex justify-between"><span class="text-[var(--muted-foreground)]">행복도 · 지가</span><span>😊 ${t.happiness}% · 💎 ${t.landValue}</span></div>
      <div class="flex justify-between"><span class="text-[var(--muted-foreground)]">교육 · 공해 · 소음</span><span>🎓 ${t.eduCov}% · 🌫️ ${t.pollution} · 🔊 ${t.noise}</span></div>
      ${zs && zs.group !== 'R' ? `<div class="flex justify-between"><span class="text-[var(--muted-foreground)]">인력 · 물류 수급</span><span>👷 ${Math.round((t.workerFill ?? 1) * 100)}% · 📦 ${Math.round((t.goodsSupply ?? 1) * 100)}%</span></div>` : ''}
      ${isRoadType(b?.type) ? `<div class="flex justify-between"><span class="text-[var(--muted-foreground)]">교통 혼잡도</span><span class="${t.congestion > 1 ? 'text-rose-400 font-bold' : 'text-emerald-400'}">${Math.round(t.congestion * 100)}%</span></div>` : ''}
      ${rStats && rTotal > 0 ? `
        <div class="mt-1.5 pt-1.5 border-t border-[var(--border)] text-[10px]">
          <div class="text-sky-300 font-bold mb-0.5">🛣️ 3D 통과 경로 분석 (${rTotal}개 노선)</div>
          <div class="flex flex-wrap gap-1.5 text-slate-300">
            <span class="text-sky-300">🚗 통근 ${rStats.commute}</span>
            <span class="text-amber-300">🚚 화물 ${rStats.freight}</span>
            <span class="text-emerald-300">🚌 버스 ${rStats.transit}</span>
            <span class="text-purple-300">🌐 무역 ${rStats.trade}</span>
          </div>
        </div>
      ` : ''}
    `;

    actEl.innerHTML = '';
    if (b && zs) {
      const hist = document.createElement('button');
      hist.className = b.historical
        ? 'flex-1 px-2 py-1 rounded-lg bg-amber-500/30 text-amber-200 font-semibold border border-amber-400/60'
        : 'flex-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-semibold border border-[var(--border)]';
      hist.textContent = b.historical ? '🏛️ 역사적 건물 해제' : '🏛️ 역사적 건물 보존';
      hist.addEventListener('click', () => this.cb.onToggleHistorical(t.x, t.y));
      actEl.appendChild(hist);
    }
    if (b && isRoadType(b.type) && !b.locked) {
      if (b.type === 'road') {
        const up = document.createElement('button');
        up.className = 'flex-1 px-2 py-1 rounded-lg bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 font-semibold border border-sky-400/40';
        up.textContent = '⬆️ 4차선 대로';
        up.addEventListener('click', () => this.cb.onUpgradeTileRoad(t.x, t.y, 'avenue'));
        actEl.appendChild(up);
      }
      if (b.type !== 'roundabout') {
        const rb = document.createElement('button');
        rb.className = 'flex-1 px-2 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 font-semibold border border-emerald-400/40';
        rb.textContent = '🔄 회전교차로';
        rb.addEventListener('click', () => this.cb.onUpgradeTileRoad(t.x, t.y, 'roundabout'));
        actEl.appendChild(rb);
      }
    }
  }

  public renderEconomyModal() {
    const s = this.cb.getState();
    const taxBox = el('taxSliders');
    if (taxBox) {
      const items: { k: 'R' | 'C' | 'I' | 'O'; label: string }[] = [
        { k: 'R', label: '🏡 주거 세율' },
        { k: 'C', label: '🏬 상업 세율' },
        { k: 'I', label: '🏭 산업 세율' },
        { k: 'O', label: '💼 오피스 세율' },
      ];
      taxBox.innerHTML = '';
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2';
        row.innerHTML = `<span class="w-24">${it.label}</span><input type="range" min="5" max="18" value="${s.taxes[it.k]}" class="flex-1 accent-sky-400" /><span class="w-10 text-right font-bold tabular-nums">${s.taxes[it.k]}%</span>`;
        const inp = row.querySelector('input')!;
        const valSpan = row.querySelectorAll('span')[1];
        inp.addEventListener('input', () => {
          const v = Number(inp.value);
          valSpan.textContent = `${v}%`;
          this.cb.onTaxChange(it.k, v);
          this.renderEconSummary();
        });
        taxBox.appendChild(row);
      }
    }

    const budBox = el('budgetSliders');
    if (budBox) {
      const items: { k: 'util' | 'svc'; label: string }[] = [
        { k: 'util', label: '⚡ 전력·수도 예산' },
        { k: 'svc', label: '🚒 공공·교육 예산' },
      ];
      budBox.innerHTML = '';
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2';
        row.innerHTML = `<span class="w-28">${it.label}</span><input type="range" min="50" max="150" step="5" value="${s.budgets[it.k]}" class="flex-1 accent-emerald-400" /><span class="w-12 text-right font-bold tabular-nums">${s.budgets[it.k]}%</span>`;
        const inp = row.querySelector('input')!;
        const valSpan = row.querySelectorAll('span')[1];
        inp.addEventListener('input', () => {
          const v = Number(inp.value);
          valSpan.textContent = `${v}%`;
          this.cb.onBudgetChange(it.k, v);
          this.renderEconSummary();
        });
        budBox.appendChild(row);
      }
    }

    const loanEl = el('loanStatus');
    if (loanEl) loanEl.textContent = `대출 잔액: ₩${s.loan.toLocaleString()} (매일 원금 ₩250 + 이자 상환)`;

    this.renderEconSummary();
    this.renderStatsChart();
  }

  private renderEconSummary() {
    const s = this.cb.getState();
    const st = s.stats;
    const sum = el('econSummary');
    if (!sum) return;
    const [e0, e1, e2, e3] = st.eduTiers || [40, 30, 20, 10];
    sum.innerHTML = `
      <div class="flex justify-between"><span>일일 세수 수입</span><span class="text-emerald-400 font-bold">+₩${st.taxIncome.toLocaleString()}</span></div>
      <div class="flex justify-between"><span>시설·특화·정책 유지비</span><span class="text-rose-400 font-bold">-₩${st.upkeep.toLocaleString()}</span></div>
      <div class="flex justify-between border-t border-[var(--border)] pt-1 text-sm"><span>일일 순수익</span><span class="${st.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${st.netIncome >= 0 ? '+' : ''}₩${st.netIncome.toLocaleString()}</span></div>
      <div class="flex justify-between text-[11px] text-[var(--muted-foreground)] pt-1"><span>전력 · 수도 · 친환경</span><span>${st.powerUse}/${st.powerGen}MW · ${st.waterUse}/${st.waterGen}m³ · ${st.greenPowerPct}%🌿</span></div>
      <div class="mt-2 pt-2 border-t border-[var(--border)] space-y-1.5 text-[11px]">
        <div class="flex justify-between"><span>👷 일자리 · 실업률</span><span class="font-semibold">${st.jobs.toLocaleString()}개 · <span class="${st.unemploymentPct > 15 ? 'text-rose-400' : 'text-emerald-400'}">${st.unemploymentPct}%</span></span></div>
        <div>
          <div class="flex justify-between text-[10px] text-[var(--muted-foreground)] mb-0.5"><span>🎓 시민 학력 분포 (미교육·초·고·대졸)</span><span>${e0}/${e1}/${e2}/${e3}%</span></div>
          <div class="w-full h-2 rounded-full overflow-hidden flex bg-slate-800">
            <div style="width:${e0}%" class="bg-slate-500"></div>
            <div style="width:${e1}%" class="bg-amber-400"></div>
            <div style="width:${e2}%" class="bg-sky-400"></div>
            <div style="width:${e3}%" class="bg-emerald-400"></div>
          </div>
        </div>
        <div class="flex justify-between"><span>📦 물류·무역 (생산/수요/수입/수출)</span><span class="font-semibold text-amber-300">${st.goodsProduced}/${st.goodsDemand} · ⬇${st.goodsImported} ⬆${st.goodsExported}</span></div>
        <div class="flex justify-between"><span>🛣️ 간선도로 분담률 · 외부 고속도로 · 경보</span><span>${st.roadHierarchyPct}% · 🌐${st.outsideConnections} · ${st.problemCount > 0 ? `<span class="text-rose-400 font-bold">⚠️${st.problemCount}</span>` : '<span class="text-emerald-400">정상</span>'}</span></div>
      </div>
    `;
  }

  public renderStatsChart() {
    const canvas = el<HTMLCanvasElement>('statsChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hist = this.cb.getState().statsHistory;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = (H / 5) * i;
      ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(W - 10, y); ctx.stroke();
    }
    if (hist.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('데이터 수집 중... (2일마다 자동 기록)', 24, H / 2);
      return;
    }

    const drawLine = (vals: number[], color: string, fixedMax?: number) => {
      const minV = fixedMax !== undefined ? 0 : Math.min(0, ...vals);
      const maxV = fixedMax !== undefined ? fixedMax : Math.max(10, ...vals);
      const span = Math.max(1, maxV - minV);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const px = 12 + (i / (vals.length - 1)) * (W - 24);
        const py = H - 16 - ((v - minV) / span) * (H - 32);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };

    drawLine(hist.map(h => h.population), '#34d399');
    drawLine(hist.map(h => h.netIncome), '#fbbf24');
    drawLine(hist.map(h => h.trafficFlow), '#38bdf8', 100);
  }

  public renderSectorsModal() {
    const s = this.cb.getState();
    const gridEl = el('sectorGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    for (let i = 0; i < 25; i++) {
      const unlocked = s.sandboxUnlock || s.unlockedSectors[i];
      const spec = DISTRICT_SPEC_MAP[s.sectorSpecs[i] || 'general'];
      const sx = i % SECS;
      const sy = Math.floor(i / SECS);
      const btn = document.createElement('button');
      const isSel = i === this.selectedSectorForModal;
      btn.className = `p-2 rounded-xl border text-center transition ${isSel ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-[var(--border)]'} ${unlocked ? 'bg-slate-800/80 hover:bg-slate-700' : 'bg-slate-950/70 opacity-70 hover:opacity-100'}`;
      btn.innerHTML = `
        <div class="text-sm">${unlocked ? spec.icon : '🔒'}</div>
        <div class="text-[11px] font-bold mt-0.5">${sx + 1}-${sy + 1}</div>
        <div class="text-[10px] truncate ${unlocked ? 'text-sky-300' : 'text-amber-300'}">${unlocked ? spec.name.slice(0, 4) : '₩12,000'}</div>
      `;
      btn.addEventListener('click', () => {
        if (!unlocked) this.cb.onBuySector(i);
        this.selectedSectorForModal = i;
        this.renderSectorsModal();
      });
      gridEl.appendChild(btn);
    }

    const idx = this.selectedSectorForModal;
    const unlocked = s.sandboxUnlock || s.unlockedSectors[idx];
    const titleEl = el('selSectorTitle');
    const specBox = el('specButtons');
    if (!titleEl || !specBox) return;
    const sx = (idx % SECS) + 1;
    const sy = Math.floor(idx / SECS) + 1;
    titleEl.textContent = unlocked
      ? `구역 (${sx}-${sy}) 특화 지구 지정`
      : `구역 (${sx}-${sy}) 미개방 — 클릭해 ₩12,000에 매입`;

    specBox.innerHTML = '';
    if (!unlocked) {
      const buyBtn = document.createElement('button');
      buyBtn.className = 'w-full py-2 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 font-bold border border-emerald-400/50';
      buyBtn.textContent = '🗺️ 이 광역 부지 매입하기 (₩12,000)';
      buyBtn.addEventListener('click', () => {
        this.cb.onBuySector(idx);
        this.renderSectorsModal();
      });
      specBox.appendChild(buyBtn);
      return;
    }

    const curSpec = s.sectorSpecs[idx] || 'general';
    for (const sp of DISTRICT_SPECS) {
      const b = document.createElement('button');
      const active = sp.id === curSpec;
      b.className = `w-full text-left px-2.5 py-2 rounded-xl border transition ${active ? 'border-sky-400 bg-sky-500/20' : 'border-[var(--border)] bg-slate-950/50 hover:bg-slate-800'}`;
      b.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-xs">${sp.icon} ${sp.name}</span>
          <span class="text-[11px] ${active ? 'text-sky-300 font-bold' : 'text-[var(--muted-foreground)]'}">${active ? '적용 중' : sp.upkeep ? '₩' + sp.upkeep + '/일' : '무료'}</span>
        </div>
        <div class="text-[11px] text-[var(--muted-foreground)] mt-0.5">${sp.desc}</div>
      `;
      b.addEventListener('click', () => {
        this.cb.onSetSectorSpec(idx, sp.id);
        this.renderSectorsModal();
      });
      specBox.appendChild(b);
    }
  }

  public renderPoliciesModal() {
    const s = this.cb.getState();
    const list = el('policyList');
    if (!list) return;
    list.innerHTML = '';
    for (const p of POLICIES) {
      const on = !!s.policies[p.id];
      const btn = document.createElement('button');
      btn.className = `w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-3 ${on ? 'border-emerald-400/60 bg-emerald-500/15' : 'border-[var(--border)] bg-slate-900/60 hover:bg-slate-800'}`;
      btn.innerHTML = `
        <div>
          <div class="font-bold text-xs">${p.name}</div>
          <div class="text-[11px] text-[var(--muted-foreground)] mt-0.5">${p.desc}</div>
        </div>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${on ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">${on ? '시행 중' : '꺼짐'}</span>
      `;
      btn.addEventListener('click', () => {
        this.cb.onTogglePolicy(p.id);
        this.renderPoliciesModal();
      });
      list.appendChild(btn);
    }
  }

  public renderMinimap(engine: ThreeEngine) {
    const c = el<HTMLCanvasElement>('minimapCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = this.cb.getState();
    const W = c.width;
    const H = c.height;
    const cell = W / GRID;
    ctx.clearRect(0, 0, W, H);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const t = s.grid[y][x];
        let col = '#3b6633';
        if (t.terrain === 'water') col = '#0c4a6e';
        else if (t.terrain === 'sand') col = '#bfa980';
        else if (!s.sandboxUnlock && !s.unlockedSectors[sectorIdx(x, y)]) col = '#1e293b';

        const bt = t.building?.type;
        if (bt) {
          if (bt === 'roundabout') col = '#38bdf8';
          else if (isRoadType(bt)) col = bt === 'highway' ? '#f59e0b' : '#94a3b8';
          else if (bt.startsWith('res')) col = '#4ade80';
          else if (bt.startsWith('com')) col = '#3b82f6';
          else if (bt === 'office') col = '#06b6d4';
          else if (bt === 'ind') col = '#eab308';
          else if (bt === 'landmark') col = '#f43f5e';
          else col = '#e2e8f0';
        }
        ctx.fillStyle = col;
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.7;
    for (let i = 1; i < SECS; i++) {
      const p = i * SECTOR * cell;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    }

    const cx = (engine.cam.tx + GRID / 2) * cell;
    const cy = (engine.cam.tz + GRID / 2) * cell;
    const r = Math.max(6, (engine.cam.dist / GRID) * W * 0.45);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - r, cy - r * 0.75, r * 2, r * 1.5);
  }
}
