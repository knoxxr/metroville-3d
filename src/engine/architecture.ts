import * as THREE from 'three';
import { DIRS, GRID, inBounds, isRoadType } from '../sim/constants';
import type { CityState, InfoViewId } from '../sim/types';
import { tileWorldX, tileWorldZ } from './overlays';

export interface InstanceBucket {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

export function createBucket(): InstanceBucket {
  return { matrices: [], colors: [] };
}

export interface WorldBuckets {
  bRoad: InstanceBucket;
  bAve: InstanceBucket;
  bHwy: InstanceBucket;
  bCorner: InstanceBucket;
  bCross: InstanceBucket;
  bRoundabout: InstanceBucket;
  bPlaza: InstanceBucket;
  bRoofTop: InstanceBucket;
  bResLow: InstanceBucket;
  bResHigh: InstanceBucket;
  bComHigh: InstanceBucket;
  bGlassCyl: InstanceBucket;
  bTaperGlass: InstanceBucket;
  bOffice: InstanceBucket;
  bGoldGlass: InstanceBucket;
  bModernWhite: InstanceBucket;
  bTerracotta: InstanceBucket;
  bArtDeco: InstanceBucket;
  bInd: InstanceBucket;
  bCivic: InstanceBucket;
  bSolar: InstanceBucket;
  bSolidBox: InstanceBucket;
  bRoof: InstanceBucket;
  bCylinder: InstanceBucket;
  bTreeTrunk: InstanceBucket;
  bBroadleaf: InstanceBucket;
  bPine: InstanceBucket;
  bRock: InstanceBucket;
  bBush: InstanceBucket;
  bLampBulb: InstanceBucket;
  bBeacon: InstanceBucket;
}

export function createWorldBuckets(): WorldBuckets {
  return {
    bRoad: createBucket(),
    bAve: createBucket(),
    bHwy: createBucket(),
    bCorner: createBucket(),
    bCross: createBucket(),
    bRoundabout: createBucket(),
    bPlaza: createBucket(),
    bRoofTop: createBucket(),
    bResLow: createBucket(),
    bResHigh: createBucket(),
    bComHigh: createBucket(),
    bGlassCyl: createBucket(),
    bTaperGlass: createBucket(),
    bOffice: createBucket(),
    bGoldGlass: createBucket(),
    bModernWhite: createBucket(),
    bTerracotta: createBucket(),
    bArtDeco: createBucket(),
    bInd: createBucket(),
    bCivic: createBucket(),
    bSolar: createBucket(),
    bSolidBox: createBucket(),
    bRoof: createBucket(),
    bCylinder: createBucket(),
    bTreeTrunk: createBucket(),
    bBroadleaf: createBucket(),
    bPine: createBucket(),
    bRock: createBucket(),
    bBush: createBucket(),
    bLampBulb: createBucket(),
    bBeacon: createBucket(),
  };
}

/**
 * Multi-octave procedural elevation helper so terrain, forests, rocks,
 * and outer mountains form a cohesive natural landscape!
 */
export function sampleNaturalElevation(x: number, y: number, baseElev: number, isWater: boolean, isSand: boolean): number {
  if (isWater) return -0.82;
  if (isSand) return -0.04;
  // Gentle rolling natural hills on outer perimeter while keeping core river valley buildable
  const dCenter = Math.hypot(x - 30, y - 28);
  const roll =
    0.05 * Math.sin(x * 0.19) * Math.cos(y * 0.21) +
    0.03 * Math.sin((x + y) * 0.34);
  const outerRise = Math.max(0, (dCenter - 23) * 0.055) * (0.7 + 0.5 * Math.sin(x * 0.14 + y * 0.11));
  return baseElev * 0.4 + roll + outerRise;
}

import type { CityElevationField } from './roads';

/**
 * Populates all Cities: Skylines GPU-Instanced architecture, diverse building
 * archetypes, natural mixed forests, shoreline boulders, reeds, and outer valley pines.
 */
export function populateCityAndNature(
  state: CityState,
  activeView: InfoViewId,
  B: WorldBuckets,
  rotorPositions: THREE.Vector3[],
  fireCoords: THREE.Vector3[],
  elev: CityElevationField
) {
  const dummy = new THREE.Object3D();
  const push = (
    bucket: InstanceBucket,
    px: number,
    py: number,
    pz: number,
    sx: number,
    sy: number,
    sz: number,
    rotY = 0,
    colHex = 0xffffff,
    rotX = 0,
    rotZ = 0
  ) => {
    dummy.position.set(px, py, pz);
    dummy.rotation.set(rotX, rotY, rotZ);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    bucket.matrices.push(dummy.matrix.clone());
    bucket.colors.push(new THREE.Color(colHex));
  };

  const g = state.grid;
  const isR = (x: number, y: number) => inBounds(x, y) && isRoadType(g[y][x].building?.type);

  const OAK_COLS = [0x92ad7a, 0xa2b886, 0x829e6e, 0xadbd84, 0x99ab78];
  const ACCENT_COLS = [0xd4965d, 0xc98253, 0xd9a8b4, 0xc7a85c];
  const PINE_COLS = [0x6f9473, 0x5d8265, 0x7a9c7a, 0x53755c];
  const ROCK_COLS = [0x9c9890, 0x8b8e8c, 0x7d7a74, 0xa8a296];

  const addBroadleaf = (px: number, py: number, pz: number, sc: number, seed: number, allowAccent = true) => {
    push(B.bTreeTrunk, px, py + 0.2 * sc, pz, 0.08 * sc, 0.42 * sc, 0.08 * sc, 0, 0x5c493b);
    const isAccent = allowAccent && seed > 0.92;
    const baseCol = isAccent
      ? ACCENT_COLS[Math.floor(seed * 97) % ACCENT_COLS.length]
      : OAK_COLS[Math.floor(seed * 100) % OAK_COLS.length];
    const hiCol = isAccent ? 0xe0ab72 : 0xb2c98f;
    push(B.bBroadleaf, px, py + 0.52 * sc, pz, 0.78 * sc, 0.68 * sc, 0.78 * sc, seed * 6.2, baseCol);
    push(B.bBroadleaf, px + 0.14 * sc, py + 0.62 * sc, pz - 0.1 * sc, 0.54 * sc, 0.48 * sc, 0.54 * sc, seed * 3.1, hiCol);
  };

  const addAlpinePine = (px: number, py: number, pz: number, sc: number, seed: number) => {
    const col = PINE_COLS[Math.floor(seed * 83) % PINE_COLS.length];
    push(B.bTreeTrunk, px, py + 0.22 * sc, pz, 0.075 * sc, 0.44 * sc, 0.075 * sc, 0, 0x4d3c30);
    // Single multi-tiered feathered conifer spruce crown (4 horizontal bough whorls + 3 crossed spire silhouettes)
    push(B.bPine, px, py + 0.78 * sc, pz, 0.88 * sc, 1.32 * sc, 0.88 * sc, seed * 6.28, col);
  };

  const addBoulderCluster = (px: number, py: number, pz: number, sc: number, seed: number) => {
    const c0 = ROCK_COLS[Math.floor(seed * 41) % ROCK_COLS.length];
    const c1 = ROCK_COLS[Math.floor(seed * 73) % ROCK_COLS.length];
    push(B.bRock, px, py + 0.12 * sc, pz, 0.52 * sc, 0.3 * sc, 0.44 * sc, seed * 6, c0, seed * 0.4, seed * 0.3);
    push(B.bRock, px + 0.22 * sc, py + 0.08 * sc, pz + 0.16 * sc, 0.32 * sc, 0.22 * sc, 0.28 * sc, seed * 3, c1);
  };

  const addRoofDetails = (wx: number, roofY: number, wz: number, w: number, hash: number, withHelipad = false) => {
    push(B.bRoofTop, wx, roofY + 0.025, wz, w * 0.94, 0.05, w * 0.94, 0, 0x878e97);
    push(B.bSolidBox, wx - w * 0.16, roofY + 0.12, wz - w * 0.14, w * 0.32, 0.16, w * 0.28, 0, 0x626973);
    push(B.bSolidBox, wx + w * 0.18, roofY + 0.09, wz + w * 0.16, w * 0.18, 0.1, w * 0.18, 0, 0xadb4bd);
    if (withHelipad) {
      push(B.bCylinder, wx + w * 0.08, roofY + 0.06, wz + w * 0.06, w * 0.56, 0.03, w * 0.56, 0, 0x2d333b);
      push(B.bBeacon, wx + w * 0.08, roofY + 0.085, wz + w * 0.06, w * 0.26, 0.02, 0.04, 0, 0xdcb448);
    } else if (hash > 0.65) {
      push(B.bBush, wx + w * 0.16, roofY + 0.1, wz - w * 0.16, 0.2, 0.14, 0.2, hash * 5, 0x4c6b3b);
    }
  };

  // ==================== 1. INNER 60x60 METROPOLIS & NATURAL SCENERY ====================
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = g[y][x];
      const wx = tileWorldX(x);
      const wz = tileWorldZ(y);
      const wy = elev.tileGroundY[y * GRID + x];

      // Natural Scenery on unbuilt tiles: Shoreline Boulders, Reeds, Wildflower Bushes & Multi-Species Forests!
      if (!t.building && !t.zone) {
        if (t.terrain === 'sand' && t.isCoast) {
          if (t.hash > 0.7) addBoulderCluster(wx + (t.hash - 0.8) * 0.4, wy - 0.02, wz, 0.68 + t.hash * 0.45, t.hash);
          else if (t.hash < 0.28) {
            push(B.bBush, wx - 0.15, wy + 0.08, wz + 0.1, 0.28, 0.22, 0.28, t.hash * 6, 0x4b6334);
            push(B.bBush, wx + 0.18, wy + 0.06, wz - 0.12, 0.22, 0.18, 0.22, t.hash * 3, 0x5c703b);
          }
          continue;
        }
        if (t.terrain === 'grass') {
          const isHill = wy > 0.22;
          if (t.wildTree) {
            const sc = 0.82 + t.hash * 0.56;
            if (isHill || t.hash > 0.84) addAlpinePine(wx, wy, wz, sc, t.hash);
            else addBroadleaf(wx, wy, wz, sc, t.hash, true);
            if (t.hash > 0.8) push(B.bBush, wx + 0.28, wy + 0.09, wz + 0.24, 0.26, 0.2, 0.26, t.hash * 5, 0x3c522c);
          } else if (isHill && t.hash > 0.68) {
            addBoulderCluster(wx, wy, wz, 0.8 + t.hash * 0.5, t.hash);
          } else if (t.hash > 0.62 && t.hash < 0.72) {
            const bCol = t.hash > 0.7 ? 0xb5a44c : t.hash > 0.66 ? 0x586d3b : 0x455c32;
            push(B.bBush, wx + (t.hash - 0.67) * 5, wy + 0.06, wz, 0.22, 0.14, 0.22, t.hash * 9, bCol);
          }
        }
        continue;
      }

      const b = t.building;
      if (!b) continue;
      if (t.onFire) fireCoords.push(new THREE.Vector3(wx, wy + 1.0, wz));
      const bt = b.type;

      // ---- ROADS, ROUNDABOUTS & STAY-CABLE BRIDGES ----
      // Continuous road surfaces, sloped concrete curbs, approach ramps & guardrails
      // are built by buildConformingRoadMeshes() for 0.000m step-free transitions!
      if (isRoadType(bt)) {
        const isBridge = t.terrain === 'water';
        const ry = elev.roadCenterY[y * GRID + x];
        const nN = isR(x, y - 1);
        const nS = isR(x, y + 1);
        const nW = isR(x - 1, y);
        const nE = isR(x + 1, y);
        const deg = (nN ? 1 : 0) + (nS ? 1 : 0) + (nW ? 1 : 0) + (nE ? 1 : 0);
        const horiz = (nE || nW) && !(nN || nS);

        if (bt === 'roundabout') {
          push(B.bCylinder, wx, ry + 0.05, wz, 0.46, 0.12, 0.46, 0, 0x4b6e3f);
          push(B.bCylinder, wx, ry + 0.13, wz, 0.24, 0.08, 0.24, 0, 0x3b7a94);
          push(B.bBeacon, wx, ry + 0.3, wz, 0.08, 0.24, 0.08, 0, 0xbae6fd);
          addBroadleaf(wx + 0.14, ry + 0.1, wz + 0.12, 0.32, t.hash, true);
        } else if (!isBridge && deg <= 2 && !(deg === 2 && ((nN && nE) || (nE && nS) || (nS && nW) || (nW && nN)))) {
          if (bt === 'avenue' && (x + y) % 2 === 0) {
            addBroadleaf(wx, ry, wz, 0.34, t.hash, false);
          }
        }

        if (isBridge) {
          // Bridge support piers descending cleanly into riverbed from exact sloped soffit
          if ((x + y) % 2 === 0) {
            const pierH = Math.max(0.5, ry - 0.12 - -0.82);
            push(B.bCylinder, wx, ry - 0.12 - pierH * 0.5, wz, 0.28, pierH, 0.28, 0, 0x64748b);
          }
          // Stay-cable pylons & diagonal cables anchored to exact deck height ry
          if (bt === 'avenue' && (x + y) % 3 === 0) {
            const pylonBase = ry - 0.04;
            if (horiz) {
              push(B.bSolidBox, wx, pylonBase + 0.95, wz - 0.44, 0.12, 1.9, 0.12, 0, 0xd8dfe8);
              push(B.bSolidBox, wx, pylonBase + 0.95, wz + 0.44, 0.12, 1.9, 0.12, 0, 0xd8dfe8);
              push(B.bBeacon, wx, pylonBase + 1.92, wz, 0.14, 0.09, 0.96, 0, 0x94c5e8);
              for (const sgn of [-1, 1]) {
                push(B.bCylinder, wx + sgn * 0.65, pylonBase + 0.85, wz - 0.44, 0.024, 1.9, 0.024, 0, 0xd4dbe4, 0, sgn * 0.64);
                push(B.bCylinder, wx + sgn * 0.65, pylonBase + 0.85, wz + 0.44, 0.024, 1.9, 0.024, 0, 0xd4dbe4, 0, sgn * 0.64);
              }
            } else {
              push(B.bSolidBox, wx - 0.44, pylonBase + 0.95, wz, 0.12, 1.9, 0.12, 0, 0xd8dfe8);
              push(B.bSolidBox, wx + 0.44, pylonBase + 0.95, wz, 0.12, 1.9, 0.12, 0, 0xd8dfe8);
              push(B.bBeacon, wx, pylonBase + 1.92, wz, 0.96, 0.09, 0.14, 0, 0x94c5e8);
              for (const sgn of [-1, 1]) {
                push(B.bCylinder, wx - 0.44, pylonBase + 0.85, wz + sgn * 0.65, 0.024, 1.9, 0.024, 0, 0xd4dbe4, -sgn * 0.64, 0);
                push(B.bCylinder, wx + 0.44, pylonBase + 0.85, wz + sgn * 0.65, 0.024, 1.9, 0.024, 0, 0xd4dbe4, -sgn * 0.64, 0);
              }
            }
          }
        } else if (bt === 'avenue' && (x + y) % 3 === 0 && deg <= 2) {
          push(B.bCylinder, wx + 0.43, ry + 0.34, wz + 0.43, 0.04, 0.68, 0.04, 0, 0x475569);
          push(B.bLampBulb, wx + 0.43, ry + 0.7, wz + 0.43, 0.12, 0.09, 0.12, 0, 0xfef08a);
        }
        continue;
      }

      const lv = b.level || 1;
      const dim = b.abandoned ? 0x64748b : 0xffffff;
      // Dramatic skyline height hierarchy (hero towers vs varied mid-rises!)
      const heroBoost = t.hash > 0.84 ? 1.42 : t.hash < 0.25 ? 0.76 : 0.95 + t.hash * 0.25;
      const style = Math.floor(t.hash * 6);
      const rot90 = ((x * 3 + y * 5) % 4) * (Math.PI / 2);

      // Deep-grounded Concrete Plaza / Courtyard Foundation Plinth (never floats on slopes!)
      if (bt !== 'wind' && bt !== 'power_line' && bt !== 'park') {
        const padCol = bt === 'ind' ? 0x8f98a4 : bt === 'res_low' ? 0xc2ccb6 : 0xcbd2da;
        push(B.bPlaza, wx, wy - 0.065, wz, 0.96, 0.22, 0.96, 0, padCol);
      }

      // ---- 1. SUBURBAN VILLAS & HOMES (4 Diverse Styles!) ----
      if (bt === 'res_low') {
        const sub = style % 4;
        const h = (0.36 + lv * 0.15) * (0.9 + t.hash * 0.24);
        if (sub === 0) {
          // Classic Gable-Roof Cottage + Chimney + Backyard Tree
          push(B.bResLow, wx - 0.05, wy + 0.05 + h / 2, wz, 0.56, h, 0.52, rot90, b.abandoned ? 0x64748b : 0xfff7ed);
          push(B.bRoof, wx - 0.05, wy + 0.05 + h + 0.18, wz, 0.65, 0.84, 0.6, rot90, b.abandoned ? 0x475569 : 0xb91c1c);
          push(B.bSolidBox, wx + 0.12, wy + 0.05 + h + 0.2, wz - 0.1, 0.09, 0.26, 0.09, 0, 0x7c2d12);
        } else if (sub === 1) {
          // Modern White Flat-Roof Villa with Cantilevered Deck!
          push(B.bModernWhite, wx - 0.06, wy + 0.05 + h * 0.55, wz - 0.04, 0.62, h * 1.1, 0.48, rot90, dim);
          push(B.bSolidBox, wx + 0.06, wy + 0.05 + h * 0.4, wz + 0.16, 0.36, h * 0.72, 0.28, rot90, 0xd6c7b2);
          push(B.bRoofTop, wx - 0.06, wy + 0.05 + h * 1.12, wz - 0.04, 0.66, 0.05, 0.52, rot90, 0x334155);
        } else if (sub === 2) {
          // Terracotta Mediterranean Villa with Warm Stucco & Courtyard!
          push(B.bTerracotta, wx, wy + 0.05 + h / 2, wz, 0.58, h, 0.56, rot90, b.abandoned ? 0x64748b : 0xfef3c7);
          push(B.bRoof, wx, wy + 0.05 + h + 0.17, wz, 0.68, 0.76, 0.66, rot90, 0xc2410c);
        } else {
          // L-Shaped Two-Tone Family House with Slate Roof & Front Porch
          push(B.bResLow, wx - 0.08, wy + 0.05 + h / 2, wz - 0.06, 0.54, h, 0.44, 0, b.abandoned ? 0x64748b : 0xe2e8f0);
          push(B.bResLow, wx + 0.16, wy + 0.05 + h * 0.38, wz + 0.12, 0.3, h * 0.76, 0.38, 0, 0xf1f5f9);
          push(B.bRoof, wx - 0.08, wy + 0.05 + h + 0.16, wz - 0.06, 0.62, 0.74, 0.52, 0, 0x334155);
        }
        addBroadleaf(wx + 0.3, wy + 0.04, wz + 0.3, 0.42, t.hash, true);
        push(B.bBush, wx - 0.32, wy + 0.08, wz + 0.28, 0.18, 0.13, 0.18, t.hash * 5, 0x22c55e);

      // ---- 2. HIGH-DENSITY RESIDENTIAL (4 Distinct Mid/High-Rise Styles!) ----
      } else if (bt === 'res_high') {
        const sub = style % 4;
        const h = (0.95 + lv * 0.68) * heroBoost;
        if (sub === 0) {
          // Warm Terracotta Brick European Condominium Block + Sloped Slate Crown!
          push(B.bArtDeco, wx, wy + 0.18, wz, 0.84, 0.28, 0.84, 0, dim);
          push(B.bTerracotta, wx, wy + 0.3 + h * 0.45, wz, 0.76, h * 0.9, 0.76, rot90, dim);
          push(B.bRoof, wx, wy + 0.3 + h * 0.9 + 0.22, wz, 0.78, 0.95, 0.78, rot90, 0x334155);
        } else if (sub === 1) {
          // Crisp White Modernist Balcony Condo Tower + Sky Garden Terrace!
          push(B.bSolidBox, wx, wy + 0.16, wz, 0.84, 0.24, 0.84, 0, 0x64748b);
          push(B.bModernWhite, wx, wy + 0.26 + h / 2, wz, 0.72, h, 0.66, rot90, dim);
          addRoofDetails(wx, wy + 0.26 + h, wz, 0.7, t.hash, false);
          if (!b.abandoned) push(B.bLampBulb, wx, wy + 0.26 + h + 0.22, wz, 0.34, 0.05, 0.34, 0, 0xfef08a);
        } else if (sub === 2) {
          // Classic Limestone Art-Deco Residential Tower!
          push(B.bArtDeco, wx, wy + 0.05 + h * 0.5, wz, 0.76, h, 0.76, 0, dim);
          push(B.bArtDeco, wx, wy + 0.05 + h + 0.24, wz, 0.52, 0.48, 0.52, 0, 0xf8fafc);
          addRoofDetails(wx, wy + 0.05 + h + 0.48, wz, 0.5, t.hash, false);
        } else {
          // Twin-Wing Modern Apartment Complex with Courtyard Trees!
          push(B.bSolidBox, wx, wy + 0.15, wz, 0.86, 0.22, 0.86, 0, 0x94a3b8);
          push(B.bResHigh, wx - 0.21, wy + 0.24 + h * 0.5, wz, 0.36, h, 0.72, 0, dim);
          push(B.bModernWhite, wx + 0.21, wy + 0.24 + h * 0.4, wz, 0.36, h * 0.8, 0.72, 0, dim);
          addBroadleaf(wx, wy + 0.24, wz + 0.28, 0.32, t.hash, true);
        }

      // ---- 3. LOW-DENSITY COMMERCIAL SHOPS (3 Styles with Awnings & Signage!) ----
      } else if (bt === 'com_low') {
        const sub = style % 3;
        const h = (0.44 + lv * 0.2) * (0.9 + t.hash * 0.25);
        const awnCol = sub === 0 ? 0xef4444 : sub === 1 ? 0x0284c7 : 0x16a34a;
        const bodyB = sub === 0 ? B.bTerracotta : sub === 1 ? B.bModernWhite : B.bArtDeco;
        push(bodyB, wx, wy + 0.05 + h / 2, wz, 0.82, h, 0.74, rot90, dim);
        addRoofDetails(wx, wy + 0.05 + h, wz, 0.78, t.hash, false);
        // Colorful storefront awning + glowing shop sign!
        push(B.bSolidBox, wx, wy + 0.24, wz + 0.4, 0.72, 0.07, 0.14, 0, awnCol);
        push(B.bBeacon, wx, wy + 0.05 + h + 0.1, wz + 0.32, 0.62, 0.09, 0.07, 0, sub === 0 ? 0xfacc15 : sub === 1 ? 0x38bdf8 : 0xf472b6);

      // ---- 4. HIGH-DENSITY CBD SKYSCRAPERS (6 Iconic Diverse Archetypes!) ----
      } else if (bt === 'com_high') {
        const h = (1.45 + lv * 1.12) * heroBoost;
        push(B.bCivic, wx, wy + 0.22, wz, 0.88, 0.36, 0.88, 0, dim);

        if (style === 0) {
          // Archetype 0: Tapering Modern Glass Spire (Lotte / Shard Silhouette!)
          push(B.bTaperGlass, wx, wy + 0.38 + h * 0.56, wz, 0.82, h * 1.12, 0.82, Math.PI / 8, dim);
          if (!b.abandoned) {
            push(B.bBeacon, wx, wy + 0.38 + h * 1.13, wz, 0.36, 0.07, 0.36, Math.PI / 8, 0x38bdf8);
            push(B.bCylinder, wx, wy + 0.38 + h * 1.13 + 0.45, wz, 0.04, 0.9, 0.04, 0, 0xf8fafc);
          }
        } else if (style === 1) {
          // Archetype 1: Champagne-Gold Luxury Corporate Setback Tower + Helipad!
          push(B.bGoldGlass, wx, wy + 0.38 + h * 0.5, wz, 0.78, h, 0.78, 0, dim);
          push(B.bGoldGlass, wx, wy + 0.38 + h + 0.32, wz, 0.56, 0.64, 0.56, 0, 0xfef3c7);
          addRoofDetails(wx, wy + 0.38 + h + 0.64, wz, 0.54, t.hash, lv >= 3);
          if (!b.abandoned) push(B.bBeacon, wx, wy + 0.38 + h + 0.66, wz, 0.57, 0.06, 0.57, 0, 0xfbbf24);
        } else if (style === 2) {
          // Archetype 2: Iconic Octagonal Sapphire Glass Tower!
          push(B.bGlassCyl, wx, wy + 0.38 + h / 2, wz, 0.78, h, 0.78, Math.PI / 8, dim);
          push(B.bGlassCyl, wx, wy + 0.38 + h + 0.26, wz, 0.54, 0.52, 0.54, Math.PI / 8, 0xbae6fd);
          if (!b.abandoned) {
            push(B.bBeacon, wx, wy + 0.38 + h + 0.54, wz, 0.46, 0.06, 0.46, Math.PI / 8, 0x38bdf8);
            push(B.bCylinder, wx, wy + 0.38 + h + 0.92, wz, 0.04, 0.78, 0.04, 0, 0xe2e8f0);
          }
        } else if (style === 3) {
          // Archetype 3: Classic Art-Deco Limestone Empire Tower with Illuminated Crown!
          push(B.bArtDeco, wx, wy + 0.38 + h * 0.48, wz, 0.78, h * 0.96, 0.78, 0, dim);
          push(B.bArtDeco, wx, wy + 0.38 + h * 0.96 + 0.34, wz, 0.54, 0.68, 0.54, 0, 0xfef3c7);
          push(B.bArtDeco, wx, wy + 0.38 + h * 0.96 + 0.82, wz, 0.32, 0.36, 0.32, 0, 0xf8fafc);
          if (!b.abandoned) {
            push(B.bBeacon, wx, wy + 0.38 + h * 0.96 + 1.02, wz, 0.34, 0.08, 0.34, 0, 0xfde68a);
            push(B.bCylinder, wx, wy + 0.38 + h * 0.96 + 1.42, wz, 0.04, 0.75, 0.04, 0, 0xe2e8f0);
          }
        } else if (style === 4) {
          // Archetype 4: Twin-Tower Staggered Glass Landmark with Illuminated Skybridge!
          push(B.bComHigh, wx - 0.19, wy + 0.38 + h * 0.52, wz, 0.36, h * 1.04, 0.68, 0, dim);
          push(B.bModernWhite, wx + 0.19, wy + 0.38 + h * 0.43, wz, 0.36, h * 0.86, 0.68, 0, dim);
          push(B.bBeacon, wx, wy + 0.38 + h * 0.58, wz, 0.48, 0.12, 0.26, 0, 0x7dd3fc);
        } else {
          // Archetype 5: White Modernist Luxury Mixed-Use Tower + Rooftop Sky Garden!
          push(B.bModernWhite, wx, wy + 0.38 + h * 0.5, wz, 0.76, h, 0.72, rot90, dim);
          addRoofDetails(wx, wy + 0.38 + h, wz, 0.72, 0.8, false);
          if (!b.abandoned) push(B.bBeacon, wx, wy + 0.38 + h + 0.07, wz, 0.74, 0.05, 0.7, rot90, 0x38bdf8);
        }

      // ---- 5. TECH & FINANCE OFFICE TOWERS (3 Sleek Styles!) ----
      } else if (bt === 'office') {
        const sub = style % 3;
        const h = (1.35 + lv * 1.02) * heroBoost;
        push(B.bCivic, wx, wy + 0.2, wz, 0.86, 0.32, 0.86, 0, dim);
        if (sub === 0) {
          push(B.bOffice, wx, wy + 0.34 + h / 2, wz, 0.74, h, 0.74, 0, dim);
          push(B.bOffice, wx, wy + 0.34 + h + 0.24, wz, 0.48, 0.48, 0.48, Math.PI / 4, 0xa5f3fc);
          if (!b.abandoned) push(B.bBeacon, wx, wy + 0.34 + h + 0.5, wz, 0.48, 0.06, 0.48, Math.PI / 4, 0x22d3ee);
        } else if (sub === 1) {
          // Champagne-Gold / Diamond Corporate Tower
          push(B.bGoldGlass, wx, wy + 0.34 + h / 2, wz, 0.72, h, 0.72, Math.PI / 4, dim);
          addRoofDetails(wx, wy + 0.34 + h, wz, 0.6, t.hash, lv >= 3);
        } else {
          // Modern White Cantilevered Tech HQ with Cyan Crown Fins
          push(B.bModernWhite, wx, wy + 0.34 + h * 0.48, wz, 0.78, h * 0.96, 0.62, rot90, dim);
          push(B.bOffice, wx, wy + 0.34 + h * 0.72, wz, 0.84, h * 0.32, 0.68, rot90, dim);
          if (!b.abandoned) push(B.bBeacon, wx, wy + 0.34 + h * 0.96 + 0.05, wz, 0.76, 0.06, 0.6, rot90, 0x22d3ee);
        }

      // ---- 6. INDUSTRIAL & SMART PORT (3 Detailed Styles!) ----
      } else if (bt === 'ind') {
        const sub = style % 3;
        const h = 0.46 + lv * 0.16;
        if (sub === 0) {
          // Manufacturing Plant + Smokestack + Storage Silo + Cargo Container
          push(B.bInd, wx - 0.06, wy + 0.05 + h / 2, wz - 0.04, 0.72, h, 0.68, 0, dim);
          push(B.bCylinder, wx + 0.28, wy + 0.05 + h + 0.36, wz - 0.22, 0.14, 0.78, 0.14, 0, 0x475569);
          push(B.bCylinder, wx + 0.26, wy + 0.05 + 0.28, wz + 0.22, 0.26, 0.52, 0.26, 0, 0xd6d3d1);
          push(B.bSolidBox, wx - 0.18, wy + 0.14, wz + 0.35, 0.36, 0.18, 0.16, 0, 0xdc2626);
        } else if (sub === 1) {
          // Logistics Container Yard with Stacked Colorful Containers & Yellow Gantry Frame!
          push(B.bInd, wx - 0.22, wy + 0.05 + h * 0.45, wz - 0.18, 0.44, h * 0.9, 0.48, 0, dim);
          push(B.bSolidBox, wx + 0.18, wy + 0.14, wz - 0.16, 0.34, 0.18, 0.16, 0, 0x2563eb);
          push(B.bSolidBox, wx + 0.18, wy + 0.32, wz - 0.16, 0.34, 0.18, 0.16, 0, 0xf59e0b);
          push(B.bSolidBox, wx + 0.12, wy + 0.14, wz + 0.22, 0.38, 0.18, 0.16, 0, 0x16a34a);
          // Yellow gantry crane arch
          push(B.bSolidBox, wx + 0.18, wy + 0.56, wz + 0.04, 0.06, 0.06, 0.78, 0, 0xfacc15);
          push(B.bSolidBox, wx + 0.18, wy + 0.3, wz - 0.34, 0.06, 0.52, 0.06, 0, 0xfacc15);
          push(B.bSolidBox, wx + 0.18, wy + 0.3, wz + 0.4, 0.06, 0.52, 0.06, 0, 0xfacc15);
        } else {
          // Modern Refinery / Grain Silos with Overhead Silver Pipe
          push(B.bInd, wx - 0.14, wy + 0.05 + h * 0.4, wz, 0.46, h * 0.8, 0.74, 0, dim);
          push(B.bCylinder, wx + 0.22, wy + 0.05 + 0.42, wz - 0.2, 0.3, 0.82, 0.3, 0, 0xe2e8f0);
          push(B.bCylinder, wx + 0.22, wy + 0.05 + 0.38, wz + 0.2, 0.3, 0.74, 0.3, 0, 0xcbd5e1);
          push(B.bSolidBox, wx + 0.04, wy + 0.65, wz, 0.36, 0.06, 0.06, 0, 0x94a3b8);
        }

      // ---- 7. DETAILED PARKS, CIVIC FACILITIES & LANDMARKS ----
      } else if (bt === 'park') {
        push(B.bSolidBox, wx, wy + 0.03, wz, 0.96, 0.06, 0.96, 0, 0x3b8c3e);
        push(B.bPlaza, wx, wy + 0.065, wz, 0.52, 0.03, 0.52, Math.PI / 4, 0xe2e8f0);
        push(B.bCylinder, wx, wy + 0.11, wz, 0.32, 0.08, 0.32, 0, 0x38bdf8);
        push(B.bBeacon, wx, wy + 0.24, wz, 0.07, 0.18, 0.07, 0, 0xbae6fd);
        addBroadleaf(wx - 0.3, wy + 0.04, wz - 0.3, 0.58, 0.95, true); // Cherry blossom / maple park accent!
        addBroadleaf(wx + 0.3, wy + 0.04, wz - 0.28, 0.54, t.hash + 0.3, false);
        addAlpinePine(wx - 0.28, wy + 0.04, wz + 0.3, 0.55, t.hash + 0.5);
        addBroadleaf(wx + 0.28, wy + 0.04, wz + 0.28, 0.52, t.hash + 0.7, true);
      } else if (bt === 'landmark') {
        push(B.bCivic, wx, wy + 0.3, wz, 0.94, 0.56, 0.94, 0, 0xf1f5f9);
        push(B.bTaperGlass, wx, wy + 3.0, wz, 0.52, 5.2, 0.52, 0, 0xe0f2fe);
        push(B.bCylinder, wx, wy + 5.05, wz, 1.02, 0.54, 1.02, 0, 0x0284c7);
        push(B.bBeacon, wx, wy + 5.08, wz, 1.06, 0.14, 1.06, 0, 0x38bdf8);
        push(B.bCylinder, wx, wy + 6.3, wz, 0.09, 2.3, 0.09, 0, 0xf8fafc);
        push(B.bBeacon, wx, wy + 7.5, wz, 0.22, 0.22, 0.22, 0, 0xf43f5e);
      } else if (bt === 'wind') {
        push(B.bCylinder, wx, wy + 1.0, wz, 0.11, 2.0, 0.11, 0, 0xf8fafc);
        push(B.bSolidBox, wx, wy + 1.98, wz + 0.05, 0.16, 0.15, 0.28, 0, 0xe2e8f0);
        rotorPositions.push(new THREE.Vector3(wx, wy + 1.98, wz + 0.2));
      } else if (bt === 'solar') {
        push(B.bSolar, wx, wy + 0.15, wz, 0.88, 0.12, 0.88, 0, 0xffffff, 0.18, 0);
      } else if (bt === 'coal') {
        push(B.bInd, wx, wy + 0.48, wz, 0.86, 0.88, 0.84, 0, 0x57534e);
        push(B.bCylinder, wx + 0.24, wy + 1.28, wz - 0.2, 0.24, 1.25, 0.24, 0, 0xd6d3d1);
        push(B.bCylinder, wx - 0.22, wy + 1.12, wz + 0.2, 0.18, 1.0, 0.18, 0, 0xa8a29e);
      } else if (bt === 'power_line') {
        push(B.bCylinder, wx, wy + 0.62, wz, 0.12, 1.24, 0.12, 0, 0x94a3b8);
        push(B.bSolidBox, wx, wy + 1.18, wz, 0.58, 0.06, 0.06, 0, 0xcbd5e1);
        push(B.bSolidBox, wx, wy + 0.92, wz, 0.42, 0.05, 0.05, 0, 0xcbd5e1);
        push(B.bBeacon, wx, wy + 1.27, wz, 0.08, 0.08, 0.08, 0, t.powered ? 0x38bdf8 : 0xf59e0b);
      } else if (bt === 'water_pump') {
        push(B.bCivic, wx, wy + 0.35, wz, 0.82, 0.64, 0.82, 0, 0x0284c7);
        push(B.bCylinder, wx, wy + 0.78, wz, 0.48, 0.36, 0.48, 0, 0xe0f2fe);
      } else if (bt === 'sewage') {
        push(B.bSolidBox, wx, wy + 0.32, wz, 0.82, 0.58, 0.82, 0, 0x475569);
        push(B.bCylinder, wx, wy + 0.7, wz, 0.44, 0.26, 0.44, 0, 0x854d0e);
      } else if (bt === 'fire_station') {
        push(B.bTerracotta, wx, wy + 0.44, wz, 0.86, 0.82, 0.86, 0, 0xef4444);
        push(B.bSolidBox, wx + 0.26, wy + 0.68, wz - 0.24, 0.24, 1.28, 0.24, 0, 0xdc2626); // hose drying tower!
        push(B.bBeacon, wx + 0.26, wy + 1.35, wz - 0.24, 0.18, 0.1, 0.18, 0, 0xf87171);
      } else if (bt === 'police_station') {
        push(B.bCivic, wx, wy + 0.48, wz, 0.86, 0.9, 0.86, 0, 0x2563eb);
        addRoofDetails(wx, wy + 0.93, wz, 0.8, t.hash, true);
        push(B.bBeacon, wx - 0.2, wy + 1.02, wz - 0.2, 0.2, 0.1, 0.2, 0, 0x60a5fa);
      } else if (bt === 'hospital') {
        push(B.bModernWhite, wx, wy + 0.66, wz, 0.88, 1.26, 0.86, 0, 0xf8fafc);
        push(B.bCylinder, wx, wy + 1.31, wz, 0.54, 0.04, 0.54, 0, 0x334155); // rooftop medical helipad!
        push(B.bSolidBox, wx, wy + 1.34, wz, 0.38, 0.04, 0.12, 0, 0xef4444);
        push(B.bSolidBox, wx, wy + 1.34, wz, 0.12, 0.04, 0.38, 0, 0xef4444);
      } else if (bt === 'school') {
        push(B.bArtDeco, wx, wy + 0.44, wz, 0.86, 0.82, 0.82, 0, 0xfef3c7);
        push(B.bRoof, wx, wy + 1.05, wz, 0.88, 0.7, 0.88, 0, 0x1d4ed8);
      } else if (bt === 'university') {
        push(B.bArtDeco, wx, wy + 0.62, wz, 0.9, 1.18, 0.9, 0, 0xf1f5f9);
        // Classic University Clock Tower!
        push(B.bArtDeco, wx, wy + 1.48, wz, 0.34, 1.1, 0.34, 0, 0xf8fafc);
        push(B.bRoof, wx, wy + 2.24, wz, 0.42, 0.86, 0.42, 0, 0x4f46e5);
        push(B.bBeacon, wx, wy + 1.75, wz + 0.18, 0.18, 0.18, 0.04, 0, 0xfef08a);
      } else if (bt === 'bus_stop' || bt === 'metro') {
        push(B.bSolidBox, wx, wy + 0.25, wz, 0.78, 0.44, 0.78, 0, bt === 'metro' ? 0x0f172a : 0x1d4ed8);
        push(B.bBeacon, wx, wy + 0.52, wz, 0.64, 0.08, 0.64, 0, bt === 'metro' ? 0x22d3ee : 0xfacc15);
      } else if (bt === 'landfill' || bt === 'incinerator') {
        push(B.bInd, wx, wy + 0.36, wz, 0.86, 0.68, 0.86, 0, bt === 'incinerator' ? 0x7c2d12 : 0x78716c);
        if (bt === 'incinerator') push(B.bCylinder, wx + 0.22, wy + 1.05, wz - 0.18, 0.22, 0.96, 0.22, 0, 0x57534e);
      }
    }
  }

  // ==================== 2. OUTER VALLEY FORESTED FOOTHILLS & ROCKY CRAGS ====================
  // Populate scenic distant foothills (outside the 60x60 playable boundary) with lush GPU-instanced pines & boulders!
  for (let i = 0; i < 420; i++) {
    const ang = (i * 2.39996) % (Math.PI * 2);
    const radius = 33 + ((i * 17.3) % 44);
    const ox = Math.cos(ang) * radius;
    const oz = Math.sin(ang) * radius;
    // Skip Southern Harbor Bay open ocean!
    if (oz > GRID / 2 - 4) continue;
    const distOut = Math.max(0, Math.max(Math.abs(ox), Math.abs(oz)) - GRID / 2);
    const ridge =
      Math.pow(Math.min(1, distOut / 46), 1.55) *
      (8.2 + Math.sin(ox * 0.075) * 4.5 + Math.cos(oz * 0.085) * 4.0 + Math.sin((ox + oz) * 0.048) * 5.0);
    const oy = -0.06 + Math.max(0, ridge);
    const h = Math.abs(Math.sin(i * 12.7 + 3.1));
    if (oy > 7.8) {
      addBoulderCluster(ox, oy - 0.1, oz, 1.5 + h * 1.4, h);
    } else if (i % 4 === 0) {
      addBroadleaf(ox, oy - 0.08, oz, 1.25 + h * 0.7, h, true);
    } else {
      addAlpinePine(ox, oy - 0.08, oz, 1.35 + h * 0.85, h);
    }
  }
}
