import * as THREE from 'three';
import { DIRS, DIRS8, GRID, PIPE_OFFSETS, inBounds, isRoadType } from '../sim/constants';
import { isZoneTool } from '../sim/builder';
import type { BrushPlan, CityState, InfoViewId } from '../sim/types';

export function tileWorldX(gx: number): number {
  return gx - GRID / 2 + 0.5;
}
export function tileWorldZ(gy: number): number {
  return gy - GRID / 2 + 0.5;
}
export function tileWorldY(state: CityState, gx: number, gy: number): number {
  const t = state.grid[gy]?.[gx];
  if (!t) return 0;
  return t.terrain === 'water' ? -0.15 : t.elev;
}

export class ConnectionOverlays {
  public root = new THREE.Group();
  private powerGroup = new THREE.Group();
  private waterGroup = new THREE.Group();
  private cableGroup = new THREE.Group();
  private previewGroup = new THREE.Group();
  private zoneGuideGroup = new THREE.Group();

  // Animated water pulse beads along active pipes
  private pulseMesh: THREE.InstancedMesh;
  private pulseSegments: { x0: number; z0: number; x1: number; z1: number; phase: number; polluted: boolean }[] = [];

  // Reusable shared geometries & materials
  private planeGeo = new THREE.PlaneGeometry(0.96, 0.96);
  private zoneOutlineGeo = new THREE.PlaneGeometry(0.86, 0.86);
  private pipeSegGeo = new THREE.CylinderGeometry(0.085, 0.085, 1, 8);
  private pipeNodeGeo = new THREE.SphereGeometry(0.115, 10, 8);
  private snapRingGeo = new THREE.TorusGeometry(0.46, 0.055, 8, 28);
  private previewBoxGeo = new THREE.BoxGeometry(0.92, 0.14, 0.92);

