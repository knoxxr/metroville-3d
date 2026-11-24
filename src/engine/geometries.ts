import * as THREE from 'three';

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Adds baked vertical Contact Ambient Occlusion vertex colors to any geometry
 * so buildings sit solidly grounded with realistic GI crevice shadows at their base!
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
    const ao = bottomAO + (topBoost - bottomAO) * Math.pow(t, 0.52);
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao;
    cols[i * 3 + 2] = ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

export function createGroundedBoxGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 3, 1);
  return bakeVerticalAO(geo, 0.56, 1.05);
}

export function createGroundedTowerGeometry(rTop: number, rBot: number, segs = 8): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBot, 1, segs, 3);
  return bakeVerticalAO(geo, 0.56, 1.05);
}

/**
 * Photorealistic Botanical Broadleaf Tree Canopy using intersecting curved leaf-cluster cards
 * with spherical canopy-wrapped normals (AAA foliage shading trick!) and deep core-to-tip AO.
 * Designed to pair with an alpha-tested RGBA botanical leaf-cluster texture.
 */
export function createOrganicBroadleafGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const tmpPos = new THREE.Vector3();
  const tmpNrm = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();

  // 14 organically distributed leaf cluster cards forming a full, airy natural oak/maple crown
  const cardConfigs: [number, number, number, number, number, number, number][] = [
    // [cx, cy, cz, rx, ry, rz, size]
    [0.0, 0.06, 0.0, 0.15, 0.0, 0.08, 0.96],
    [0.0, 0.06, 0.0, -0.12, Math.PI * 0.52, -0.1, 0.94],
    [0.0, 0.14, 0.0, 1.28, 0.35, 0.12, 0.90], // top horizontal crown canopy cap
    [0.24, 0.02, 0.18, 0.38, 0.72, -0.25, 0.78],
    [-0.25, 0.04, 0.16, 0.42, -0.82, 0.22, 0.76],
    [0.18, 0.0, -0.24, -0.36, 2.3, 0.2, 0.78],
    [-0.22, 0.05, -0.20, -0.40, -2.4, -0.18, 0.75],
    [0.04, 0.24, 0.12, 0.78, 0.2, 0.3, 0.72],
    [-0.10, 0.26, -0.10, -0.74, 1.8, -0.22, 0.70],
    [0.28, -0.10, -0.06, 0.55, 1.4, 0.45, 0.68],
    [-0.28, -0.10, 0.04, -0.52, -1.5, -0.40, 0.68],
    [0.02, -0.12, 0.28, 0.65, 0.1, -0.35, 0.66],
    [-0.04, -0.12, -0.28, -0.62, 3.0, 0.35, 0.66],
    [0.0, 0.30, 0.0, 1.48, 1.1, 0.0, 0.68], // sunlit upper leaf dome
  ];

  for (let c = 0; c < cardConfigs.length; c++) {
    const [cx, cy, cz, rx, ry, rz, size] = cardConfigs[c];
    euler.set(rx, ry, rz);
    q.setFromEuler(euler);
    const half = size * 0.5;
    const base = positions.length / 3;

    // 4 quad corners with slight organic bend (cupped outward)
    const corners: [number, number, number, number, number][] = [
      [-half, -half, -0.05 * size, 0, 0],
      [half, -half, -0.05 * size, 1, 0],
      [half, half, 0.06 * size, 1, 1],
      [-half, half, 0.06 * size, 0, 1],
    ];

    for (const [lx, ly, lz, u, v] of corners) {
      tmpPos.set(lx, ly, lz).applyQuaternion(q);
      tmpPos.x += cx;
      tmpPos.y += cy;
      tmpPos.z += cz;
      positions.push(tmpPos.x, tmpPos.y, tmpPos.z);
      uvs.push(u, v);

      // Spherical canopy normal wrapping eliminates flat card seams under directional sun!
      tmpNrm.set(tmpPos.x, tmpPos.y + 0.18, tmpPos.z).normalize();
      normals.push(tmpNrm.x, tmpNrm.y, tmpNrm.z);

      // Deep shadowed crown interior/underside -> crisp sunlit upper outer leaves
      const radial = Math.min(1, Math.hypot(tmpPos.x, tmpPos.y, tmpPos.z) / 0.56);
      const heightF = Math.max(0, Math.min(1, (tmpPos.y + 0.42) / 0.84));
      const ao = 0.38 + heightF * 0.54 + radial * 0.22;
      colors.push(Math.min(1.16, ao * 0.98), Math.min(1.16, ao * 1.03), Math.min(1.16, ao * 0.90));
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Photorealistic Conifer / Spruce Pine Bough Whorl Geometry using feathered alpha-tested
 * pine branch-fan cards (replaces solid plastic traffic cones!).
 * Spans y in [-0.5, 0.5] so a single tall instance creates a rich multi-tiered conifer!
 */
export function createOrganicPineGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const tmpPos = new THREE.Vector3();
  const tmpNrm = new THREE.Vector3();

  // 2 crossed full-height vertical spire silhouettes (anchors center volume from every angle)
  for (let p = 0; p < 3; p++) {
    const ang = (p * Math.PI) / 3;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const w = 0.54;
    const base = positions.length / 3;
    const verts: [number, number, number, number][] = [
      [-w, -0.5, 0, 0],
      [w, -0.5, 1, 0],
      [w * 0.65, 0.54, 1, 1],
      [-w * 0.65, 0.54, 0, 1],
    ];
    for (const [lx, ly, u, v] of verts) {
      const wx = lx * ca;
      const wz = lx * sa;
      positions.push(wx, ly, wz);
      uvs.push(u, v);
      tmpNrm.set(wx * 0.9, 0.45 + ly * 0.4, wz * 0.9).normalize();
      normals.push(tmpNrm.x, tmpNrm.y, tmpNrm.z);
      const h = (ly + 0.5) / 1.04;
      const edge = Math.abs(lx) / w;
      const ao = 0.40 + h * 0.52 + edge * 0.16;
      colors.push(ao * 0.92, ao * 1.04, ao * 0.94);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // 4 tiered horizontal drooping branch-fan whorls (makes top-down aerial views look 100% real!)
  const tiers = [
    { y: -0.30, rad: 0.52, droop: 0.14, count: 4, rotOff: 0.0 },
    { y: -0.06, rad: 0.44, droop: 0.12, count: 4, rotOff: 0.42 },
    { y: 0.16, rad: 0.34, droop: 0.09, count: 4, rotOff: 0.85 },
    { y: 0.34, rad: 0.22, droop: 0.06, count: 3, rotOff: 1.2 },
  ];

  for (const tier of tiers) {
    for (let k = 0; k < tier.count; k++) {
      const ang = tier.rotOff + (k * Math.PI * 2) / tier.count;
      const dirX = Math.cos(ang);
      const dirZ = Math.sin(ang);
      const sideX = -dirZ;
      const sideZ = dirX;
      const hw = tier.rad * 0.62;
      const len = tier.rad * 1.15;
      const base = positions.length / 3;

      // Inner stem edge -> outer drooping bough tip
      const pts: [number, number, number, number, number, number][] = [
        [sideX * hw * 0.45, tier.y + 0.04, sideZ * hw * 0.45, 0.18, 0.0, 0.0],
        [-sideX * hw * 0.45, tier.y + 0.04, -sideZ * hw * 0.45, 0.82, 0.0, 0.0],
        [dirX * len - sideX * hw, tier.y - tier.droop, dirZ * len - sideZ * hw, 1.0, 0.88, 1.0],
        [dirX * len + sideX * hw, tier.y - tier.droop, dirZ * len + sideZ * hw, 0.0, 0.88, 1.0],
      ];
      for (const [px, py, pz, u, v, tipF] of pts) {
        tmpPos.set(px, py, pz);
        positions.push(px, py, pz);
        uvs.push(u, v);
        tmpNrm.set(dirX * 0.45, 0.86, dirZ * 0.45).normalize();
        normals.push(tmpNrm.x, tmpNrm.y, tmpNrm.z);
        const h = Math.max(0, Math.min(1, tier.y + 0.5));
        const ao = 0.36 + h * 0.48 + tipF * 0.24;
        colors.push(ao * 0.92, ao * 1.04, ao * 0.95);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
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
    const ao = 0.44 + h * 0.62 + (n - 0.5) * 0.16;
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao * 0.99;
    cols[i * 3 + 2] = ao * 0.97;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted aerodynamic vehicle body (beveled hood, sloped cabin, tapered rear & underside AO)
 * replacing flat brick-box cars!
 */
export function createRealisticCarGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.21, 0.11, 0.40, 2, 2, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // Taper nose (+Z) and tail (-Z) slightly for realistic car profile
    const absZ = Math.abs(z) / 0.20;
    if (y > 0) {
      x *= 0.94 - absZ * 0.08;
      if (z > 0.08) y *= 0.72; // sloped hood
      if (z < -0.10) y *= 0.82; // tapered rear trunk
    } else {
      x *= 0.98;
    }
    pos.setXYZ(i, x, y, z);
    const ao = y < 0 ? 0.52 : 1.04;
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao;
    cols[i * 3 + 2] = ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}
