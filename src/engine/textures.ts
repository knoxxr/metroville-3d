import * as THREE from 'three';

export interface PBRTextureSet {
  terrainGrass: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  plazaTile: THREE.CanvasTexture;
  roofConcrete: THREE.CanvasTexture;
  roadStraight: THREE.CanvasTexture;
  avenueStraight: THREE.CanvasTexture;
  highwayStraight: THREE.CanvasTexture;
  roadCorner: THREE.CanvasTexture;
  roadCross: THREE.CanvasTexture;
  roundabout: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  resLow: THREE.CanvasTexture;
  resLowEmi: THREE.CanvasTexture;
  resHigh: THREE.CanvasTexture;
  resHighEmi: THREE.CanvasTexture;
  comHigh: THREE.CanvasTexture;
  comHighEmi: THREE.CanvasTexture;
  office: THREE.CanvasTexture;
  officeEmi: THREE.CanvasTexture;
  // 4 NEW diverse architectural PBR facade + emissive night pairs!
  goldGlass: THREE.CanvasTexture;
  goldGlassEmi: THREE.CanvasTexture;
  modernWhite: THREE.CanvasTexture;
  modernWhiteEmi: THREE.CanvasTexture;
  terracottaBrick: THREE.CanvasTexture;
  terracottaBrickEmi: THREE.CanvasTexture;
  artDecoStone: THREE.CanvasTexture;
  artDecoStoneEmi: THREE.CanvasTexture;
  industrial: THREE.CanvasTexture;
  civic: THREE.CanvasTexture;
  solar: THREE.CanvasTexture;
  buildingBump: THREE.CanvasTexture;
  buildingRough: THREE.CanvasTexture;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTex(c: HTMLCanvasElement, isSRGB = true, repeat = false, repeatScale = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (repeatScale !== 1) tex.repeat.set(repeatScale, repeatScale);
  }
  tex.needsUpdate = true;
  return tex;
}

function hash2(a: number, b: number): number {
  return Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
}

function fillAsphaltNoise(ctx: CanvasRenderingContext2D, size: number, base = '#2b313d') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4200; i++) {
    const px = hash2(i, 1.3) * size;
    const py = hash2(i, 2.7) * size;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.065)';
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.09)';
  ctx.fillRect(size * 0.28, 0, size * 0.14, size);
  ctx.fillRect(size * 0.58, 0, size * 0.14, size);
}

