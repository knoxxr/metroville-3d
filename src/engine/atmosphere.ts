import * as THREE from 'three';
import { GRID } from '../sim/constants';
import type { CityState } from '../sim/types';
import { tileWorldX, tileWorldZ } from './overlays';

/**
 * Generates a realistic procedural sky + sun + ground IBL environment map
 * using Three.js PMREMGenerator so glass curtain-wall skyscrapers, water,
 * solar panels, and car roofs gleam with authentic Cities: Skylines reflections!
 */
export function buildProceduralEnvironment(
  renderer: THREE.WebGLRenderer,
  topHex: number,
  horizonHex: number,
  groundHex: number,
  sunIntensity = 2.2
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(20, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: new THREE.Color(topHex) },
      uHor: { value: new THREE.Color(horizonHex) },
      uGnd: { value: new THREE.Color(groundHex) },
      uSunI: { value: sunIntensity },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHor;
      uniform vec3 uGnd;
      uniform float uSunI;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = d.y >= 0.0
          ? mix(uHor, uTop, pow(d.y, 0.55))
          : mix(uHor * 0.75, uGnd, pow(-d.y, 0.5));
        float sunDot = max(dot(d, normalize(vec3(0.55, 0.65, 0.45))), 0.0);
        col += vec3(1.0, 0.96, 0.85) * pow(sunDot, 24.0) * uSunI;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  const rt = pmrem.fromScene(envScene, 0.02);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
  return rt.texture;
}

interface ShipAgent {
  group: THREE.Group;
  route: THREE.Vector3[];
  seg: number;
  t: number;
  speed: number;
}

interface SmokePuff {
  origin: THREE.Vector3;
  phase: number;
  driftX: number;
  driftZ: number;
}

/**
 * Adds living Cities: Skylines atmospheric life:
 * - Soft volumetric-style drifting 3D clouds
 * - Animated Harbor Cargo Ships & River Ferries with wakes
 * - Circling City Helicopter / Airliner with blinking nav beacons
 * - Rising smokestack plumes & park/roundabout fountain mist
 */
export class LivingAtmosphere {
  public root = new THREE.Group();
  private cloudGroup = new THREE.Group();
  private clouds: { mesh: THREE.Group; speed: number; baseZ: number }[] = [];
  private ships: ShipAgent[] = [];
  private heliGroup: THREE.Group;
  private heliRotor: THREE.Mesh;
  private heliBeacon: THREE.Mesh;

  private smokeMesh: THREE.InstancedMesh;
  private smokePuffs: SmokePuff[] = [];
  private dummy = new THREE.Object3D();

  constructor() {
    this.root.add(this.cloudGroup);
    this.buildClouds();
    this.buildShips();
    const { group, rotor, beacon } = this.buildHelicopter();
    this.heliGroup = group;
    this.heliRotor = rotor;
    this.heliBeacon = beacon;
    this.root.add(this.heliGroup);

    const puffGeo = new THREE.DodecahedronGeometry(0.18, 1);
    const puffMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.48,
      roughness: 1,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(puffGeo, puffMat, 180);
    this.smokeMesh.count = 0;
    this.smokeMesh.frustumCulled = false;
    this.root.add(this.smokeMesh);
  }

