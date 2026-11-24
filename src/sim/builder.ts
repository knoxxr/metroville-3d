import { DIRS, DIRS8, TOOL_MAP, ZONE_SPECS, inBounds, isRoadType, sectorIdx } from './constants';
import type { BrushMode, BrushPlan, BrushPlanItem, CityState, InfoViewId, SnapInfo, Tile } from './types';

export const isZoneTool = (id: string) => id.startsWith('zone_') && id !== 'zone_clear';
export const zoneFromTool = (id: string) => id.replace('zone_', '');

export function isToolUnlocked(state: CityState, id: string): boolean {
  if (state.sandboxUnlock) return true;
  const t = TOOL_MAP[id];
  return !t || (t.ms || 0) <= state.milestone;
}

export function getBuildCost(toolId: string, tile: Tile): number {
  const def = TOOL_MAP[toolId];
  if (!def) return 0;
  if (toolId === 'city_block') return def.cost;
  if (isRoadType(toolId) && tile.terrain === 'water') {
    const newC = def.bridgeCost || def.cost;
    if (tile.building && isRoadType(tile.building.type) && tile.building.type !== toolId) {
      const oldDef = TOOL_MAP[tile.building.type];
      const oldC = oldDef?.bridgeCost || oldDef?.cost || 0;
      return Math.max(25, newC - oldC);
    }
    return newC;
  }
  if (isRoadType(toolId) && tile.building && isRoadType(tile.building.type) && tile.building.type !== toolId) {
    const oldC = TOOL_MAP[tile.building.type]?.cost || 0;
    return Math.max(20, def.cost - oldC);
  }
  return def.cost;
}

export function findMagneticSnap(state: CityState, toolId: string, gx: number, gy: number): SnapInfo {
  const none: SnapInfo = { x: gx, y: gy, snapped: false, kind: 'none', label: '' };
  if (!inBounds(gx, gy)) return none;
  const g = state.grid;
  const cur = g[gy][gx];

  // Coast auto-snap for water pumps & sewage outlets!
  if (toolId === 'water_pump' || toolId === 'sewage') {
    if (cur.isCoast && !cur.building) {
      return { x: gx, y: gy, snapped: true, kind: 'coast', label: '🌊 해안선 정렬됨' };
    }
    for (const [dx, dy] of DIRS8) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (inBounds(nx, ny) && g[ny][nx].isCoast && !g[ny][nx].building) {
        return { x: nx, y: ny, snapped: true, kind: 'coast', label: '🧲 해안선 자동 스냅' };
      }
    }
    return none;
  }

  // Magnetic Road Node Snapping
  if (isRoadType(toolId)) {
    if (isRoadType(cur.building?.type)) {
      const same = cur.building?.type === toolId;
      return {
        x: gx,
        y: gy,
        snapped: true,
        kind: 'road',
        label: toolId === 'roundabout' && !same
          ? '🔄 교차로 → 회전교차로 업그레이드'
          : same
            ? '🧲 기존 도로 노드 연결'
            : `⬆️ ${TOOL_MAP[toolId]?.name} 즉시 업그레이드`,
      };
    }
    for (const [dx, dy] of DIRS) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (inBounds(nx, ny) && isRoadType(g[ny][nx].building?.type)) {
        return { x: gx, y: gy, snapped: true, kind: 'road', label: '🧲 도로 자동 접속' };
      }
    }
    return none;
  }

  // Magnetic Underground Water Pipe Snapping!
  if (toolId === 'water_pipe') {
    if (cur.pipe || cur.building?.type === 'water_pump' || cur.building?.type === 'sewage') {
      return {
        x: gx,
        y: gy,
        snapped: true,
        kind: 'pipe',
        label: cur.hasWater && cur.hasSewage ? '💧 급수·하수 본관 연결' : '🔧 기존 배관 노드 스냅',
      };
    }
    for (const [dx, dy] of DIRS) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (inBounds(nx, ny)) {
        const nt = g[ny][nx];
        if (nt.building?.type === 'water_pump' || nt.building?.type === 'sewage') {
          return { x: nx, y: ny, snapped: true, kind: 'pipe', label: '🧲 취수/하수 시설 자동 스냅' };
        }
        if (nt.pipe) {
          return { x: gx, y: gy, snapped: true, kind: 'pipe', label: '💧 인접 배관 자동 접속' };
        }
      }
    }
    return none;
  }

  // Magnetic High-Voltage Power Line Snapping!
  if (toolId === 'power_line') {
    if (cur.powered) return { x: gx, y: gy, snapped: true, kind: 'power', label: '⚡ 전력망 접속됨' };
    if (cur.powerBlob) return { x: gx, y: gy, snapped: true, kind: 'power', label: '⚡ 건물 전력권 감지' };
    for (const [dx, dy] of DIRS8) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (inBounds(nx, ny) && (g[ny][nx].building?.type === 'power_line' || g[ny][nx].powerBlob)) {
        return {
          x: gx,
          y: gy,
          snapped: true,
          kind: 'power',
          label: g[ny][nx].powered ? '🧲 송전망 자동 접속' : '🧲 미전력 구역 스냅',
        };
      }
    }
    return none;
  }

  return none;
}

