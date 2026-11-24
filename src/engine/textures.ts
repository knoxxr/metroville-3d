import * as THREE from 'three';

export interface PBRTextureSet {
  terrainGrass: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  foliageAlbedo: THREE.CanvasTexture;
  foliageBump: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  rockBump: THREE.CanvasTexture;
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

function fillWeatheredAsphalt(ctx: CanvasRenderingContext2D, size: number, base = '#2b2f36') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Realistic mineral aggregate grain & subtle oil/tire wear
  for (let i = 0; i < 6500; i++) {
    const px = hash2(i, 1.3) * size;
    const py = hash2(i, 2.7) * size;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.036)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(px, py, 2, 2);
  }
  // Subtle dark wheel track polishing along lanes
  const g1 = ctx.createLinearGradient(size * 0.2, 0, size * 0.45, 0);
  g1.addColorStop(0, 'rgba(0,0,0,0)');
  g1.addColorStop(0.5, 'rgba(0,0,0,0.14)');
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(size * 0.2, 0, size * 0.25, size);

  const g2 = ctx.createLinearGradient(size * 0.55, 0, size * 0.8, 0);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(0.5, 'rgba(0,0,0,0.14)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(size * 0.55, 0, size * 0.25, size);

  // Subtle asphalt expansion tar seam
  ctx.fillStyle = 'rgba(15,18,22,0.22)';
  ctx.fillRect(0, size * 0.49, size, 2);
}

