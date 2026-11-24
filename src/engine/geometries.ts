import * as THREE from 'three';

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Adds baked vertical Contact Ambient Occlusion vertex colors to any geometry
 * (y in [-0.5, 0.5]) so buildings sit solidly grounded with realistic GI shadows at their base!
 */
export function bakeVerticalAO(geo: THREE.BufferGeometry, bottomAO = 0.56, topBoost = 1.05): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  const maxY = geo.boundingBox!.max.y;
  const span = Math.max(0.001, maxY - minY);

  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - minY) / span));
    // Steep AO shadow near ground contact (t = 0..0.32), bright clean sunlit upper stories
    const ao = bottomAO + (topBoost - bottomAO) * Math.pow(t, 0.55);
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao;
    cols[i * 3 + 2] = ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

export function createGroundedBoxGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 3, 1);
  return bakeVerticalAO(geo, 0.58, 1.04);
}

export function createGroundedTowerGeometry(rTop: number, rBot: number, segs = 8): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBot, 1, segs, 3);
  return bakeVerticalAO(geo, 0.58, 1.04);
}

/**
 * Organic ruffled broadleaf tree canopy with baked underside shadow AO
 * and sunlit upper foliage highlights (replaces smooth plastic spheres!).
 */
export function createOrganicBroadleafGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.48, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const n1 = hash3(Math.round(x * 12), Math.round(y * 12), Math.round(z * 12));
    const n2 = Math.sin(x * 9.5 + z * 7.2) * Math.cos(y * 8.4) * 0.5 + 0.5;
    const disp = 0.84 + n1 * 0.24 + n2 * 0.16;
    x *= disp;
    y *= disp * 0.86;
    z *= disp;
    pos.setXYZ(i, x, y, z);

    // Rich self-shadowing: deep canopy underside (0.44) -> sunlit top crown (1.12)
    const h = Math.max(0, Math.min(1, (y + 0.45) / 0.9));
    const ao = 0.44 + h * 0.68 + (n1 - 0.5) * 0.12;
    cols[i * 3] = Math.min(1.18, ao * 0.98);
    cols[i * 3 + 1] = Math.min(1.18, ao * 1.03);
    cols[i * 3 + 2] = Math.min(1.18, ao * 0.92);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Organic jagged coniferous spruce/pine bough tier with drooping branch lobes
 * and baked interior-to-tip Ambient Occlusion (replaces flat traffic-cone pines!).
 */
export function createOrganicPineGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.5, 1.0, 9, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    // Create ragged radial pine boughs & drooping branch tips
    const boughWave = 0.78 + 0.28 * Math.abs(Math.sin(ang * 5.0 + y * 6.0));
    const noise = hash3(Math.round(x * 16), Math.round(y * 16), Math.round(z * 16));
    const droop = r * 0.18 * (1 - (y + 0.5));
    x *= boughWave * (0.9 + noise * 0.22);
    z *= boughWave * (0.9 + noise * 0.22);
    y -= droop;
    pos.setXYZ(i, x, y, z);

    const h = Math.max(0, Math.min(1, y + 0.5));
    const ao = 0.42 + h * 0.58 + (boughWave - 0.78) * 0.45;
    cols[i * 3] = ao * 0.92;
    cols[i * 3 + 1] = ao * 1.04;
    cols[i * 3 + 2] = ao * 0.95;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Craggy realistic granite boulder geometry with baked crevice shading.
 */
export function createGraniteRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const n = hash3(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8));
    const s = 0.76 + n * 0.42;
    x *= s;
    y *= s * 0.72;
    z *= s;
    pos.setXYZ(i, x, y, z);

    const h = Math.max(0, Math.min(1, (y + 0.4) / 0.8));
    const ao = 0.48 + h * 0.58 + (n - 0.5) * 0.16;
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao * 0.99;
    cols[i * 3 + 2] = ao * 0.97;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}