export function canBuild(
  state: CityState,
  toolId: string,
  tile: Tile | null,
  ignoreRoadCheck = false
): { ok: boolean; reason: string } {
  if (!tile) return { ok: false, reason: '' };
  if (toolId === 'inspect') return { ok: true, reason: '' };
  if (!isToolUnlocked(state, toolId)) {
    return { ok: false, reason: '인구 마일스톤 해금 필요 (우측 상단 🔓 샌드박스 클릭 시 즉시 해금)' };
  }
  if (!state.sandboxUnlock && !state.unlockedSectors[sectorIdx(tile.x, tile.y)]) {
    return { ok: false, reason: '미개방 구역입니다! [🗺️ 부지·특화]에서 구역을 매입하세요.' };
  }
  if (toolId === 'city_block') {
    if (tile.terrain === 'water') return { ok: false, reason: '물 위에는 단지 격자 불가' };
    if (tile.building) return { ok: false, reason: '' };
    return state.money >= 85 ? { ok: true, reason: '' } : { ok: false, reason: '자금 부족' };
  }
  if (toolId === 'bulldoze') {
    if (tile.building?.locked) return { ok: false, reason: '외부 연결 고속도로는 철거할 수 없습니다' };
    return tile.building || tile.zone || tile.pipe ? { ok: true, reason: '' } : { ok: false, reason: '철거할 대상 없음' };
  }
  if (toolId === 'zone_clear') return tile.zone ? { ok: true, reason: '' } : { ok: false, reason: '' };
  if (toolId === 'water_pipe') {
    if (tile.pipe) return { ok: false, reason: '' };
    return state.money >= TOOL_MAP.water_pipe.cost ? { ok: true, reason: '' } : { ok: false, reason: '자금 부족' };
  }
  if (isZoneTool(toolId)) {
    if (tile.terrain === 'water') return { ok: false, reason: '물 위에는 구역 지정 불가' };
    if (tile.building && !ZONE_SPECS[tile.building.type]) return { ok: false, reason: '시설 위에 구역 지정 불가' };
    if (!ignoreRoadCheck && !tile.hasRoad) return { ok: false, reason: '도로/대로 인접 타일에만 구역 지정 가능' };
    if (tile.zone === zoneFromTool(toolId)) return { ok: false, reason: '' };
    return state.money >= TOOL_MAP[toolId].cost ? { ok: true, reason: '' } : { ok: false, reason: '자금 부족' };
  }
  // Seamless in-place road upgrade/conversion!
  if (isRoadType(toolId) && tile.building && isRoadType(tile.building.type)) {
    if (tile.building.locked) return { ok: false, reason: '외부 고속도로는 변경할 수 없습니다' };
    if (tile.building.type === toolId) return { ok: false, reason: '' };
    const c = getBuildCost(toolId, tile);
    return state.money >= c ? { ok: true, reason: '' } : { ok: false, reason: `업그레이드 비용 ₩${c} 필요` };
  }
  if (tile.building) return { ok: false, reason: '이미 건물이 있습니다' };
  const def = TOOL_MAP[toolId];
  if (def?.coastOnly && !tile.isCoast) return { ok: false, reason: '강변·해안 타일에만 설치 가능합니다' };
  if (tile.terrain === 'water' && !isRoadType(toolId) && toolId !== 'power_line') {
    return { ok: false, reason: '물 위에는 도로(교량)·송전선·지하 수도관만 가능' };
  }
  const cost = getBuildCost(toolId, tile);
  return state.money >= cost ? { ok: true, reason: '' } : { ok: false, reason: `자금 부족 (₩${cost.toLocaleString()} 필요)` };
}