/**
 * Photorealistic Architectural PBR Facade Generator:
 * - Naturalistic desaturated building materials (slate glass, champagne bronze, weathered limestone, brick)
 * - Interior room parallax illusion (recessed ceiling depth, venetian blinds, office interior hints)
 * - Subtle base dirt & cornice weathering gradients!
 */
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

  // Masonry / concrete weathering grain
  for (let i = 0; i < 2400; i++) {
    const px = hash2(i, seed + 1.1) * S;
    const py = hash2(i, seed + 2.3) * S;
    actx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.065)';
    actx.fillRect(px, py, style === 'brick' ? 14 : 8, style === 'brick' ? 4 : 3);
  }

  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, S, S);

  const cw = S / cols;
  const rh = S / rows;
  const glassy = style === 'glass';

  // Architectural spandrel beams & balcony overhangs with soft cast underside shadow
  for (let r = 0; r < rows; r++) {
    actx.fillStyle = frameCol;
    const bandH = style === 'modern' ? 14 : glassy ? 6 : 8;
    actx.fillRect(0, r * rh, S, bandH);
    const sh = actx.createLinearGradient(0, r * rh + bandH, 0, r * rh + bandH + (style === 'modern' ? 12 : 6));
    sh.addColorStop(0, 'rgba(0,0,0,0.34)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = sh;
    actx.fillRect(0, r * rh + bandH, S, style === 'modern' ? 12 : 6);
  }
  for (let c = 0; c < cols; c++) {
    actx.fillStyle = frameCol;
    const pilW = style === 'deco' ? 12 : glassy ? 3 : 6;
    actx.fillRect(c * cw, 0, pilW, S);
  }

  for (let r = 0; r < rows; r++) {
    const floorLitBias = hash2(r + 1, seed * 3.1);
    for (let c = 0; c < cols; c++) {
      const h = hash2(c * 3.7 + seed, r * 5.3 + seed * 1.9);
      const padX = style === 'deco' ? 14 : glassy ? 4.5 : style === 'modern' ? 6 : 10;
      const padY = style === 'modern' ? 16 : glassy ? 8 : 11;
      const wx = c * cw + padX;
      const wy = r * rh + padY;
      const ww = cw - padX * 2;
      const wh = Math.max(8, rh - padY * 1.5);

      // Realistic sky-reflecting tinted architectural glass + dark room interior depth
      const wg = actx.createLinearGradient(wx, wy, wx + ww * 0.35, wy + wh);
      wg.addColorStop(0, glassTop);
      wg.addColorStop(0.42, glassy ? '#60788f' : '#2f3d4d');
      wg.addColorStop(1, glassBot);
      actx.fillStyle = wg;
      actx.fillRect(wx, wy, ww, wh);

      // Subtle interior room blinds / ceiling slab illusion (photorealistic depth!)
      if (h > 0.35 && h < 0.72) {
        const blindH = wh * (0.25 + (h - 0.35) * 0.9);
        actx.fillStyle = 'rgba(218, 224, 230, 0.22)';
        actx.fillRect(wx + 1, wy + 1, ww - 2, blindH);
      }
      // Subtle interior warm room bounce visible even in daylight
      if (h > 0.76) {
        actx.fillStyle = 'rgba(245, 225, 190, 0.14)';
        actx.fillRect(wx + 2, wy + wh * 0.45, ww - 4, wh * 0.5);
      }

      // Crisp diagonal sky glint on reflective curtain walls
      if (glassy && (r + c) % 4 === 0) {
        actx.fillStyle = 'rgba(235, 246, 255, 0.12)';
        actx.beginPath();
        actx.moveTo(wx, wy);
        actx.lineTo(wx + ww * 0.55, wy);
        actx.lineTo(wx, wy + wh * 0.68);
        actx.closePath();
        actx.fill();
      }

      if (style === 'brick' || style === 'deco') {
        actx.fillStyle = 'rgba(240,238,232,0.68)';
        actx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
        actx.fillRect(wx - 2, wy + wh, ww + 4, 3.5);
      } else if (style === 'modern') {
        actx.fillStyle = 'rgba(210, 228, 242, 0.28)';
        actx.fillRect(wx - 2, wy + wh * 0.54, ww + 4, wh * 0.46);
      }

      // Realistic clustered night illumination (soft natural warm incandescent & cool fluorescent office floors)
      const litScore = h * 0.68 + floorLitBias * 0.32;
      if (litScore > 0.46) {
        const intensity = Math.min(1, 0.38 + (litScore - 0.46) * 1.15);
        ectx.globalAlpha = intensity;
        const winGrad = ectx.createLinearGradient(wx, wy, wx, wy + wh);
        winGrad.addColorStop(0, h > 0.55 ? emiWarm : emiCool);
        winGrad.addColorStop(1, '#d97706');
        ectx.fillStyle = winGrad;
        ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        // Subtle ceiling fluorescent bar
        ectx.fillStyle = '#fffbeb';
        ectx.globalAlpha = intensity * 0.42;
        ectx.fillRect(wx + 4, wy + 3, ww - 8, Math.max(2, wh * 0.16));
        ectx.globalAlpha = 1;
      }
    }
  }

  // Subtle architectural base grime & roofline cornice weathering
  const topWeath = actx.createLinearGradient(0, 0, 0, 34);
  topWeath.addColorStop(0, 'rgba(15,23,42,0.28)');
  topWeath.addColorStop(1, 'rgba(15,23,42,0)');
  actx.fillStyle = topWeath;
  actx.fillRect(0, 0, S, 34);

  // Ground-floor stone colonnade & warm storefront lobby
  actx.fillStyle = '#1d242e';
  actx.fillRect(0, S - 42, S, 42);
  actx.fillStyle = frameCol;
  actx.fillRect(0, S - 46, S, 5);
  for (let c = 0; c < cols; c++) {
    const lx = c * cw + 6;
    const lw = cw - 12;
    actx.fillStyle = '#7ea2bf';
    actx.globalAlpha = 0.22;
    actx.fillRect(lx, S - 36, lw, 30);
    actx.globalAlpha = 1;
    ectx.fillStyle = '#fde68a';
    ectx.globalAlpha = 0.72;
    ectx.fillRect(lx + 2, S - 34, lw - 4, 24);
    ectx.globalAlpha = 1;
  }

  return [toTex(ac, true, true), toTex(ec, true, true)];
}

