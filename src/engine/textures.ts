import * as THREE from 'three';

export interface PBRTextureSet {
  terrainGrass: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  terrainNormal: THREE.CanvasTexture;
  foliageAlbedo: THREE.CanvasTexture;
  foliageBump: THREE.CanvasTexture;
  foliageCardRGBA: THREE.CanvasTexture;
  pineFrondRGBA: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  rockBump: THREE.CanvasTexture;
  rockNormal: THREE.CanvasTexture;
  plazaTile: THREE.CanvasTexture;
  roofConcrete: THREE.CanvasTexture;
  roadStraight: THREE.CanvasTexture;
  avenueStraight: THREE.CanvasTexture;
  highwayStraight: THREE.CanvasTexture;
  roadCorner: THREE.CanvasTexture;
  roadCross: THREE.CanvasTexture;
  roundabout: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  roadNormal: THREE.CanvasTexture;
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
  buildingNormal: THREE.CanvasTexture;
  buildingRough: THREE.CanvasTexture;
  buildingMetal: THREE.CanvasTexture;
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

/**
 * Converts a grayscale height canvas into a true Tangent-Space RGB Normal Map
 * using a seamless wrapping Sobel kernel so PBR lights catch crisp 3D relief!
 */
function heightToNormalTexture(
  src: HTMLCanvasElement,
  strength = 2.2,
  repeat = true,
  repeatScale = 1
): THREE.CanvasTexture {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d')!;
  const srcData = sctx.getImageData(0, 0, w, h).data;
  const [nc, nctx] = makeCanvas(w);
  nc.height = h;
  const out = nctx.createImageData(w, h);
  const dst = out.data;

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return srcData[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const nx = -dX;
      const ny = dY;
      const nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);

      const o = (y * w + x) * 4;
      dst[o] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      dst[o + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      dst[o + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      dst[o + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);
  return toTex(nc, false, repeat, repeatScale);
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

  // Alpha-Tested Botanical Broadleaf Leaf-Cluster Card (real transparent foliage gaps!)
  const [fcardC, fc] = makeCanvas(256);
  fc.clearRect(0, 0, 256, 256);
  // Subtle interior woody twigs
  fc.strokeStyle = 'rgba(72, 56, 40, 0.85)';
  fc.lineWidth = 3;
  for (let b = 0; b < 6; b++) {
    const ang = (b / 6) * Math.PI * 2 + 0.3;
    fc.beginPath();
    fc.moveTo(128, 128);
    fc.lineTo(128 + Math.cos(ang) * 76, 128 + Math.sin(ang) * 76);
    fc.stroke();
  }
  // 240 layered botanical leaves clustered organically in an airy oval silhouette
  for (let i = 0; i < 240; i++) {
    const a = hash2(i, 1.7) * Math.PI * 2;
    const rad = Math.pow(hash2(i, 3.9), 0.58) * 106;
    const px = 128 + Math.cos(a) * rad;
    const py = 128 + Math.sin(a) * rad;
    const lr = 8 + hash2(i, 5.2) * 11;
    const rot = a + (hash2(i, 7.1) - 0.5) * 1.4;
    const shade = 0.72 + (rad / 110) * 0.30 + hash2(i, 8.8) * 0.20;
    const r = Math.min(255, Math.round(196 * shade));
    const g = Math.min(255, Math.round(224 * shade));
    const b = Math.min(255, Math.round(166 * shade));
    fc.fillStyle = `rgb(${r},${g},${b})`;
    fc.beginPath();
    fc.ellipse(px, py, lr, lr * 0.58, rot, 0, Math.PI * 2);
    fc.fill();
    // Delicate central leaf vein highlight
    fc.strokeStyle = `rgba(250,255,230,0.26)`;
    fc.lineWidth = 1;
    fc.beginPath();
    fc.moveTo(px - Math.cos(rot) * lr * 0.7, py - Math.sin(rot) * lr * 0.7);
    fc.lineTo(px + Math.cos(rot) * lr * 0.7, py + Math.sin(rot) * lr * 0.7);
    fc.stroke();
  }

  // Alpha-Tested Feathered Conifer / Spruce Pine Branch Spire (real needle silhouettes!)
  const [pcardC, pc] = makeCanvas(256);
  pc.clearRect(0, 0, 256, 256);
  // Central dark timber stem
  pc.strokeStyle = '#4f3d2f';
  pc.lineWidth = 6;
  pc.beginPath();
  pc.moveTo(128, 252);
  pc.lineTo(128, 18);
  pc.stroke();
  // Tiered drooping pine boughs filled with fine feathered needle sprays
  for (let row = 0; row < 28; row++) {
    const t = row / 27; // 0 at bottom -> 1 at top spire tip
    const cy = 242 - t * 224;
    const maxSpan = (1.0 - t * 0.88) * 112 + 10;
    const branches = 5 + Math.floor((1 - t) * 5);
    for (let k = 0; k < branches; k++) {
      const frac = (k / Math.max(1, branches - 1)) * 2 - 1; // -1 .. +1
      const jitter = (hash2(row * 13 + k, 4.1) - 0.5) * 14;
      const bx = 128 + frac * maxSpan + jitter;
      const by = cy + Math.abs(frac) * (1 - t) * 26 + (hash2(row, k + 2.3) - 0.5) * 8;
      // Needle spray cluster along bough
      const shade = 0.68 + t * 0.28 + Math.abs(frac) * 0.22 + hash2(row + k, 9.1) * 0.16;
      const r = Math.min(255, Math.round(166 * shade));
      const g = Math.min(255, Math.round(206 * shade));
      const b = Math.min(255, Math.round(160 * shade));
      pc.strokeStyle = `rgb(${r},${g},${b})`;
      pc.lineWidth = 2.4;
      for (let n = 0; n < 7; n++) {
        const na = Math.atan2(by - cy, bx - 128) + (hash2(row * 31 + n, k * 7) - 0.5) * 1.1;
        const nLen = 10 + hash2(n, row + 1.5) * 14 * (1 - t * 0.45);
        pc.beginPath();
        pc.moveTo(bx, by);
        pc.lineTo(bx + Math.cos(na) * nLen, by + Math.sin(na) * nLen);
        pc.stroke();
      }
      pc.fillStyle = `rgb(${r},${g},${b})`;
      pc.beginPath();
      pc.ellipse(bx, by, 10 * (1 - t * 0.35), 5.5, frac * 0.5, 0, Math.PI * 2);
      pc.fill();
    }
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

  // Cities: Skylines Signature Sunlit Concrete Sidewalks & Weathered Medium-Grey Asphalt Roads!
  const [r1c, r1] = makeCanvas(S);
  fillWeatheredAsphalt(r1, S, '#3a414b');
  r1.fillStyle = '#c4cbd4';
  r1.fillRect(0, 0, 62, S); r1.fillRect(S - 62, 0, 62, S);
  r1.fillStyle = 'rgba(51,65,85,0.22)';
  for (let y = 0; y < S; y += 64) { r1.fillRect(0, y, 60, 2); r1.fillRect(S - 60, y, 60, 2); }
  r1.fillStyle = '#dfe5ec';
  r1.fillRect(56, 0, 8, S); r1.fillRect(S - 64, 0, 8, S);
  r1.fillStyle = 'rgba(0,0,0,0.28)';
  r1.fillRect(64, 0, 6, S); r1.fillRect(S - 70, 0, 6, S);
  // Crisp 2-lane street: subtle double-yellow center divider & clean white edge lines
  r1.fillStyle = '#e5be4c';
  r1.fillRect(S / 2 - 6, 0, 4, S); r1.fillRect(S / 2 + 2, 0, 4, S);
  r1.fillStyle = 'rgba(240,245,250,0.62)';
  r1.fillRect(78, 0, 4, S); r1.fillRect(S - 82, 0, 4, S);

  const [avc, av] = makeCanvas(S);
  fillWeatheredAsphalt(av, S, '#343b44');
  av.fillStyle = '#c4cbd4';
  av.fillRect(0, 0, 46, S); av.fillRect(S - 46, 0, 46, S);
  av.fillStyle = '#dfe5ec';
  av.fillRect(40, 0, 7, S); av.fillRect(S - 47, 0, 7, S);
  av.fillStyle = '#cfd6de';
  av.fillRect(S / 2 - 26, 0, 52, S);
  av.fillStyle = '#678c49';
  av.fillRect(S / 2 - 20, 14, 40, S - 28);
  av.fillStyle = 'rgba(240,245,250,0.78)';
  for (let y = 20; y < S; y += 84) { av.fillRect(136, y, 5, 34); av.fillRect(S - 141, y, 5, 34); }
  av.fillStyle = 'rgba(240,245,250,0.52)';
  av.fillRect(58, 0, 4, S); av.fillRect(S - 62, 0, 4, S);

  const [hwc, hw] = makeCanvas(S);
  fillWeatheredAsphalt(hw, S, '#2f353e');
  hw.fillStyle = '#ccd4de';
  hw.fillRect(0, 0, 28, S); hw.fillRect(S - 28, 0, 28, S);
  hw.fillStyle = '#e5ae3c';
  hw.fillRect(S / 2 - 7, 0, 4, S); hw.fillRect(S / 2 + 3, 0, 4, S);
  hw.fillStyle = 'rgba(242,247,252,0.80)';
  for (let y = 20; y < S; y += 80) { hw.fillRect(132, y, 5, 32); hw.fillRect(S - 137, y, 5, 32); }

  // Smooth 90-degree curve with matched sidewalks, white edge lines & double-yellow centerline
  const [cc, cr] = makeCanvas(S);
  cr.fillStyle = '#c4cbd4'; cr.fillRect(0, 0, S, S);
  cr.beginPath(); cr.arc(S, S, S - 64, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#3a414b'; cr.fill();
  cr.beginPath(); cr.arc(S, S, S - 64, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#dfe5ec'; cr.lineWidth = 8; cr.stroke();
  cr.beginPath(); cr.arc(S, S, 64, Math.PI, Math.PI * 1.5); cr.lineTo(S, S); cr.closePath();
  cr.fillStyle = '#c4cbd4'; cr.fill();
  cr.beginPath(); cr.arc(S, S, 64, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#dfe5ec'; cr.lineWidth = 8; cr.stroke();
  // Clean white outer/inner shoulder lines
  cr.beginPath(); cr.arc(S, S, S - 80, Math.PI, Math.PI * 1.5); cr.strokeStyle = 'rgba(240,245,250,0.62)'; cr.lineWidth = 4; cr.stroke();
  cr.beginPath(); cr.arc(S, S, 80, Math.PI, Math.PI * 1.5); cr.strokeStyle = 'rgba(240,245,250,0.62)'; cr.lineWidth = 4; cr.stroke();
  // Clean curved double-yellow center divider aligned exactly with roadStraight
  cr.beginPath(); cr.arc(S, S, S / 2 - 4, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#e5be4c'; cr.lineWidth = 4; cr.stroke();
  cr.beginPath(); cr.arc(S, S, S / 2 + 4, Math.PI, Math.PI * 1.5); cr.strokeStyle = '#e5be4c'; cr.lineWidth = 4; cr.stroke();

  // Authentic Cities: Skylines / Korean Intersection: outer right-hand stop-bars -> zebra crosswalks -> clean unmarked center box!
  const [xc, xctx] = makeCanvas(S);
  fillWeatheredAsphalt(xctx, S, '#373e48');
  const corners: [number, number][] = [[0, 0], [S, 0], [0, S], [S, S]];
  for (const [cx, cy] of corners) {
    xctx.beginPath(); xctx.arc(cx, cy, 64, 0, Math.PI * 2);
    xctx.fillStyle = '#c4cbd4'; xctx.fill();
    xctx.strokeStyle = '#dfe5ec'; xctx.lineWidth = 7; xctx.stroke();
  }
  // 1. Crisp right-hand approach stop bars positioned BEFORE the crosswalks (outer edge!)
  xctx.fillStyle = 'rgba(242,246,250,0.82)';
  xctx.fillRect(S / 2 + 8, 8, S / 2 - 92, 6);        // Top approach (right lane going down)
  xctx.fillRect(84, S - 14, S / 2 - 92, 6);          // Bottom approach (right lane going up)
  xctx.fillRect(8, 84, 6, S / 2 - 92);               // Left approach (right lane going right)
  xctx.fillRect(S - 14, S / 2 + 8, 6, S / 2 - 92);   // Right approach (right lane going left)
  // 2. Crisp zebra crosswalk bars cleanly inside the stop bars, leaving center intersection box open
  xctx.fillStyle = 'rgba(242,246,250,0.84)';
  for (let i = 94; i <= S - 110; i += 36) {
    xctx.fillRect(i, 24, 16, 42); xctx.fillRect(i, S - 66, 16, 42);
    xctx.fillRect(24, i, 42, 16); xctx.fillRect(S - 66, i, 42, 16);
  }
  // 3. Subtle white dotted turn-box guide lines in center
  xctx.strokeStyle = 'rgba(242,246,250,0.22)';
  xctx.lineWidth = 3;
  xctx.setLineDash([12, 16]);
  xctx.strokeRect(102, 102, S - 204, S - 204);
  xctx.setLineDash([]);

  const [rbc, rb] = makeCanvas(S);
  fillWeatheredAsphalt(rb, S, '#353c46');
  for (const [cx, cy] of corners) { rb.beginPath(); rb.arc(cx, cy, 48, 0, Math.PI * 2); rb.fillStyle = '#c4cbd4'; rb.fill(); }
  rb.beginPath(); rb.arc(S / 2, S / 2, 184, 0, Math.PI * 2);
  rb.strokeStyle = 'rgba(242,246,250,0.78)'; rb.lineWidth = 8; rb.setLineDash([30, 26]); rb.stroke(); rb.setLineDash([]);
  rb.beginPath(); rb.arc(S / 2, S / 2, 118, 0, Math.PI * 2); rb.fillStyle = '#dfe5ec'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 102, 0, Math.PI * 2); rb.fillStyle = '#678c49'; rb.fill();
  rb.beginPath(); rb.arc(S / 2, S / 2, 48, 0, Math.PI * 2); rb.fillStyle = '#33768a'; rb.fill();

  const [rbmpC, rbmp] = makeCanvas(256);
  rbmp.fillStyle = '#808080'; rbmp.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 96 + Math.floor(hash2(i, 8.8) * 64);
    rbmp.fillStyle = `rgb(${v},${v},${v})`;
    rbmp.fillRect(hash2(i, 1.7) * 256, hash2(i, 3.9) * 256, 2, 2);
  }

  const [bbmpC, bbmp] = makeCanvas(256);
  const [brghC, brgh] = makeCanvas(256);
  const [bmetC, bmet] = makeCanvas(256);
  bbmp.fillStyle = '#c8c8c8'; bbmp.fillRect(0, 0, 256, 256);
  brgh.fillStyle = '#e0e0e0'; brgh.fillRect(0, 0, 256, 256); // Matte masonry mullions
  bmet.fillStyle = '#121212'; bmet.fillRect(0, 0, 256, 256); // Non-metallic stone/concrete frame
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 8; c++) {
      const wx = c * (256 / 8) + 3;
      const wy = r * (256 / 10) + 4;
      const ww = 256 / 8 - 6;
      const wh = 256 / 10 - 7.5;
      // Recessed glossy reflective glass pane!
      bbmp.fillStyle = '#242424';
      bbmp.fillRect(wx, wy, ww, wh);
      brgh.fillStyle = '#121212'; // Mirror-smooth architectural glass
      brgh.fillRect(wx, wy, ww, wh);
      bmet.fillStyle = '#f0f0f0'; // Crisp Cities: Skylines sky/cloud reflection on glass
      bmet.fillRect(wx, wy, ww, wh);
    }
  }

  // 8 Luminous Cities: Skylines Daylight Architectural Facades (gleaming blue/teal glass, warm limestone, Scandinavian white, brick)
  const [resLow, resLowEmi] = createFacadePair('#f2eadb', '#d9ceb8', '#b8ab96', '#678299', '#2b3b4a', '#fef08a', '#fde68a', 4, 4, 1.1, 'brick');
  const [resHigh, resHighEmi] = createFacadePair('#e6ebf0', '#c2ccd6', '#9aa5b2', '#6e8fa8', '#273847', '#fed7aa', '#fef08a', 6, 9, 2.3, 'modern');
  const [comHigh, comHighEmi] = createFacadePair('#6d94ba', '#35516e', '#bcc7d4', '#b0d4f0', '#27435c', '#fef08a', '#bae6fd', 8, 10, 3.7, 'glass');
  const [office, officeEmi] = createFacadePair('#5c8fa3', '#2a4a5c', '#cbd5df', '#a6d6e8', '#224052', '#e0f2fe', '#bae6fd', 8, 10, 5.1, 'glass');
  const [goldGlass, goldGlassEmi] = createFacadePair('#bfa37c', '#615038', '#d9cab0', '#ebd7b5', '#3d3020', '#fef08a', '#fed7aa', 8, 10, 6.4, 'glass');
  const [modernWhite, modernWhiteEmi] = createFacadePair('#f5f7f9', '#d8dee6', '#e4e9ef', '#6f92ad', '#243747', '#fef3c7', '#e0f2fe', 6, 9, 7.8, 'modern');
  const [terracottaBrick, terracottaBrickEmi] = createFacadePair('#c7755f', '#945140', '#dcd0be', '#627687', '#273440', '#fde047', '#fed7aa', 5, 7, 8.9, 'brick');
  const [artDecoStone, artDecoStoneEmi] = createFacadePair('#ebe5d8', '#c4bcb0', '#f3eee4', '#63788c', '#283645', '#fef08a', '#fde68a', 6, 9, 9.7, 'deco');

  const [indC, ind] = makeCanvas(S);
  ind.fillStyle = '#8b867e'; ind.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 24) {
    ind.fillStyle = x % 48 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.07)';
    ind.fillRect(x, 0, 12, S);
  }
  ind.fillStyle = '#403e3b'; ind.fillRect(0, S - 92, S, 92);
  ind.fillStyle = '#c48f2e'; ind.fillRect(0, S - 98, S, 6);
  ind.fillStyle = '#485463';
  for (let c = 0; c < 6; c++) ind.fillRect(c * 84 + 12, 42, 62, 54);

  const [civC, civ] = makeCanvas(S);
  civ.fillStyle = '#e5e2db'; civ.fillRect(0, 0, S, S);
  civ.fillStyle = '#c6c2b8'; civ.fillRect(0, 0, S, 36); civ.fillRect(0, S - 46, S, 46);
  for (let c = 0; c < 6; c++) {
    civ.fillStyle = '#d1cdc4'; civ.fillRect(c * (S / 6) + 8, 36, 18, S - 82);
    civ.fillStyle = '#364d66'; civ.fillRect(c * (S / 6) + 32, 62, 38, S - 134);
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
    terrainNormal: heightToNormalTexture(tbc, 1.8, true, 14),
    foliageAlbedo: toTex(flc, true, true),
    foliageBump: toTex(flbc, false, true),
    foliageCardRGBA: toTex(fcardC, true, false),
    pineFrondRGBA: toTex(pcardC, true, false),
    rockAlbedo: toTex(rkc, true, true),
    rockBump: toTex(rkbc, false, true),
    rockNormal: heightToNormalTexture(rkbc, 3.0, true, 1),
    plazaTile: toTex(plc, true, true),
    roofConcrete: toTex(rfc, true, false),
    roadStraight: toTex(r1c),
    avenueStraight: toTex(avc),
    highwayStraight: toTex(hwc),
    roadCorner: toTex(cc),
    roadCross: toTex(xc),
    roundabout: toTex(rbc),
    roadBump: toTex(rbmpC, false, true),
    roadNormal: heightToNormalTexture(rbmpC, 1.9, true, 1),
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
    buildingNormal: heightToNormalTexture(bbmpC, 2.8, true, 1),
    buildingRough: toTex(brghC, false, true),
    buildingMetal: toTex(bmetC, false, true),
  };
}