  private matPipeActive = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.5,
  });
  private matPipeDry = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    emissive: 0x334155,
    emissiveIntensity: 0.25,
    roughness: 0.5,
  });
  private matPipePreview = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.9,
  });
  private matWaterAura = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  private matWaterAuraPreview = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  private matPowerOn = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  private matPowerOff = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  private matCableOn = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.85,
    roughness: 0.3,
    metalness: 0.6,
  });
  private matCableOff = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.5,
  });
  private matCablePreview = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
  });
  private matSnapRing = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  private matPreviewOk = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  private matPreviewBad = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  private matZoneGuide = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  private snapRingMesh: THREE.Mesh;
  private anchorRingMesh: THREE.Mesh;
  private guideLineGroup = new THREE.Group();
  private dummy = new THREE.Object3D();
  private tmpCol = new THREE.Color();

  constructor() {
    this.planeGeo.rotateX(-Math.PI / 2);
    this.zoneOutlineGeo.rotateX(-Math.PI / 2);
    this.snapRingGeo.rotateX(-Math.PI / 2);

    this.root.add(this.cableGroup);
    this.root.add(this.powerGroup);
    this.root.add(this.waterGroup);
    this.root.add(this.zoneGuideGroup);
    this.root.add(this.guideLineGroup);
    this.root.add(this.previewGroup);

    const pulseGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    this.pulseMesh = new THREE.InstancedMesh(pulseGeo, pulseMat, 400);
    this.pulseMesh.count = 0;
    this.pulseMesh.frustumCulled = false;
    this.waterGroup.add(this.pulseMesh);

    this.snapRingMesh = new THREE.Mesh(this.snapRingGeo, this.matSnapRing);
    this.snapRingMesh.visible = false;
    this.snapRingMesh.renderOrder = 20;
    this.root.add(this.snapRingMesh);

    this.anchorRingMesh = new THREE.Mesh(
      this.snapRingGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95, depthTest: false })
    );
    this.anchorRingMesh.visible = false;
    this.anchorRingMesh.renderOrder = 21;
    this.root.add(this.anchorRingMesh);
  }

  private clearGroup(g: THREE.Group, keep?: THREE.Object3D) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const ch = g.children[i];
      if (ch === keep) continue;
      if ((ch as THREE.Mesh).geometry && (ch as THREE.Mesh).geometry !== this.planeGeo &&
          (ch as THREE.Mesh).geometry !== this.zoneOutlineGeo &&
          (ch as THREE.Mesh).geometry !== this.pipeSegGeo &&
          (ch as THREE.Mesh).geometry !== this.pipeNodeGeo &&
          (ch as THREE.Mesh).geometry !== this.previewBoxGeo) {
        (ch as THREE.Mesh).geometry.dispose();
      }
      g.remove(ch);
    }
  }

  // Always-on 3D Catenary High-Voltage Cables between pylons & adjacent buildings!
  public rebuildPowerCables(state: CityState) {
    this.clearGroup(this.cableGroup);
    const g = state.grid;
    const drawnPairs = new Set<string>();

    const addCatenary = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      powered: boolean,
      dualWire = true
    ) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) return;
      const px = (-dz / len) * 0.16;
      const pz = (dx / len) * 0.16;
      const offsets = dualWire ? [[-px, -pz], [px, pz]] : [[0, 0]];
      const sag = Math.min(0.42, 0.14 + len * 0.09);

      for (const [ox, oz] of offsets) {
        const p0 = new THREE.Vector3(x0 + ox, y0, z0 + oz);
        const p2 = new THREE.Vector3(x1 + ox, y1, z1 + oz);
        const mid = new THREE.Vector3((p0.x + p2.x) * 0.5, Math.min(y0, y1) - sag, (p0.z + p2.z) * 0.5);
        const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
        const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.022, 4, false);
        const mesh = new THREE.Mesh(tubeGeo, powered ? this.matCableOn : this.matCableOff);
        this.cableGroup.add(mesh);
      }
    };

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const t = g[y][x];
        if (t.building?.type !== 'power_line') continue;
        const wx = tileWorldX(x);
        const wz = tileWorldZ(y);
        const wy = Math.max(0, tileWorldY(state, x, y)) + 1.18;

        // Connect to neighbor pylons (cardinal, diagonal, or 2-tile river/highway span!)
        for (const [dx, dy] of [...DIRS8, [2, 0], [0, 2], [-2, 0], [0, -2]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const nt = g[ny][nx];
          if (nt.building?.type !== 'power_line') continue;
          // Skip 2-tile span if middle tile already has a pylon
          if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
            if (g[y + dy / 2][x + dx / 2].building?.type === 'power_line') continue;
          }
          const key = x < nx || (x === nx && y < ny) ? `${x},${y}-${nx},${ny}` : `${nx},${ny}-${x},${y}`;
          if (drawnPairs.has(key)) continue;
          drawnPairs.add(key);

          const nwx = tileWorldX(nx);
          const nwz = tileWorldZ(ny);
          const nwy = Math.max(0, tileWorldY(state, nx, ny)) + 1.18;
          addCatenary(wx, wy, wz, nwx, nwy, nwz, t.powered && nt.powered, true);
        }

        // Hook terminal wire into nearest adjacent non-road building / power plant!
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const nb = g[ny][nx].building;
          if (nb && nb.type !== 'power_line' && !isRoadType(nb.type)) {
            const nwx = tileWorldX(nx);
            const nwz = tileWorldZ(ny);
            const nwy = Math.max(0, tileWorldY(state, nx, ny)) + 0.55;
            addCatenary(wx, wy - 0.1, wz, nwx, nwy, nwz, t.powered, false);
            break;
          }
        }
      }
    }
  }

  // Rebuild Power Coverage Aura & Underground 3D Water Pipe Network when relevant view/tool is active
  public rebuildUtilityOverlays(state: CityState, activeView: InfoViewId, activeTool: string) {
    const showPower =
      activeView === 'power' ||
      activeTool === 'power_line' ||
      activeTool === 'wind' ||
      activeTool === 'coal' ||
      activeTool === 'solar';
    const showWater =
      activeView === 'water' ||
      activeTool === 'water_pipe' ||
      activeTool === 'water_pump' ||
      activeTool === 'sewage';

    this.powerGroup.visible = showPower;
    this.waterGroup.visible = showWater;

    this.clearGroup(this.powerGroup);
    if (showPower) {
      const onCoords: [number, number][] = [];
      const offCoords: [number, number][] = [];
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const t = state.grid[y][x];
          if (!t.powerBlob) continue;
          if (t.powered) onCoords.push([x, y]);
          else offCoords.push([x, y]);
        }
      }
      if (onCoords.length > 0) {
        const im = new THREE.InstancedMesh(this.planeGeo, this.matPowerOn, onCoords.length);
        onCoords.forEach(([x, y], i) => {
          this.dummy.position.set(tileWorldX(x), Math.max(0, tileWorldY(state, x, y)) + 0.08, tileWorldZ(y));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(i, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.powerGroup.add(im);
      }
      if (offCoords.length > 0) {
        const im = new THREE.InstancedMesh(this.planeGeo, this.matPowerOff, offCoords.length);
        offCoords.forEach(([x, y], i) => {
          this.dummy.position.set(tileWorldX(x), Math.max(0, tileWorldY(state, x, y)) + 0.09, tileWorldZ(y));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(i, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.powerGroup.add(im);
      }
    }

    this.clearGroup(this.waterGroup, this.pulseMesh);
    this.pulseSegments = [];
    this.pulseMesh.count = 0;

    if (showWater) {
      const g = state.grid;
      const auraTiles: [number, number][] = [];
      const activeNodes: [number, number][] = [];
      const dryNodes: [number, number][] = [];
      const activeSegs: { x: number; z: number; rotY: number }[] = [];
      const drySegs: { x: number; z: number; rotY: number }[] = [];

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const t = g[y][x];
          if (t.hasWater || t.hasSewage) auraTiles.push([x, y]);
          if (!t.pipe) continue;
          const active = t.hasWater || t.hasSewage;
          if (active) activeNodes.push([x, y]);
          else dryNodes.push([x, y]);

          const wx = tileWorldX(x);
          const wz = tileWorldZ(y);
          // Connect East (+x) and South (+y) segments cleanly
          if (x + 1 < GRID && g[y][x + 1].pipe) {
            const seg = { x: wx + 0.5, z: wz, rotY: Math.PI / 2 };
            if (active) {
              activeSegs.push(seg);
              if (this.pulseSegments.length < 380) {
                this.pulseSegments.push({ x0: wx, z0: wz, x1: wx + 1, z1: wz, phase: (x * 0.23 + y * 0.17) % 1, polluted: t.waterPolluted });
              }
            } else drySegs.push(seg);
          }
          if (y + 1 < GRID && g[y + 1][x].pipe) {
            const seg = { x: wx, z: wz + 0.5, rotY: 0 };
            if (active) {
              activeSegs.push(seg);
              if (this.pulseSegments.length < 380) {
                this.pulseSegments.push({ x0: wx, z0: wz, x1: wx, z1: wz + 1, phase: (x * 0.19 + y * 0.31) % 1, polluted: t.waterPolluted });
              }
            } else drySegs.push(seg);
          }
        }
      }

      if (auraTiles.length > 0) {
        const im = new THREE.InstancedMesh(this.planeGeo, this.matWaterAura, auraTiles.length);
        auraTiles.forEach(([x, y], i) => {
          this.dummy.position.set(tileWorldX(x), Math.max(-0.1, tileWorldY(state, x, y)) + 0.07, tileWorldZ(y));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(i, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.waterGroup.add(im);
      }

      const addNodes = (arr: [number, number][], mat: THREE.Material) => {
        if (!arr.length) return;
        const im = new THREE.InstancedMesh(this.pipeNodeGeo, mat, arr.length);
        arr.forEach(([x, y], i) => {
          this.dummy.position.set(tileWorldX(x), 0.26, tileWorldZ(y));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(i, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.waterGroup.add(im);
      };
      const addSegs = (arr: { x: number; z: number; rotY: number }[], mat: THREE.Material) => {
        if (!arr.length) return;
        const im = new THREE.InstancedMesh(this.pipeSegGeo, mat, arr.length);
        arr.forEach((s, i) => {
          this.dummy.position.set(s.x, 0.26, s.z);
          this.dummy.rotation.set(Math.PI / 2, 0, s.rotY);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(i, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.waterGroup.add(im);
      };

      addNodes(activeNodes, this.matPipeActive);
      addNodes(dryNodes, this.matPipeDry);
      addSegs(activeSegs, this.matPipeActive);
      addSegs(drySegs, this.matPipeDry);
    }
  }

  // Live Cities: Skylines Brush Preview + Roadside Zoning Grid + Pipe Radius Preview + Snap Ring + 90° Guidelines!
  public updateLivePreview(
    state: CityState,
    activeTool: string,
    hover: { x: number; y: number } | null,
    plan: BrushPlan | null,
    anchor: { x: number; y: number } | null = null
  ) {
    this.clearGroup(this.previewGroup);
    this.clearGroup(this.zoneGuideGroup);
    this.clearGroup(this.guideLineGroup);
    this.snapRingMesh.visible = false;
    this.anchorRingMesh.visible = false;

    if (!hover || activeTool === 'inspect') return;

    // 0. Cities: Skylines Start Anchor Pin & Blue 90° Alignment Guidelines!
    if (anchor) {
      const ax = tileWorldX(anchor.x);
      const az = tileWorldZ(anchor.y);
      const ay = Math.max(0.14, tileWorldY(state, anchor.x, anchor.y) + 0.22);
      this.anchorRingMesh.position.set(ax, ay, az);
      this.anchorRingMesh.visible = true;

      const span = 18;
      const gPts = new Float32Array([
        ax - span, ay, az, ax + span, ay, az,
        ax, ay, az - span, ax, ay, az + span,
      ]);
      const gGeo = new THREE.BufferGeometry();
      gGeo.setAttribute('position', new THREE.BufferAttribute(gPts, 3));
      const gLine = new THREE.LineSegments(
        gGeo,
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.62, depthTest: false })
      );
      gLine.renderOrder = 19;
      this.guideLineGroup.add(gLine);
    }

    // 1. Magnetic Snap Ring indicator!
    if (plan && plan.snapEnd.snapped) {
      const sx = plan.snapEnd.x;
      const sy = plan.snapEnd.y;
      this.snapRingMesh.position.set(tileWorldX(sx), Math.max(0.12, tileWorldY(state, sx, sy) + 0.2), tileWorldZ(sy));
      this.matSnapRing.color.setHex(
        plan.snapEnd.kind === 'pipe'
          ? 0x22d3ee
          : plan.snapEnd.kind === 'power'
            ? 0xfacc15
            : plan.snapEnd.kind === 'coast'
              ? 0x38bdf8
              : 0x4ade80
      );
      this.snapRingMesh.visible = true;
    }

    // 2. Roadside Zoning Grid Guides (when placing roads or zoning!)
    if (isRoadType(activeTool) || isZoneTool(activeTool) || activeTool === 'city_block') {
      const guideSet = new Set<number>();
      const cx = hover.x;
      const cy = hover.y;
      // Show buildable roadside cells around cursor
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(nx, ny)) continue;
          const nt = state.grid[ny][nx];
          if (nt.terrain !== 'water' && !nt.building && nt.hasRoad) guideSet.add(ny * GRID + nx);
        }
      }
      // Also show NEW roadside cells that the currently dragged road plan will unlock!
      if (plan && (isRoadType(activeTool) || activeTool === 'city_block')) {
        for (const it of plan.items) {
          if (!isRoadType(it.tool) || it.tool === 'highway') continue;
          for (const [dx, dy] of DIRS) {
            const nx = it.x + dx;
            const ny = it.y + dy;
            if (!inBounds(nx, ny)) continue;
            const nt = state.grid[ny][nx];
            if (nt.terrain !== 'water' && !nt.building) guideSet.add(ny * GRID + nx);
          }
        }
      }
      if (guideSet.size > 0) {
        const im = new THREE.InstancedMesh(this.zoneOutlineGeo, this.matZoneGuide, guideSet.size);
        let idx = 0;
        guideSet.forEach(k => {
          const gx = k % GRID;
          const gy = (k / GRID) | 0;
          this.dummy.position.set(tileWorldX(gx), tileWorldY(state, gx, gy) + 0.06, tileWorldZ(gy));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(idx++, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.zoneGuideGroup.add(im);
      }
    }

    if (!plan || plan.items.length === 0) return;

    // 3. Special Live 3D Water Pipe Tube + 4-Tile Coverage Preview!
    if (activeTool === 'water_pipe') {
      const auraSet = new Set<number>();
      for (const it of plan.items) {
        for (const [dx, dy] of PIPE_OFFSETS) {
          const nx = it.x + dx;
          const ny = it.y + dy;
          if (inBounds(nx, ny) && !state.grid[ny][nx].hasWater) auraSet.add(ny * GRID + nx);
        }
      }
      if (auraSet.size > 0) {
        const im = new THREE.InstancedMesh(this.planeGeo, this.matWaterAuraPreview, auraSet.size);
        let idx = 0;
        auraSet.forEach(k => {
          const gx = k % GRID;
          const gy = (k / GRID) | 0;
          this.dummy.position.set(tileWorldX(gx), Math.max(-0.08, tileWorldY(state, gx, gy)) + 0.09, tileWorldZ(gy));
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          im.setMatrixAt(idx++, this.dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.previewGroup.add(im);
      }
      // Draw smooth preview cylinder segments connecting dragged pipe path!
      for (let i = 0; i < plan.items.length; i++) {
        const it = plan.items[i];
        const node = new THREE.Mesh(this.pipeNodeGeo, this.matPipePreview);
        node.position.set(tileWorldX(it.x), 0.3, tileWorldZ(it.y));
        this.previewGroup.add(node);
        if (i > 0) {
          const prev = plan.items[i - 1];
          const seg = new THREE.Mesh(this.pipeSegGeo, this.matPipePreview);
          seg.position.set((tileWorldX(prev.x) + tileWorldX(it.x)) * 0.5, 0.3, (tileWorldZ(prev.y) + tileWorldZ(it.y)) * 0.5);
          seg.rotation.set(Math.PI / 2, 0, prev.x !== it.x ? Math.PI / 2 : 0);
          this.previewGroup.add(seg);
        }
      }
      return;
    }

    // 4. Special Live 3D Catenary Cable Preview for Power Lines!
    if (activeTool === 'power_line' && plan.items.length > 1) {
      for (let i = 1; i < plan.items.length; i++) {
        const a = plan.items[i - 1];
        const b = plan.items[i];
        const p0 = new THREE.Vector3(tileWorldX(a.x), Math.max(0, tileWorldY(state, a.x, a.y)) + 1.18, tileWorldZ(a.y));
        const p2 = new THREE.Vector3(tileWorldX(b.x), Math.max(0, tileWorldY(state, b.x, b.y)) + 1.18, tileWorldZ(b.y));
        const mid = new THREE.Vector3((p0.x + p2.x) * 0.5, Math.min(p0.y, p2.y) - 0.22, (p0.z + p2.z) * 0.5);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, mid, p2), 6, 0.032, 4, false),
          this.matCablePreview
        );
        this.previewGroup.add(tube);
      }
    }

    // 5. Standard Instanced Ghost Tiles for Roads, Zones, Buildings, Blocks
    const okItems = plan.items.filter(it => it.ok);
    const badItems = plan.items.filter(it => !it.ok);
    if (okItems.length > 0) {
      const im = new THREE.InstancedMesh(this.previewBoxGeo, this.matPreviewOk, okItems.length);
      okItems.forEach((it, i) => {
        this.dummy.position.set(tileWorldX(it.x), Math.max(-0.08, tileWorldY(state, it.x, it.y)) + 0.12, tileWorldZ(it.y));
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        im.setMatrixAt(i, this.dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      this.previewGroup.add(im);
    }
    if (badItems.length > 0) {
      const im = new THREE.InstancedMesh(this.previewBoxGeo, this.matPreviewBad, badItems.length);
      badItems.forEach((it, i) => {
        this.dummy.position.set(tileWorldX(it.x), Math.max(-0.08, tileWorldY(state, it.x, it.y)) + 0.12, tileWorldZ(it.y));
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        im.setMatrixAt(i, this.dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      this.previewGroup.add(im);
    }
  }

  public animate(time: number) {
    // Pulse magnetic snap ring smoothly
    if (this.snapRingMesh.visible) {
      const s = 1 + Math.sin(time * 7.5) * 0.12;
      this.snapRingMesh.scale.set(s, 1, s);
    }
    // Pulse unpowered power blobs gently
    this.matPowerOff.opacity = 0.28 + Math.sin(time * 5.0) * 0.11;

    // Animate glowing water pulses flowing through underground pipes!
    if (this.waterGroup.visible && this.pulseSegments.length > 0) {
      const n = Math.min(this.pulseSegments.length, 400);
      this.pulseMesh.count = n;
      for (let i = 0; i < n; i++) {
        const seg = this.pulseSegments[i];
        const f = (seg.phase + time * 0.65) % 1;
        this.dummy.position.set(seg.x0 + (seg.x1 - seg.x0) * f, 0.27, seg.z0 + (seg.z1 - seg.z0) * f);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.pulseMesh.setMatrixAt(i, this.dummy.matrix);
        this.tmpCol.setHex(seg.polluted ? 0xa16207 : 0xe0f2fe);
        this.pulseMesh.setColorAt(i, this.tmpCol);
      }
      this.pulseMesh.instanceMatrix.needsUpdate = true;
      if (this.pulseMesh.instanceColor) this.pulseMesh.instanceColor.needsUpdate = true;
    } else {
      this.pulseMesh.count = 0;
    }
  }
}