function createFacadePair(
  wallTop: string,
  wallBot: string,
  frameCol: string,
  glassTop: string,
  glassBot: string,
  emiWarm: string,
  emiCool: string,
  cols: number,
  rows: number,
  seed: number,
  style: 'glass' | 'modern' | 'brick' | 'deco' = 'glass'
): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const S = 512;
  const [ac, actx] = makeCanvas(S);
  const [ec, ectx] = makeCanvas(S);

  const bg = actx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, wallTop);
  bg.addColorStop(1, wallBot);
  actx.fillStyle = bg;
  actx.fillRect(0, 0, S, S);

  // Subtle brick/stone masonry micro-texture for brick & Art Deco facades
  if (style === 'brick' || style === 'deco') {
    for (let i = 0; i < 1600; i++) {
      const px = hash2(i, seed + 1.1) * S;
      const py = hash2(i, seed + 2.3) * S;
      actx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      actx.fillRect(px, py, style === 'brick' ? 12 : 18, 4);
    }
  }

  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, S, S);

  const cw = S / cols;
  const rh = S / rows;
  const glassy = style === 'glass';

  // Horizontal balcony/spandrel bands
  for (let r = 0; r < rows; r++) {
    actx.fillStyle = frameCol;
    const bandH = style === 'modern' ? 14 : glassy ? 5 : 8;
    actx.fillRect(0, r * rh, S, bandH);
    actx.fillStyle = 'rgba(0,0,0,0.22)';
    actx.fillRect(0, r * rh + bandH, S, style === 'modern' ? 6 : 3);
  }
  // Vertical pilasters / ribs
  for (let c = 0; c < cols; c++) {
    actx.fillStyle = frameCol;
    const pilW = style === 'deco' ? 12 : glassy ? 3 : 6;
    actx.fillRect(c * cw, 0, pilW, S);
  }

  for (let r = 0; r < rows; r++) {
    const floorLitBias = hash2(r + 1, seed * 3.1);
    for (let c = 0; c < cols; c++) {
      const h = hash2(c * 3.7 + seed, r * 5.3 + seed * 1.9);
      const padX = style === 'deco' ? 14 : glassy ? 5 : style === 'modern' ? 6 : 10;
      const padY = style === 'modern' ? 17 : glassy ? 8 : 11;
      const wx = c * cw + padX;
      const wy = r * rh + padY;
      const ww = cw - padX * 2;
      const wh = Math.max(8, rh - padY * 1.55);

      const wg = actx.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
      wg.addColorStop(0, glassTop);
      wg.addColorStop(0.5, glassy ? '#bae6fd' : '#3b4c63');
      wg.addColorStop(1, glassBot);
      actx.fillStyle = wg;
      actx.fillRect(wx, wy, ww, wh);

      if (glassy && (r + c) % 3 === 0) {
        actx.fillStyle = 'rgba(255,255,255,0.14)';
        actx.beginPath();
        actx.moveTo(wx, wy);
        actx.lineTo(wx + ww * 0.6, wy);
        actx.lineTo(wx, wy + wh * 0.72);
        actx.closePath();
        actx.fill();
      }

      if (style === 'brick' || style === 'deco') {
        actx.fillStyle = '#f8fafc';
        actx.globalAlpha = 0.75;
        actx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
        actx.fillRect(wx - 2, wy + wh, ww + 4, 4);
        actx.globalAlpha = 1;
      } else if (style === 'modern') {
        // Glass balcony railing highlight
        actx.fillStyle = 'rgba(224,242,254,0.38)';
        actx.fillRect(wx - 3, wy + wh * 0.55, ww + 6, wh * 0.45);
      }

      const litScore = h * 0.68 + floorLitBias * 0.32;
      if (litScore > 0.44) {
        const intensity = Math.min(1, 0.45 + (litScore - 0.44) * 1.25);
        ectx.globalAlpha = intensity;
        const winGrad = ectx.createLinearGradient(wx, wy, wx, wy + wh);
        winGrad.addColorStop(0, h > 0.58 ? emiWarm : emiCool);
        winGrad.addColorStop(1, '#f59e0b');
        ectx.fillStyle = winGrad;
        ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        ectx.fillStyle = '#ffffff';
        ectx.globalAlpha = intensity * 0.42;
        ectx.fillRect(wx + 4, wy + 3, ww - 8, Math.max(3, wh * 0.18));
        ectx.globalAlpha = 1;
      }
    }
  }

  // Ground-floor stone colonnade & warm storefront lobby
  actx.fillStyle = '#1e293b';
  actx.fillRect(0, S - 42, S, 42);
  actx.fillStyle = frameCol;
  actx.fillRect(0, S - 46, S, 5);
  for (let c = 0; c < cols; c++) {
    const lx = c * cw + 6;
    const lw = cw - 12;
    actx.fillStyle = '#38bdf8';
    actx.globalAlpha = 0.25;
    actx.fillRect(lx, S - 36, lw, 30);
    actx.globalAlpha = 1;
    ectx.fillStyle = '#fde68a';
    ectx.globalAlpha = 0.78;
    ectx.fillRect(lx + 2, S - 34, lw - 4, 24);
    ectx.globalAlpha = 1;
  }

  return [toTex(ac, true, true), toTex(ec, true, true)];
}