export function createPBRTextures(): PBRTextureSet {
  const S = 512;

  // 0. Photorealistic Natural Meadow / Soil / Grass Fiber Albedo & High-Detail Bump
  const [tgc, tg] = makeCanvas(S);
  const [tbc, tb] = makeCanvas(S);
  tg.fillStyle = '#c8ceb9';
  tg.fillRect(0, 0, S, S);
  tb.fillStyle = '#808080';
  tb.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const px = hash2(i, 1.4) * S;
    const py = hash2(i, 2.8) * S;
    const rad = 12 + hash2(i, 5.1) * 38;
    const g = tg.createRadialGradient(px, py, 2, px, py, rad);
    if (i % 3 === 0) {
      g.addColorStop(0, 'rgba(220, 224, 195, 0.16)');
      g.addColorStop(1, 'rgba(220, 224, 195, 0)');
    } else if (i % 3 === 1) {
      g.addColorStop(0, 'rgba(54, 72, 42, 0.16)');
      g.addColorStop(1, 'rgba(54, 72, 42, 0)');
    } else {
      g.addColorStop(0, 'rgba(122, 108, 76, 0.14)');
      g.addColorStop(1, 'rgba(122, 108, 76, 0)');
    }
    tg.fillStyle = g;
    tg.beginPath();
    tg.arc(px, py, rad, 0, Math.PI * 2);
    tg.fill();
  }
  for (let i = 0; i < 12000; i++) {
    const px = hash2(i, 4.1) * S;
    const py = hash2(i, 7.9) * S;
    const r = 1.0 + hash2(i, 9.2) * 3.2;
    const bright = hash2(i, 3.3) > 0.5;
    tg.fillStyle = bright ? 'rgba(245,244,225,0.075)' : 'rgba(32,46,24,0.095)';
    tg.fillRect(px, py, r, r * 0.65);
    tb.fillStyle = bright ? 'rgba(235,235,235,0.22)' : 'rgba(35,35,35,0.22)';
    tb.fillRect(px, py, r, r);
  }

  // Leafy Foliage PBR Albedo & Micro-Leaf Bump (gives trees crisp botanical leaf texture!)
  const [flc, fl] = makeCanvas(256);
  const [flbc, flb] = makeCanvas(256);
  fl.fillStyle = '#c8d0be';
  fl.fillRect(0, 0, 256, 256);
  flb.fillStyle = '#707070';
  flb.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const px = hash2(i, 2.1) * 256;
    const py = hash2(i, 6.7) * 256;
    const r = 2 + hash2(i, 4.9) * 5;
    const hi = hash2(i, 8.2);
    fl.fillStyle = hi > 0.6 ? 'rgba(240,248,220,0.24)' : hi > 0.25 ? 'rgba(55,80,45,0.22)' : 'rgba(20,35,18,0.28)';
    fl.beginPath();
    fl.ellipse(px, py, r, r * 0.6, hi * Math.PI, 0, Math.PI * 2);
    fl.fill();
    flb.fillStyle = hi > 0.5 ? 'rgba(230,230,230,0.3)' : 'rgba(30,30,30,0.32)';
    flb.beginPath();
    flb.arc(px, py, r * 0.7, 0, Math.PI * 2);
    flb.fill();
  }

  // Craggy Granite Rock PBR Albedo & Bump
  const [rkc, rk] = makeCanvas(256);
  const [rkbc, rkb] = makeCanvas(256);
  rk.fillStyle = '#a8a59e';
  rk.fillRect(0, 0, 256, 256);
  rkb.fillStyle = '#808080';
  rkb.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const px = hash2(i, 3.1) * 256;
    const py = hash2(i, 9.3) * 256;
    const s = 2 + hash2(i, 5.4) * 10;
    const v = hash2(i, 1.9);
    rk.fillStyle = v > 0.6 ? 'rgba(235,232,226,0.16)' : v > 0.25 ? 'rgba(65,64,60,0.18)' : 'rgba(80,96,64,0.12)'; // moss specks!
    rk.fillRect(px, py, s, s * 0.7);
    rkb.fillStyle = v > 0.5 ? 'rgba(240,240,240,0.26)' : 'rgba(30,30,30,0.28)';
    rkb.fillRect(px, py, s, s * 0.7);
  }

  // Weathered Concrete Plaza & Gravel Rooftop
  const [plc, pl] = makeCanvas(256);
  pl.fillStyle = '#b9bfc6';
  pl.fillRect(0, 0, 256, 256);
  pl.strokeStyle = 'rgba(51,65,85,0.24)';
  pl.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    pl.beginPath(); pl.moveTo(i, 0); pl.lineTo(i, 256); pl.stroke();
    pl.beginPath(); pl.moveTo(0, i); pl.lineTo(256, i); pl.stroke();
  }
  for (let i = 0; i < 900; i++) {
    pl.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    pl.fillRect(hash2(i, 1.1) * 256, hash2(i, 2.2) * 256, 3, 3);
  }

  const [rfc, rf] = makeCanvas(256);
  rf.fillStyle = '#5e6570';
  rf.fillRect(0, 0, 256, 256);
  rf.strokeStyle = '#8e96a1';
  rf.lineWidth = 10;
  rf.strokeRect(5, 5, 246, 246);
  for (let i = 0; i < 1200; i++) {
    rf.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
    rf.fillRect(hash2(i, 5.1) * 256, hash2(i, 6.2) * 256, 2, 2);
  }

  // Weathered Photorealistic Roads
  const [r1c, r1] = makeCanvas(S);
  fillWeatheredAsphalt(r1, S, '#2b2f36');
  r1.fillStyle = '#a3aab3';
  r1.fillRect(0, 0, 58, S); r1.fillRect(S - 58, 0, 58, S);
  r1.fillStyle = 'rgba(30,41,59,0.2)';
  for (let y = 0; y < S; y += 64) { r1.fillRect(0, y, 56, 2); r1.fillRect(S - 56, y, 56, 2); }
  r1.fillStyle = '#ccd2da';
  r1.fillRect(52, 0, 8, S); r1.fillRect(S - 60, 0, 8, S);
  r1.fillStyle = 'rgba(0,0,0,0.36)';
  r1.fillRect(60, 0, 6, S); r1.fillRect(S - 66, 0, 6, S);
  r1.fillStyle = '#e5bd4a';
  for (let y = 18; y < S; y += 72) r1.fillRect(S / 2 - 4, y, 8, 38);
  r1.fillStyle = 'rgba(230,235,240,0.58)';
  r1.fillRect(74, 0, 4, S); r1.fillRect(S - 78, 0, 4, S);

  const [avc, av] = makeCanvas(S);
  fillWeatheredAsphalt(av, S, '#252930');
  av.fillStyle = '#a3aab3';
  av.fillRect(0, 0, 42, S); av.fillRect(S - 42, 0, 42, S);
  av.fillStyle = '#ccd2da';
  av.fillRect(36, 0, 7, S); av.fillRect(S - 43, 0, 7, S);
  av.fillStyle = '#c4cbd4';
  av.fillRect(S / 2 - 26, 0, 52, S);
  av.fillStyle = '#4e6f3d';
  av.fillRect(S / 2 - 20, 14, 40, S - 28);
  av.fillStyle = 'rgba(232,236,242,0.7)';
  for (let y = 16; y < S; y += 68) { av.fillRect(134, y, 6, 34); av.fillRect(S - 140, y, 6, 34); }

  const [hwc, hw] = makeCanvas(S);
  fillWeatheredAsphalt(hw, S, '#21252b');
  hw.fillStyle = '#b8c0ca';
  hw.fillRect(0, 0, 26, S); hw.fillRect(S - 26, 0, 26, S);
  hw.fillStyle = '#dca238';
  hw.fillRect(S / 2 - 8, 0, 5, S); hw.fillRect(S / 2 + 3, 0, 5, S);
  hw.fillStyle = 'rgba(235,240,245,0.75)';
  for (let y = 18; y < S; y += 64) { hw.fillRect(132, y, 6, 34); hw.fillRect(S - 138, y, 6, 34); }

  const [cc, cr] = makeCanvas(S);
  cr.fillStyle = '#a3aab3'; cr.fillRect(0, 0, S, S);
  cr.beginPath(); cr.arc(S, S, S - 58, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#2b2f36'; cr.fill();
  cr.beginPath(); cr.arc(S, S, S - 58, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#ccd2da'; cr.lineWidth = 9; cr.stroke();
  cr.beginPath(); cr.arc(S, S, 58, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#a3aab3'; cr.fill();
  cr.beginPath(); cr.arc(S, S, 58, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#ccd2da'; cr.lineWidth = 8; cr.stroke();
  cr.beginPath(); cr.arc(S, S, S / 2, Math.PI, Math.PI * 1.5);
  cr.strokeStyle = '#e5bd4a'; cr.lineWidth = 8; cr.setLineDash([36, 32]); cr.stroke(); cr.setLineDash([]);

  const [xc, xctx] = makeCanvas(S);
  fillWeatheredAsphalt(xctx, S, '#282c33');
  const corners: [number, number][] = [[0, 0], [S, 0], [0, S], [S, S]];
  for (const [cx, cy] of corners) {
    xctx.beginPath(); xctx.arc(cx, cy, 62, 0, Math.PI * 2);
    xctx.fillStyle = '#a3aab3'; xctx.fill();
    xctx.strokeStyle = '#ccd2da'; xctx.lineWidth = 7; xctx.stroke();
  }
  xctx.fillStyle = 'rgba(232,236,240,0.74)';
  for (let i = 88; i <= S - 108; i += 40) {
    xctx.fillRect(i, 20, 19, 44); xctx.fillRect(i, S - 64, 19, 44);
    xctx.fillRect(20, i, 44, 19); xctx.fillRect(S - 64, i, 44, 19);
  }

  const [rbc, rb] = makeCanvas(S);
  fillWeatheredAsphalt(rb, S, '#262a31');
  for (const [cx, cy] of corners) { rb.beginPath(); rb.arc(cx, cy, 46, 0, Math.PI * 2); rb.fillStyle = '#a3aab3'; rb.fill(); }
  rb.beginPath(); rb.arc(S / 2, S / 2, 184, 0, Math.PI * 2);
  rb.strokeStyle = 'rgba(232,236,242,0.7)'; rb.lineWidth = 8; rb.setLineDash([30, 26]); rb.stroke(); rb.setLineDash([]);
  rb.beginPath(); rb.arc(S / 2, S / 2, 118, 0, Math.PI * 2); rb.fillStyle = '#ccd2da'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 102, 0, Math.PI * 2); rb.fillStyle = '#4e6f3d'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 48, 0, Math.PI * 2); rb.fillStyle = '#2d6c88'; rb.fill();

  const [rbmpC, rbmp] = makeCanvas(256);
  rbmp.fillStyle = '#808080'; rbmp.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 96 + Math.floor(hash2(i, 8.8) * 64);
    rbmp.fillStyle = `rgb(${v},${v},${v})`;
    rbmp.fillRect(hash2(i, 1.7) * 256, hash2(i, 3.9) * 256, 2, 2);
  }

  const [bbmpC, bbmp] = makeCanvas(512);
  const [brghC, brgh] = makeCanvas(512);
  bbmp.fillStyle = '#b0b0b0'; bbmp.fillRect(0, 0, 512, 512);
  brgh.fillStyle = '#d0d0d0'; brgh.fillRect(0, 0, 512, 512);
  bbmp.fillStyle = '#2e2e2e';
  brgh.fillStyle = '#181818';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 8; c++) {
      const wx = c * (512 / 8) + 6;
      const wy = r * (512 / 10) + 8;
      bbmp.fillRect(wx, wy, 512 / 8 - 12, 512 / 10 - 15);
      brgh.fillRect(wx, wy, 512 / 8 - 12, 512 / 10 - 15);
    }
  }

  // 8 Photorealistic Desaturated Architectural PBR Facades + Warm/Cool Night Emissives!
  const [resLow, resLowEmi] = createFacadePair('#e2d9c9', '#bfb39e', '#9c8f7b', '#4d5b69', '#1e2730', '#fef08a', '#fde68a', 4, 4, 1.1, 'brick');
  const [resHigh, resHighEmi] = createFacadePair('#cfd5dc', '#9aa4b0', '#7e8894', '#4e6378', '#1b2530', '#fed7aa', '#fef08a', 6, 9, 2.3, 'modern');
  const [comHigh, comHighEmi] = createFacadePair('#41566c', '#1c2733', '#8c96a3', '#7d99b3', '#162330', '#fef08a', '#bae6fd', 8, 10, 3.7, 'glass');
  const [office, officeEmi] = createFacadePair('#365263', '#162530', '#a4b0bc', '#7ca1b8', '#142430', '#e0f2fe', '#bae6fd', 8, 10, 5.1, 'glass');
  const [goldGlass, goldGlassEmi] = createFacadePair('#8d7453', '#362b1e', '#b5a387', '#c7b08b', '#261e14', '#fef08a', '#fed7aa', 8, 10, 6.4, 'glass');
  const [modernWhite, modernWhiteEmi] = createFacadePair('#e6e8eb', '#bfc5cc', '#d4d9df', '#4e677a', '#16222c', '#fef3c7', '#e0f2fe', 6, 9, 7.8, 'modern');
  const [terracottaBrick, terracottaBrickEmi] = createFacadePair('#9c5644', '#6d392c', '#c2b6a3', '#44505c', '#1a222b', '#fde047', '#fed7aa', 5, 7, 8.9, 'brick');
  const [artDecoStone, artDecoStoneEmi] = createFacadePair('#d5cfc3', '#9d9586', '#e3ddd1', '#45515e', '#182029', '#fef08a', '#fde68a', 6, 9, 9.7, 'deco');

  const [indC, ind] = makeCanvas(S);
  ind.fillStyle = '#7c7770'; ind.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 24) {
    ind.fillStyle = x % 48 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.06)';
    ind.fillRect(x, 0, 12, S);
  }
  ind.fillStyle = '#3a3835'; ind.fillRect(0, S - 92, S, 92);
  ind.fillStyle = '#c48f2e'; ind.fillRect(0, S - 98, S, 6);
  ind.fillStyle = '#3e4752';
  for (let c = 0; c < 6; c++) ind.fillRect(c * 84 + 12, 42, 62, 54);

  const [civC, civ] = makeCanvas(S);
  civ.fillStyle = '#dcdad4'; civ.fillRect(0, 0, S, S);
  civ.fillStyle = '#bdb9b0'; civ.fillRect(0, 0, S, 36); civ.fillRect(0, S - 46, S, 46);
  for (let c = 0; c < 6; c++) {
    civ.fillStyle = '#c8c4bc'; civ.fillRect(c * (S / 6) + 8, 36, 18, S - 82);
    civ.fillStyle = '#2d3f54'; civ.fillRect(c * (S / 6) + 32, 62, 38, S - 134);
  }

  const [solC, sol] = makeCanvas(S);
  sol.fillStyle = '#121a28'; sol.fillRect(0, 0, S, S);
  sol.fillStyle = '#1e3a66';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) sol.fillRect(c * 64 + 4, r * 64 + 4, 56, 56);
  sol.strokeStyle = '#6c8ab5'; sol.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    sol.beginPath(); sol.moveTo(i * 64, 0); sol.lineTo(i * 64, S); sol.stroke();
    sol.beginPath(); sol.moveTo(0, i * 64); sol.lineTo(S, i * 64); sol.stroke();
  }

  return {
    terrainGrass: toTex(tgc, true, true, 14),
    terrainBump: toTex(tbc, false, true, 14),
    foliageAlbedo: toTex(flc, true, true),
    foliageBump: toTex(flbc, false, true),
    rockAlbedo: toTex(rkc, true, true),
    rockBump: toTex(rkbc, false, true),
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