export function getEffectiveBrushMode(activeTool: string, brushMode: BrushMode): string {
  if (activeTool === 'inspect' || activeTool === 'roundabout') return 'single';
  if (activeTool === 'city_block' || brushMode === 'grid') return 'grid';
  if (brushMode === 'box') return 'box';
  if (brushMode === 'free') return 'free';
  if (isRoadType(activeTool) || activeTool === 'water_pipe' || activeTool === 'power_line') return 'line';
  if (isZoneTool(activeTool) || activeTool === 'zone_clear') return 'box';
  return 'free';
}

export function computeBrushPlan(
  state: CityState,
  activeTool: string,
  brushMode: BrushMode,
  rawSx: number,
  rawSy: number,
  rawEx: number,
  rawEy: number,
  roadDrawMode: 'straight' | 'l_bend' | 'curve' | 'upgrade' = 'l_bend',
  snapEnabled = true
): BrushPlan {
  const mode = getEffectiveBrushMode(activeTool, brushMode);
  const noSnap = (x: number, y: number): SnapInfo => ({ x, y, snapped: false, kind: 'none', label: '' });
  const snapStart = snapEnabled ? findMagneticSnap(state, activeTool, rawSx, rawSy) : noSnap(rawSx, rawSy);
  let snapEnd = snapEnabled ? findMagneticSnap(state, activeTool, rawEx, rawEy) : noSnap(rawEx, rawEy);

  const sx = snapStart.x;
  const sy = snapStart.y;
  let ex = snapEnd.x;
  let ey = snapEnd.y;

  // Cities: Skylines Straight-Axis 90-degree angle snap when in 'straight' draw mode!
  if (mode === 'line' && roadDrawMode === 'straight' && snapEnabled && (ex !== sx || ey !== sy)) {
    const adx = Math.abs(ex - sx);
    const ady = Math.abs(ey - sy);
    if (adx >= ady * 1.4) {
      ey = sy;
      snapEnd = { ...snapEnd, y: ey, snapped: true, label: snapEnd.label || '📐 직선 0° 정렬' };
    } else if (ady >= adx * 1.4) {
      ex = sx;
      snapEnd = { ...snapEnd, x: ex, snapped: true, label: snapEnd.label || '📐 직각 90° 정렬' };
    }
  }

  const items: BrushPlanItem[] = [];
  const x0 = Math.min(sx, ex);
  const x1 = Math.max(sx, ex);
  const y0 = Math.min(sy, ey);
  const y1 = Math.max(sy, ey);
  let hasTurn = false;
  const added = new Set<number>();
  const pushCoord = (x: number, y: number, tool = activeTool, withPipe = false, ignoreRoadCheck = false) => {
    if (!inBounds(x, y)) return;
    const k = y * 100 + x;
    if (added.has(k)) return;
    added.add(k);
    items.push({ x, y, tool, withPipe, ignoreRoadCheck });
  };

  if (mode === 'line' && roadDrawMode === 'upgrade' && isRoadType(activeTool)) {
    // Cities: Skylines Road Upgrade Mode — upgrade ONLY existing roads along the path!
    const horizFirst = Math.abs(ex - sx) >= Math.abs(ey - sy);
    const tryAddRoad = (x: number, y: number) => {
      if (inBounds(x, y) && isRoadType(state.grid[y][x].building?.type)) pushCoord(x, y);
    };
    if (horizFirst) {
      const dx = Math.sign(ex - sx) || 1;
      for (let x = sx; x !== ex + dx; x += dx) tryAddRoad(x, sy);
      const dy = Math.sign(ey - sy);
      if (dy !== 0) for (let y = sy + dy; y !== ey + dy; y += dy) tryAddRoad(ex, y);
    } else {
      const dy = Math.sign(ey - sy) || 1;
      for (let y = sy; y !== ey + dy; y += dy) tryAddRoad(sx, y);
      const dx = Math.sign(ex - sx);
      if (dx !== 0) for (let x = sx + dx; x !== ex + dx; x += dx) tryAddRoad(x, ey);
    }
  } else if (mode === 'line' && roadDrawMode === 'curve' && ex !== sx && ey !== sy) {
    // Cities: Skylines Smooth Quadratic Bezier Curve rasterized with 4-way road continuity!
    hasTurn = true;
    const cx = Math.abs(ex - sx) >= Math.abs(ey - sy) ? ex : sx;
    const cy = Math.abs(ex - sx) >= Math.abs(ey - sy) ? sy : ey;
    const steps = Math.max(8, (Math.abs(ex - sx) + Math.abs(ey - sy)) * 3);
    let prevX = sx;
    let prevY = sy;
    pushCoord(sx, sy);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const fx = Math.round(u * u * sx + 2 * u * t * cx + t * t * ex);
      const fy = Math.round(u * u * sy + 2 * u * t * cy + t * t * ey);
      // Bridge any diagonal step orthogonally so roads stay 100% connected!
      while (prevX !== fx || prevY !== fy) {
        if (prevX !== fx) {
          prevX += Math.sign(fx - prevX);
          pushCoord(prevX, prevY);
        }
        if (prevY !== fy) {
          prevY += Math.sign(fy - prevY);
          pushCoord(prevX, prevY);
        }
      }
    }
  } else if (mode === 'line' && roadDrawMode === 'straight' && ex !== sx && ey !== sy) {
    // Stepped straight diagonal line with 4-way continuity
    hasTurn = true;
    const steps = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
    let prevX = sx;
    let prevY = sy;
    pushCoord(sx, sy);
    for (let i = 1; i <= steps; i++) {
      const fx = Math.round(sx + ((ex - sx) * i) / steps);
      const fy = Math.round(sy + ((ey - sy) * i) / steps);
      while (prevX !== fx || prevY !== fy) {
        if (prevX !== fx) { prevX += Math.sign(fx - prevX); pushCoord(prevX, prevY); }
        if (prevY !== fy) { prevY += Math.sign(fy - prevY); pushCoord(prevX, prevY); }
      }
    }
  } else if (mode === 'line') {
    const horizFirst = Math.abs(ex - sx) >= Math.abs(ey - sy);
    hasTurn = ex !== sx && ey !== sy;
    if (horizFirst) {
      const dx = Math.sign(ex - sx) || 1;
      for (let x = sx; x !== ex + dx; x += dx) pushCoord(x, sy);
      const dy = Math.sign(ey - sy);
      if (dy !== 0) for (let y = sy + dy; y !== ey + dy; y += dy) pushCoord(ex, y);
    } else {
      const dy = Math.sign(ey - sy) || 1;
      for (let y = sy; y !== ey + dy; y += dy) pushCoord(sx, y);
      const dx = Math.sign(ex - sx);
      if (dx !== 0) for (let x = sx + dx; x !== ex + dx; x += dx) pushCoord(x, ey);
    }
  } else if (mode === 'box') {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) pushCoord(x, y);
    }
  } else if (mode === 'grid') {
    const zTool = isZoneTool(activeTool) ? activeTool : null;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!inBounds(x, y)) continue;
        const onGrid = (x - x0) % 5 === 0 || (y - y0) % 5 === 0 || x === x1 || y === y1;
        if (onGrid) {
          pushCoord(x, y, 'road', true, false);
        } else if (zTool) {
          const nearRoad =
            (x - x0) % 5 === 1 ||
            (x - x0) % 5 === 4 ||
            (y - y0) % 5 === 1 ||
            (y - y0) % 5 === 4 ||
            x === x1 - 1 ||
            y === y1 - 1;
          if (nearRoad) pushCoord(x, y, zTool, false, true);
        }
      }
    }
  } else {
    pushCoord(ex, ey);
  }

  let estCost = 0;
  let validCount = 0;
  for (const it of items) {
    const tile = state.grid[it.y][it.x];
    const chk = canBuild(state, it.tool, tile, !!it.ignoreRoadCheck);
    it.ok = chk.ok;
    if (chk.ok) {
      validCount++;
      estCost += getBuildCost(it.tool, tile) + (it.withPipe && !tile.pipe ? TOOL_MAP.water_pipe.cost : 0);
    }
  }

  const angleDeg =
    ex === sx && ey === sy
      ? 0
      : Math.round((Math.atan2(Math.abs(ey - sy), Math.abs(ex - sx)) * 180) / Math.PI);
  const meters = Math.max(10, items.length * 10);

  let connectionNote = '';
  if (roadDrawMode === 'upgrade' && isRoadType(activeTool)) {
    connectionNote = validCount > 0 ? `⬆️ 기존 도로 ${validCount}칸 업그레이드` : '⬆️ 업그레이드할 도로를 클릭·드래그';
  } else if (activeTool === 'power_line' && items.length > 0) {
    let touchesPowered = false;
    let touchesUnpowered = false;
    for (const it of items) {
      for (const [dx, dy] of [[0, 0], ...DIRS8]) {
        const nx = it.x + dx;
        const ny = it.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nt = state.grid[ny][nx];
        if (nt.powered) touchesPowered = true;
        else if (nt.powerBlob) touchesUnpowered = true;
      }
    }
    if (touchesPowered && touchesUnpowered) connectionNote = '⚡ 전력망 브릿지 완성!';
    else if (touchesPowered) connectionNote = '⚡ 전력 공급선 연장';
    else if (touchesUnpowered) connectionNote = '⚠️ 발전소와 연결 필요';
  } else if (activeTool === 'water_pipe' && items.length > 0) {
    let touchesWater = false;
    let touchesSewage = false;
    for (const it of items) {
      for (const [dx, dy] of [[0, 0], ...DIRS]) {
        const nx = it.x + dx;
        const ny = it.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nt = state.grid[ny][nx];
        if (nt.hasWater || nt.building?.type === 'water_pump') touchesWater = true;
        if (nt.hasSewage || nt.building?.type === 'sewage') touchesSewage = true;
      }
    }
    if (touchesWater && touchesSewage) connectionNote = '💧 상수·하수 본관 완벽 연결!';
    else if (touchesWater) connectionNote = '💧 급수관 연결 (하수관 확인)';
    else if (touchesSewage) connectionNote = '🌊 하수관 연결 (취수장 확인)';
  } else if (isRoadType(activeTool) && items.length > 1) {
    const bridges = items.filter(it => state.grid[it.y][it.x].terrain === 'water').length;
    if (bridges > 0) connectionNote = `🌉 교량 ${bridges}칸 포함`;
    else if (roadDrawMode === 'curve' && hasTurn) connectionNote = '〰️ 완만한 곡선 도로 생성';
    else if (hasTurn) connectionNote = '↱ 90° 곡선 코너 자동 생성';
    else if (snapEnd.snapped) connectionNote = snapEnd.label;
  } else if (snapEnd.snapped) {
    connectionNote = snapEnd.label;
  }

  return {
    mode,
    items,
    validCount,
    estCost,
    length: items.length,
    meters,
    angleDeg,
    hasTurn,
    startX: sx,
    startY: sy,
    endX: ex,
    endY: ey,
    snapStart,
    snapEnd,
    connectionNote,
  };
}