export function createPBRTextures(): PBRTextureSet {
  const S = 512;

  // 0. Organic Natural Meadow/Grass/Soil Detail Albedo & Bump
  const [tgc, tg] = makeCanvas(S);
  const [tbc, tb] = makeCanvas(S);
  tg.fillStyle = '#d4dcc8';
  tg.fillRect(0, 0, S, S);
  tb.fillStyle = '#808080';
  tb.fillRect(0, 0, S, S);
  // Soft dappled meadow patches
  for (let i = 0; i < 160; i++) {
    const px = hash2(i, 1.4) * S;
    const py = hash2(i, 2.8) * S;
    const rad = 14 + hash2(i, 5.1) * 34;
    const g = tg.createRadialGradient(px, py, 2, px, py, rad);
    if (i % 3 === 0) {
      g.addColorStop(0, 'rgba(248, 250, 224, 0.14)');
      g.addColorStop(1, 'rgba(248, 250, 224, 0)');
    } else if (i % 3 === 1) {
      g.addColorStop(0, 'rgba(42, 74, 34, 0.14)');
      g.addColorStop(1, 'rgba(42, 74, 34, 0)');
    } else {
      g.addColorStop(0, 'rgba(132, 118, 76, 0.10)');
      g.addColorStop(1, 'rgba(132, 118, 76, 0)');
    }
    tg.fillStyle = g;
    tg.beginPath();
    tg.arc(px, py, rad, 0, Math.PI * 2);
    tg.fill();
  }
  // Fine grass blades & pebble micro-grain
  for (let i = 0; i < 8500; i++) {
    const px = hash2(i, 4.1) * S;
    const py = hash2(i, 7.9) * S;
    const r = 1.2 + hash2(i, 9.2) * 3.8;
    const bright = hash2(i, 3.3) > 0.5;
    tg.fillStyle = bright ? 'rgba(255,255,240,0.065)' : 'rgba(30,55,25,0.08)';
    tg.fillRect(px, py, r, r * 0.7);
    tb.fillStyle = bright ? 'rgba(225,225,225,0.18)' : 'rgba(45,45,45,0.18)';
    tb.fillRect(px, py, r, r);
  }

  // Plaza paving stones & Rooftop concrete
  const [plc, pl] = makeCanvas(256);
  pl.fillStyle = '#cbd5e1';
  pl.fillRect(0, 0, 256, 256);
  pl.strokeStyle = 'rgba(71,85,105,0.28)';
  pl.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    pl.beginPath(); pl.moveTo(i, 0); pl.lineTo(i, 256); pl.stroke();
    pl.beginPath(); pl.moveTo(0, i); pl.lineTo(256, i); pl.stroke();
  }
  for (let i = 0; i < 600; i++) {
    pl.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    pl.fillRect(hash2(i, 1.1) * 256, hash2(i, 2.2) * 256, 3, 3);
  }

  const [rfc, rf] = makeCanvas(256);
  rf.fillStyle = '#64748b';
  rf.fillRect(0, 0, 256, 256);
  rf.strokeStyle = '#94a3b8';
  rf.lineWidth = 10;
  rf.strokeRect(5, 5, 246, 246);
  for (let i = 0; i < 900; i++) {
    rf.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    rf.fillRect(hash2(i, 5.1) * 256, hash2(i, 6.2) * 256, 2, 2);
  }

  // Roads
  const [r1c, r1] = makeCanvas(S);
  fillAsphaltNoise(r1, S, '#2c323e');
  r1.fillStyle = '#aeb7c4';
  r1.fillRect(0, 0, 58, S);
  r1.fillRect(S - 58, 0, 58, S);
  r1.fillStyle = 'rgba(30,41,59,0.18)';
  for (let y = 0; y < S; y += 64) {
    r1.fillRect(0, y, 56, 2);
    r1.fillRect(S - 56, y, 56, 2);
  }
  r1.fillStyle = '#dce3ec';
  r1.fillRect(52, 0, 9, S);
  r1.fillRect(S - 61, 0, 9, S);
  r1.fillStyle = 'rgba(0,0,0,0.32)';
  r1.fillRect(61, 0, 6, S);
  r1.fillRect(S - 67, 0, 6, S);
  r1.fillStyle = '#facc15';
  for (let y = 18; y < S; y += 72) r1.fillRect(S / 2 - 5, y, 10, 40);
  r1.fillStyle = 'rgba(255,255,255,0.68)';
  r1.fillRect(74, 0, 5, S);
  r1.fillRect(S - 79, 0, 5, S);

  const [avc, av] = makeCanvas(S);
  fillAsphaltNoise(av, S, '#262c38');
  av.fillStyle = '#aeb7c4';
  av.fillRect(0, 0, 42, S);
  av.fillRect(S - 42, 0, 42, S);
  av.fillStyle = '#dce3ec';
  av.fillRect(36, 0, 8, S);
  av.fillRect(S - 44, 0, 8, S);
  av.fillStyle = '#dce3ec';
  av.fillRect(S / 2 - 28, 0, 56, S);
  av.fillStyle = '#22c55e';
  av.fillRect(S / 2 - 21, 14, 42, S - 28);
  av.fillStyle = 'rgba(255,255,255,0.82)';
  for (let y = 16; y < S; y += 68) {
    av.fillRect(134, y, 7, 36);
    av.fillRect(S - 141, y, 7, 36);
  }

  const [hwc, hw] = makeCanvas(S);
  fillAsphaltNoise(hw, S, '#1f2532');
  hw.fillStyle = '#cbd5e1';
  hw.fillRect(0, 0, 26, S);
  hw.fillRect(S - 26, 0, 26, S);
  hw.fillStyle = '#f59e0b';
  hw.fillRect(S / 2 - 9, 0, 6, S);
  hw.fillRect(S / 2 + 3, 0, 6, S);
  hw.fillStyle = 'rgba(255,255,255,0.86)';
  for (let y = 18; y < S; y += 64) {
    hw.fillRect(132, y, 7, 36);
    hw.fillRect(S - 139, y, 7, 36);
  }

  const [cc, cr] = makeCanvas(S);
  cr.fillStyle = '#aeb7c4';
  cr.fillRect(0, 0, S, S);
  cr.beginPath(); cr.arc(S, S, S - 58, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#2c323e'; cr.fill();
  cr.beginPath(); cr.arc(S, S, S - 58, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#dce3ec'; cr.lineWidth = 10; cr.stroke();
  cr.beginPath(); cr.arc(S, S, 58, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#aeb7c4'; cr.fill();
  cr.beginPath(); cr.arc(S, S, 58, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#dce3ec'; cr.lineWidth = 9; cr.stroke();
  cr.beginPath(); cr.arc(S, S, S / 2, Math.PI, Math.PI * 1.5);
  cr.strokeStyle = '#facc15'; cr.lineWidth = 10; cr.setLineDash([36, 32]); cr.stroke(); cr.setLineDash([]);

  const [xc, xctx] = makeCanvas(S);
  fillAsphaltNoise(xctx, S, '#2a303c');
  const corners: [number, number][] = [[0, 0], [S, 0], [0, S], [S, S]];
  for (const [cx, cy] of corners) {
    xctx.beginPath(); xctx.arc(cx, cy, 62, 0, Math.PI * 2);
    xctx.fillStyle = '#aeb7c4'; xctx.fill();
    xctx.strokeStyle = '#dce3ec'; xctx.lineWidth = 8; xctx.stroke();
  }
  xctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 88; i <= S - 108; i += 40) {
    xctx.fillRect(i, 20, 20, 46); xctx.fillRect(i, S - 66, 20, 46);
    xctx.fillRect(20, i, 46, 20); xctx.fillRect(S - 66, i, 46, 20);
  }
  xctx.fillStyle = 'rgba(255,255,255,0.55)';
  xctx.fillRect(88, 74, S - 176, 6); xctx.fillRect(88, S - 80, S - 176, 6);
  xctx.fillRect(74, 88, 6, S - 176); xctx.fillRect(S - 80, 88, 6, S - 176);

  const [rbc, rb] = makeCanvas(S);
  fillAsphaltNoise(rb, S, '#282e3b');
  for (const [cx, cy] of corners) { rb.beginPath(); rb.arc(cx, cy, 46, 0, Math.PI * 2); rb.fillStyle = '#aeb7c4'; rb.fill(); }
  rb.beginPath(); rb.arc(S / 2, S / 2, 184, 0, Math.PI * 2);
  rb.strokeStyle = 'rgba(255,255,255,0.82)'; rb.lineWidth = 9; rb.setLineDash([32, 26]); rb.stroke(); rb.setLineDash([]);
  rb.beginPath(); rb.arc(S / 2, S / 2, 118, 0, Math.PI * 2); rb.fillStyle = '#e2e8f0'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 102, 0, Math.PI * 2); rb.fillStyle = '#22c55e'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 48, 0, Math.PI * 2); rb.fillStyle = '#38bdf8'; rb.fill();

  // Bump & Roughness PBR Maps
  const [rbmpC, rbmp] = makeCanvas(256);
  rbmp.fillStyle = '#808080';
  rbmp.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const v = 104 + Math.floor(hash2(i, 8.8) * 48);
    rbmp.fillStyle = `rgb(${v},${v},${v})`;
    rbmp.fillRect(hash2(i, 1.7) * 256, hash2(i, 3.9) * 256, 2, 2);
  }

  const [bbmpC, bbmp] = makeCanvas(512);
  const [brghC, brgh] = makeCanvas(512);
  bbmp.fillStyle = '#a8a8a8'; bbmp.fillRect(0, 0, 512, 512);
  brgh.fillStyle = '#c8c8c8'; brgh.fillRect(0, 0, 512, 512);
  bbmp.fillStyle = '#363636';
  brgh.fillStyle = '#1e1e1e';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 8; c++) {
      const wx = c * (512 / 8) + 6;
      const wy = r * (512 / 10) + 8;
      bbmp.fillRect(wx, wy, 512 / 8 - 12, 512 / 10 - 15);
      brgh.fillRect(wx, wy, 512 / 8 - 12, 512 / 10 - 15);
    }
  }

  // 8 Diverse Architectural Facade + Emissive Night Pairs!
  const [resLow, resLowEmi] = createFacadePair('#efe4d2', '#ccbba2', '#a89a84', '#64748b', '#1e293b', '#fef08a', '#fde68a', 4, 4, 1.1, 'brick');
  const [resHigh, resHighEmi] = createFacadePair('#dde5ef', '#9fb0c4', '#7b8fa6', '#60a5fa', '#1e293b', '#fed7aa', '#fef08a', 6, 9, 2.3, 'modern');
  const [comHigh, comHighEmi] = createFacadePair('#2563eb', '#0f172a', '#94a3b8', '#93c5fd', '#0c1f3d', '#fef08a', '#7dd3fc', 8, 10, 3.7, 'glass');
  const [office, officeEmi] = createFacadePair('#0284c7', '#082f49', '#cbd5e1', '#7dd3fc', '#0b253a', '#e0f2fe', '#a5f3fc', 8, 10, 5.1, 'glass');
  // NEW 4 Architectural Materials:
  const [goldGlass, goldGlassEmi] = createFacadePair('#b48a4e', '#2e2416', '#d6c198', '#fde68a', '#291d0e', '#fef08a', '#fed7aa', 8, 10, 6.4, 'glass');
  const [modernWhite, modernWhiteEmi] = createFacadePair('#f8fafc', '#cbd5e1', '#e2e8f0', '#38bdf8', '#0f172a', '#fef3c7', '#e0f2fe', 6, 9, 7.8, 'modern');
  const [terracottaBrick, terracottaBrickEmi] = createFacadePair('#b55942', '#7c3626', '#d6c7b2', '#475569', '#1e293b', '#fde047', '#fed7aa', 5, 7, 8.9, 'brick');
  const [artDecoStone, artDecoStoneEmi] = createFacadePair('#e5dfd3', '#a69d8d', '#f1ece1', '#475569', '#172033', '#fef08a', '#fde68a', 6, 9, 9.7, 'deco');

  const [indC, ind] = makeCanvas(S);
  ind.fillStyle = '#8b8378'; ind.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 24) {
    ind.fillStyle = x % 48 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.07)';
    ind.fillRect(x, 0, 12, S);
  }
  ind.fillStyle = '#3f3b37'; ind.fillRect(0, S - 92, S, 92);
  ind.fillStyle = '#f59e0b'; ind.fillRect(0, S - 100, S, 8);
  ind.fillStyle = '#475569';
  for (let c = 0; c < 6; c++) ind.fillRect(c * 84 + 12, 42, 62, 54);

  const [civC, civ] = makeCanvas(S);
  civ.fillStyle = '#eceff4'; civ.fillRect(0, 0, S, S);
  civ.fillStyle = '#cbd5e1'; civ.fillRect(0, 0, S, 36); civ.fillRect(0, S - 46, S, 46);
  for (let c = 0; c < 6; c++) {
    civ.fillStyle = '#d8dee9'; civ.fillRect(c * (S / 6) + 8, 36, 18, S - 82);
    civ.fillStyle = '#1e3a8a'; civ.fillRect(c * (S / 6) + 32, 62, 38, S - 134);
  }

  const [solC, sol] = makeCanvas(S);
  sol.fillStyle = '#0f172a'; sol.fillRect(0, 0, S, S);
  sol.fillStyle = '#1d4ed8';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) sol.fillRect(c * 64 + 4, r * 64 + 4, 56, 56);
  sol.strokeStyle = '#93c5fd'; sol.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    sol.beginPath(); sol.moveTo(i * 64, 0); sol.lineTo(i * 64, S); sol.stroke();
    sol.beginPath(); sol.moveTo(0, i * 64); sol.lineTo(S, i * 64); sol.stroke();
  }

  return {
    terrainGrass: toTex(tgc, true, true, 12),
    terrainBump: toTex(tbc, false, true, 12),
    plazaTile: toTex(plc, true, true),
    roofConcrete: toTex(rfc, true, false),
    roadStraight: toTex(r1c),
    avenueStraight: toTex(avc),
    highwayStraight: toTex(hwc),
    roadCorner: toTex(cc),
    roadCross: toTex(xc),
    roundabout: toTex(rbc),
    roadBump: toTex(rbmpC, false, true),
    resLow, resLowEmi,
    resHigh, resHighEmi,
    comHigh, comHighEmi,
    office, officeEmi,
    goldGlass, goldGlassEmi,
    modernWhite, modernWhiteEmi,
    terracottaBrick, terracottaBrickEmi,
    artDecoStone, artDecoStoneEmi,
    industrial: toTex(indC),
    civic: toTex(civC),
    solar: toTex(solC),
    buildingBump: toTex(bbmpC, false, true),
    buildingRough: toTex(brghC, false, true),
  };
}