  private buildClouds() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1, 1);

    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(puffGeo, mat);
        const s = 2.4 + ((i * 7 + p * 5) % 10) * 0.25;
        m.position.set((p - (puffs - 1) * 0.5) * 2.4, Math.sin(p * 1.4) * 0.4, (p % 2 === 0 ? 0.6 : -0.6));
        m.scale.set(s * 1.35, s * 0.52, s);
        g.add(m);
      }
      const x = -85 + (i * 19.3) % 170;
      const z = -75 + ((i * 31.7) % 150);
      const y = 26 + (i % 4) * 3.5;
      g.position.set(x, y, z);
      this.cloudGroup.add(g);
      this.clouds.push({ mesh: g, speed: 0.45 + (i % 5) * 0.14, baseZ: z });
    }
  }

  private createShipMesh(cargo: boolean): THREE.Group {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(cargo ? 0.52 : 0.34, 0.2, cargo ? 1.75 : 0.95),
      new THREE.MeshStandardMaterial({ color: cargo ? 0x991b1b : 0xf8fafc, roughness: 0.55 })
    );
    hull.position.y = 0.06;
    hull.castShadow = true;
    g.add(hull);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(cargo ? 0.44 : 0.28, 0.28, cargo ? 0.42 : 0.45),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    cabin.position.set(0, 0.26, cargo ? -0.52 : 0.05);
    g.add(cabin);

    if (cargo) {
      const cols = [0x2563eb, 0xf59e0b, 0x16a34a, 0xdc2626];
      for (let i = 0; i < 4; i++) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.18, 0.24),
          new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.5 })
        );
        box.position.set(0, 0.22, -0.05 + i * 0.27);
        g.add(box);
      }
    }
    // White water wake trail
    const wake = new THREE.Mesh(
      new THREE.PlaneGeometry(cargo ? 0.6 : 0.38, cargo ? 1.5 : 0.9),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35, depthWrite: false })
    );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, -0.02, cargo ? -1.4 : -0.85);
    g.add(wake);
    return g;
  }

  private buildShips() {
    // 1. Harbor Cargo Ship cruising East-West along the Southern Harbor Bay!
    const harborRoute = [
      new THREE.Vector3(-28, -0.14, 27.5),
      new THREE.Vector3(0, -0.14, 26.8),
      new THREE.Vector3(28, -0.14, 27.4),
      new THREE.Vector3(28, -0.14, 30.2),
      new THREE.Vector3(-28, -0.14, 30.2),
    ];
    for (let i = 0; i < 2; i++) {
      const m = this.createShipMesh(true);
      this.root.add(m);
      this.ships.push({ group: m, route: harborRoute, seg: i * 2, t: i * 0.4, speed: 1.55 + i * 0.2 });
    }

    // 2. White Passenger River Ferry gliding along the Grand River!
    const riverRoute = [
      new THREE.Vector3(7.5, -0.14, -24),
      new THREE.Vector3(9.0, -0.14, -10),
      new THREE.Vector3(6.2, -0.14, 6),
      new THREE.Vector3(8.4, -0.14, 24),
      new THREE.Vector3(6.2, -0.14, 6),
      new THREE.Vector3(9.0, -0.14, -10),
    ];
    const ferry = this.createShipMesh(false);
    this.root.add(ferry);
    this.ships.push({ group: ferry, route: riverRoute, seg: 0, t: 0.2, speed: 1.85 });
  }

  private buildHelicopter() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.64),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3, metalness: 0.4 })
    );
    group.add(body);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
    );
    tail.position.set(0, 0.04, -0.52);
    group.add(tail);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.03, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x1e293b })
    );
    rotor.position.set(0, 0.18, 0);
    group.add(rotor);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    beacon.position.set(0, -0.13, 0);
    group.add(beacon);
    return { group, rotor, beacon };
  }

  public syncEmitters(state: CityState) {
    this.smokePuffs = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const b = state.grid[y][x].building;
        if (!b || b.abandoned) continue;
        if (b.type === 'coal' || b.type === 'incinerator' || (b.type === 'ind' && (x + y) % 4 === 0)) {
          const wx = tileWorldX(x) + 0.24;
          const wz = tileWorldZ(y) - 0.2;
          const baseH = b.type === 'coal' ? 1.85 : b.type === 'incinerator' ? 1.55 : 1.25;
          for (let k = 0; k < 3; k++) {
            if (this.smokePuffs.length >= 180) break;
            this.smokePuffs.push({
              origin: new THREE.Vector3(wx, baseH, wz),
              phase: (k / 3 + (x * 0.13 + y * 0.29)) % 1,
              driftX: 0.55,
              driftZ: 0.28,
            });
          }
        }
      }
    }
  }

  public update(dt: number, time: number, night: number) {
    // 1. Drifting 3D clouds
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 95) c.mesh.position.x = -95;
      c.mesh.position.z = c.baseZ + Math.sin(time * 0.08 + c.baseZ) * 1.5;
    }

    // 2. Sailing harbor ships & river ferry
    for (const s of this.ships) {
      const a = s.route[s.seg];
      const b = s.route[(s.seg + 1) % s.route.length];
      const dist = Math.max(0.5, a.distanceTo(b));
      s.t += (s.speed * dt) / dist;
      while (s.t >= 1) {
        s.t -= 1;
        s.seg = (s.seg + 1) % s.route.length;
      }
      const p0 = s.route[s.seg];
      const p1 = s.route[(s.seg + 1) % s.route.length];
      s.group.position.lerpVectors(p0, p1, s.t);
      s.group.position.y = -0.14 + Math.sin(time * 2.5 + s.seg) * 0.025;
      s.group.lookAt(p1.x, s.group.position.y, p1.z);
    }

    // 3. Circling city helicopter
    const ang = time * 0.22;
    const hx = Math.cos(ang) * 15 - 2;
    const hz = Math.sin(ang) * 12 - 2;
    const hy = 9.5 + Math.sin(time * 0.9) * 0.6;
    this.heliGroup.position.set(hx, hy, hz);
    this.heliGroup.rotation.y = -ang;
    this.heliRotor.rotation.y = time * 24;
    this.heliBeacon.visible = Math.sin(time * 10) > 0 || night > 0.3;

    // 4. Rising smokestack puffs
    const n = this.smokePuffs.length;
    this.smokeMesh.count = n;
    for (let i = 0; i < n; i++) {
      const p = this.smokePuffs[i];
      const f = (p.phase + time * 0.24) % 1;
      const sc = 0.45 + f * 1.65;
      this.dummy.position.set(
        p.origin.x + f * p.driftX + Math.sin(time * 1.5 + i) * 0.12,
        p.origin.y + f * 1.8,
        p.origin.z + f * p.driftZ
      );
      this.dummy.rotation.set(f * 2, f * 3, 0);
      this.dummy.scale.set(sc, sc * 0.8, sc);
      this.dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (n > 0) this.smokeMesh.instanceMatrix.needsUpdate = true;
  }
}