export function executeSingleTile(
  state: CityState,
  gx: number,
  gy: number,
  toolId: string,
  activeView: InfoViewId,
  animTime: number,
  withPipe = false,
  ignoreRoadCheck = false
): { applied: boolean; reason: string } {
  const tile = state.grid[gy]?.[gx];
  if (!tile) return { applied: false, reason: '' };
  const chk = canBuild(state, toolId, tile, ignoreRoadCheck);
  if (!chk.ok) return { applied: false, reason: chk.reason };
  const extraPipe = withPipe && !tile.pipe ? TOOL_MAP.water_pipe.cost : 0;
  const cost = getBuildCost(toolId, tile) + extraPipe;
  if (state.money < cost) return { applied: false, reason: '자금 부족' };

  if (toolId === 'bulldoze') {
    state.money -= cost;
    if (activeView === 'water' && tile.pipe && !tile.building) {
      tile.pipe = false;
    } else {
      tile.building = null;
      tile.zone = null;
      tile.zoneProgress = 0;
      tile.onFire = false;
      if (!tile.building) tile.pipe = false;
    }
  } else if (toolId === 'zone_clear') {
    tile.zone = null;
    tile.zoneProgress = 0;
    if (tile.building && ZONE_SPECS[tile.building.type]) tile.building = null;
  } else if (toolId === 'water_pipe') {
    state.money -= cost;
    tile.pipe = true;
  } else if (isZoneTool(toolId)) {
    state.money -= cost;
    const zt = zoneFromTool(toolId);
    if (tile.building && ZONE_SPECS[tile.building.type] && tile.building.type !== zt) tile.building = null;
    tile.zone = zt;
    tile.zoneProgress = 35;
    tile.wildTree = false;
  } else {
    state.money -= cost;
    tile.wildTree = false;
    tile.zone = null;
    tile.building = { type: toolId, level: 1, growth: 0, neglect: 0, abandoned: false, builtAt: animTime };
    if (withPipe || toolId === 'water_pump' || toolId === 'sewage') tile.pipe = true;
  }
  return { applied: true, reason: '' };
}
