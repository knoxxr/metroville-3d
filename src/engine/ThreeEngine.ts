import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  DIRS,
  DISTRICT_SPEC_MAP,
  GRID,
  SECS,
  SECTOR,
  TOOL_MAP,
  inBounds,
  isRoadType,
  sectorIdx,
} from '../sim/constants';
import type { BrushPlan, CityState, InfoViewId, LightingMode } from '../sim/types';
import type { SimRuntime } from '../sim/simulation';
import { createPBRTextures, type PBRTextureSet } from './textures';
import { ConnectionOverlays, tileWorldX, tileWorldY, tileWorldZ } from './overlays';
import { LivingAtmosphere, buildProceduralEnvironment } from './atmosphere';
import {
  createWorldBuckets,
  populateCityAndNature,
  sampleNaturalElevation,
  type InstanceBucket,
} from './architecture';

export interface CameraRig {
  tx: number;
  tz: number;
  yaw: number;
  pitch: number;
  dist: number;
  targetTx: number;
  targetTz: number;
  targetYaw: number;
  targetPitch: number;
  targetDist: number;
}

export class ThreeEngine {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public overlays: ConnectionOverlays;
  public atmosphere: LivingAtmosphere;
  public cam: CameraRig = {
    tx: -2,
    tz: -2,
    yaw: 0.74,
    pitch: 0.62,
    dist: 38,
    targetTx: -2,
    targetTz: -2,
    targetYaw: 0.74,
    targetPitch: 0.62,
    targetDist: 38,
  };

  private canvas: HTMLCanvasElement;
  private textures: PBRTextureSet;
  private envDay: THREE.Texture;
  private envSunset: THREE.Texture;
  private envNight: THREE.Texture;
  private activeEnvKey: 'day' | 'sunset' | 'night' = 'day';

  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh;
  private skyUniforms: {
    uTopCol: { value: THREE.Color };
    uHorCol: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunCol: { value: THREE.Color };
    uTime: { value: number };
  };
  private waterUniforms: {
    uTime: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uSunCol: { value: THREE.Color };
    uWaterDeep: { value: THREE.Color };
    uWaterShallow: { value: THREE.Color };
    uSkyCol: { value: THREE.Color };
  };

  private worldGroup = new THREE.Group();
  private dynamicGroup = new THREE.Group();
  private terrainMesh: THREE.Mesh | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private outerValleyMesh: THREE.Mesh | null = null;
  private sectorGridLines: THREE.LineSegments | null = null;

  // Dynamic animated instances (wind rotors, 2-part vehicles, headlights, taillights, fires)
  private rotorPositions: THREE.Vector3[] = [];
  private rotorMesh: THREE.InstancedMesh | null = null;
  private vehicleMesh: THREE.InstancedMesh;
  private cabinMesh: THREE.InstancedMesh;
  private headlightMesh: THREE.InstancedMesh;
  private taillightMesh: THREE.InstancedMesh;
  private fireMesh: THREE.InstancedMesh;
  private fireCoords: THREE.Vector3[] = [];

  private nightMaterials: THREE.MeshStandardMaterial[] = [];
  private lampBulbMat: THREE.MeshStandardMaterial;
  private beaconMat: THREE.MeshStandardMaterial;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private rayHit = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private tmpCol = new THREE.Color();
  private worldDirty = true;
  private waterDirty = true;
  private currentNight = 0;
  private lastDt = 0.016;

  // Reusable shared geometries
  private geoUnitBox = new THREE.BoxGeometry(1, 1, 1);
  private geoRoadPlane = new THREE.PlaneGeometry(1.006, 1.006);
  private geoRoofPyramid = new THREE.ConeGeometry(0.68, 0.44, 4);
  private geoCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  private geoOctTower = new THREE.CylinderGeometry(0.46, 0.5, 1, 8);
  private geoTaperTower = new THREE.CylinderGeometry(0.26, 0.5, 1, 8);
  private geoPine = new THREE.ConeGeometry(0.48, 1, 8);
  private geoFoliage = new THREE.DodecahedronGeometry(0.46, 1);
  private geoRock = new THREE.DodecahedronGeometry(0.5, 0);
  private geoBush = new THREE.DodecahedronGeometry(0.45, 1);
  private geoSphere = new THREE.SphereGeometry(0.5, 10, 8);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.geoRoadPlane.rotateX(-Math.PI / 2);
    this.geoRoofPyramid.rotateY(Math.PI / 4);

    // 1. WebGL2 Renderer with ACES Filmic Tonemapping & Soft Shadows
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 2. Scene, Atmospheric Fog, Camera & Procedural IBL Environment Maps!
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc4dff7, 0.0042);
    this.camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.6, 380);

    this.envDay = buildProceduralEnvironment(this.renderer, 0x2563eb, 0xdbeafe, 0x3f6239, 2.4);
    this.envSunset = buildProceduralEnvironment(this.renderer, 0x312e81, 0xfb923c, 0x3a2d36, 3.0);
    this.envNight = buildProceduralEnvironment(this.renderer, 0x060c1f, 0x1e3a5f, 0x0b1120, 0.8);
    this.scene.environment = this.envDay;
    this.scene.environmentIntensity = 0.85;

    // 3. Post-Processing Pipeline (RenderPass -> UnrealBloomPass -> OutputPass)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.14, 0.55, 0.85);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // 4. High-Res 512x512 Procedural PBR Textures
    this.textures = createPBRTextures();

    // 5. Three-Point Outdoor Lighting (Sun + Cool Sky Bounce Fill + Hemisphere)
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x466642, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff8e6, 2.15);
    this.sunLight.position.set(34, 52, 28);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 160;
    const sd = 34;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Opposite cool-blue atmospheric sky bounce light (signature Cities: Skylines crisp blue shadow tint!)
    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.52);
    this.fillLight.position.set(-38, 24, -30);
    this.scene.add(this.fillLight);

    // 6. Atmospheric Sky Dome
    this.skyUniforms = {
      uTopCol: { value: new THREE.Color(0x1d4ed8) },
      uHorCol: { value: new THREE.Color(0xcbe4fa) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.72, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0xfff6d6) },
      uTime: { value: 0 },
    };
    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(250, 28, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.skyUniforms,
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vWorldDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTopCol;
          uniform vec3 uHorCol;
          uniform vec3 uSunDir;
          uniform vec3 uSunCol;
          uniform float uTime;
          varying vec3 vWorldDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
          }
          void main() {
            vec3 d = normalize(vWorldDir);
            float h = clamp(d.y * 1.35 + 0.08, 0.0, 1.0);
            vec3 col = mix(uHorCol, uTopCol, pow(h, 0.65));
            float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
            col += uSunCol * pow(sunDot, 10.0) * 0.30 + uSunCol * smoothstep(0.996, 0.9994, sunDot) * 1.6;
            if (d.y > 0.05) {
              vec2 uv = d.xz / (d.y + 0.24) * 1.45 + vec2(uTime * 0.012, uTime * 0.004);
              float cl = noise(uv * 2.1) * 0.55 + noise(uv * 4.7) * 0.30 + noise(uv * 9.5) * 0.15;
              float mask = smoothstep(0.55, 0.80, cl) * smoothstep(0.05, 0.26, d.y);
              col = mix(col, mix(uHorCol * 1.1, vec3(1.0), 0.6), mask * 0.55);
            }
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.scene.add(this.skyMesh);

    // 7. Depth-Absorbing Animated Water Shader Uniforms
    this.waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.72, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0xfffbeb) },
      uWaterDeep: { value: new THREE.Color(0x0a4d73) },
      uWaterShallow: { value: new THREE.Color(0x1689a8) },
      uSkyCol: { value: new THREE.Color(0xc7dff5) },
    };

    // 8. Groups, Overlays & Living Atmosphere
    this.scene.add(this.worldGroup);
    this.scene.add(this.dynamicGroup);
    this.overlays = new ConnectionOverlays();
    this.scene.add(this.overlays.root);
    this.atmosphere = new LivingAtmosphere();
    this.scene.add(this.atmosphere.root);

    this.lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde047,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });
    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });

    // 2-Part Detailed Vehicles (Glossy Chassis + Tinted Cabin + Headlights + Red Taillights!)
    this.vehicleMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.55 }),
      160
    );
    this.vehicleMesh.castShadow = true;
    this.vehicleMesh.count = 0;
    this.vehicleMesh.frustumCulled = false;
    this.dynamicGroup.add(this.vehicleMesh);

    this.cabinMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.1, metalness: 0.85 }),
      160
    );
    this.cabinMesh.count = 0;
    this.cabinMesh.frustumCulled = false;
    this.dynamicGroup.add(this.cabinMesh);

    this.headlightMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 }),
      160
    );
    this.headlightMesh.count = 0;
    this.headlightMesh.frustumCulled = false;
    this.dynamicGroup.add(this.headlightMesh);

    this.taillightMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e }),
      160
    );
    this.taillightMesh.count = 0;
    this.taillightMesh.frustumCulled = false;
    this.dynamicGroup.add(this.taillightMesh);

    this.fireMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.26, 0.72, 6),
      new THREE.MeshBasicMaterial({ color: 0xf97316 }),
      32
    );
    this.fireMesh.count = 0;
    this.fireMesh.frustumCulled = false;
    this.dynamicGroup.add(this.fireMesh);

    this.buildOuterValley();
    this.resize();
  }

  public markWorldDirty(withWater = false) {
    this.worldDirty = true;
    if (withWater) this.waterDirty = true;
  }

  public resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect?.width || window.innerWidth));
    const h = Math.max(1, Math.floor(rect?.height || window.innerHeight));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  }

  public screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.rayHit)) return null;
    const gx = Math.floor(this.rayHit.x + GRID / 2);
    const gy = Math.floor(this.rayHit.z + GRID / 2);
    if (!inBounds(gx, gy)) return null;
    return { x: gx, y: gy };
  }

  private buildOuterValley() {
    const geo = new THREE.PlaneGeometry(260, 260, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const inCore = Math.abs(x) < GRID / 2 + 0.8 && Math.abs(z) < GRID / 2 + 0.8;
      const distOut = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - GRID / 2);
      const isSouthOcean = z > GRID / 2 - 4;
      let y = -0.82;
      if (inCore) {
        y = -0.9;
        c.setHex(0x164e63);
      } else if (isSouthOcean) {
        y = -0.78;
        c.setHex(0x0c4a6e);
      } else {
        const ridge =
          Math.pow(Math.min(1, distOut / 46), 1.55) *
          (8.2 + Math.sin(x * 0.075) * 4.5 + Math.cos(z * 0.085) * 4.0 + Math.sin((x + z) * 0.048) * 5.0);
        y = -0.06 + Math.max(0, ridge);
        if (y > 12.5) c.setHex(0xdce6f2); // snow-dusted mountain peaks!
        else if (y > 8.2) c.setHex(0x64748b); // alpine granite
        else if (y > 3.6) c.setHex(0x3f6b32); // forested slopes
        else c.setHex(0x528240); // lush valley foothills
      }
      pos.setY(i, y);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    this.outerValleyMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: this.textures.terrainGrass,
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    this.outerValleyMesh.receiveShadow = true;
    this.scene.add(this.outerValleyMesh);

    const oceanGeo = new THREE.PlaneGeometry(260, 130);
    oceanGeo.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(
      oceanGeo,
      new THREE.MeshStandardMaterial({ color: 0x0a4d73, roughness: 0.16, metalness: 0.5 })
    );
    ocean.position.set(0, -0.24, 92);
    this.scene.add(ocean);
  }

  private getTileSurfaceColor(state: CityState, x: number, y: number, activeView: InfoViewId): number {
    const t = state.grid[y][x];
    const unlocked = state.sandboxUnlock || state.unlockedSectors[sectorIdx(x, y)];
    if (activeView === 'district') {
      if (!unlocked) return 0x263447;
      const spec = state.sectorSpecs[sectorIdx(x, y)] || 'general';
      return DISTRICT_SPEC_MAP[spec].hex;
    }
    if (activeView === 'traffic' && isRoadType(t.building?.type)) {
      return t.congestion > 1.2 ? 0xef4444 : t.congestion > 0.7 ? 0xf59e0b : 0x22c55e;
    }
    if (activeView === 'fire') return t.onFire ? 0xef4444 : t.fireCov > 55 ? 0x22c55e : t.fireCov > 20 ? 0xfacc15 : 0x334155;
    if (activeView === 'police') return t.policeCov > 55 ? 0x3b82f6 : t.policeCov > 20 ? 0x93c5fd : 0x475569;
    if (activeView === 'health') return t.sick ? 0xef4444 : t.healthCov > 55 ? 0x10b981 : t.healthCov > 20 ? 0x86efac : 0x334155;
    if (activeView === 'edu') return t.eduCov > 65 ? 0x8b5cf6 : t.eduCov > 30 ? 0xc4b5fd : 0x334155;
    if (activeView === 'garbage') return t.garbageAccum > 50 ? 0x92400e : t.garbageCov > 40 ? 0x22c55e : 0x475569;
    if (activeView === 'landvalue') {
      if (t.pollution > 15) return 0x92400e;
      return t.landValue > 70 ? 0x10b981 : t.landValue > 50 ? 0x6ee7b7 : 0x64748b;
    }

    if (t.terrain === 'water') return 0x154d66;
    if (t.terrain === 'sand') {
      // Warm wet shoreline gravel -> sunlit golden coastal sand
      return unlocked ? (t.hash > 0.5 ? 0xe7d5ad : 0xdcc698) : 0x9f9279;
    }
    if (t.zone && !t.building) {
      const col = TOOL_MAP['zone_' + t.zone]?.zCol;
      if (col) return new THREE.Color(col).getHex();
    }
    if (!unlocked) return t.hash > 0.5 ? 0x4b6e44 : 0x42633d;
    if (t.pollution > 18) return 0x80724d;
    // Realistic multi-biome elevation & moisture shading (lush river meadow -> warm olive uplands -> highland granite!)
    const natY = sampleNaturalElevation(x, y, t.elev, false, false);
    const patch = Math.sin(x * 0.23 + y * 0.17) * 0.5 + 0.5;
    if (natY > 0.42) return patch > 0.55 ? 0x7b8a5b : 0x677c4e;
    if (natY > 0.2) return patch > 0.5 ? 0x749949 : 0x5c8942;
    if (t.isCoast) return 0x6ea852;
    return patch > 0.62 ? 0x6ea350 : patch > 0.3 ? 0x5b8f45 : 0x4f803c;
  }

  public rebuildWorld(state: CityState, activeView: InfoViewId, activeTool: string) {
    for (let i = this.worldGroup.children.length - 1; i >= 0; i--) {
      const obj = this.worldGroup.children[i];
      if (obj === this.waterMesh && !this.waterDirty) continue;
      this.worldGroup.remove(obj);
      const geo = (obj as THREE.Mesh).geometry;
      if (
        geo &&
        geo !== this.geoUnitBox &&
        geo !== this.geoRoadPlane &&
        geo !== this.geoRoofPyramid &&
        geo !== this.geoCylinder &&
        geo !== this.geoOctTower &&
        geo !== this.geoTaperTower &&
        geo !== this.geoPine &&
        geo !== this.geoFoliage &&
        geo !== this.geoRock &&
        geo !== this.geoBush &&
        geo !== this.geoSphere
      ) {
        geo.dispose();
      }
    }
    this.nightMaterials = [];
    this.rotorPositions = [];
    this.fireCoords = [];

    // 1. Build Continuous Smooth Heightfield Terrain with Natural Rolling Elevation & Multi-Biome PBR Grass!
    const V = GRID + 1;
    const tPos = new Float32Array(V * V * 3);
    const tUV = new Float32Array(V * V * 2);
    const tCol = new Float32Array(V * V * 3);
    const tIdx: number[] = [];
    const cAcc = new THREE.Color();

    for (let vy = 0; vy < V; vy++) {
      for (let vx = 0; vx < V; vx++) {
        let sumY = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let cnt = 0;
        for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const tx = vx + ox;
          const ty = vy + oy;
          if (!inBounds(tx, ty)) continue;
          const t = state.grid[ty][tx];
          sumY += sampleNaturalElevation(tx, ty, t.elev, t.terrain === 'water', t.terrain === 'sand');
          cAcc.setHex(this.getTileSurfaceColor(state, tx, ty, activeView));
          sumR += cAcc.r;
          sumG += cAcc.g;
          sumB += cAcc.b;
          cnt++;
        }
        const i = vy * V + vx;
        tPos[i * 3] = vx - GRID / 2;
        tPos[i * 3 + 1] = cnt ? sumY / cnt : 0;
        tPos[i * 3 + 2] = vy - GRID / 2;
        tUV[i * 2] = vx / GRID;
        tUV[i * 2 + 1] = vy / GRID;
        tCol[i * 3] = cnt ? sumR / cnt : 0.4;
        tCol[i * 3 + 1] = cnt ? sumG / cnt : 0.6;
        tCol[i * 3 + 2] = cnt ? sumB / cnt : 0.3;
      }
    }
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const a = y * V + x;
        const b = a + 1;
        const c = (y + 1) * V + x;
        const d = c + 1;
        tIdx.push(a, c, b, b, c, d);
      }
    }
    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    terrainGeo.setAttribute('uv', new THREE.BufferAttribute(tUV, 2));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    terrainGeo.setIndex(tIdx);
    terrainGeo.computeVertexNormals();

    this.terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        map: activeView === 'none' ? this.textures.terrainGrass : undefined,
        bumpMap: activeView === 'none' ? this.textures.terrainBump : undefined,
        bumpScale: 0.04,
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    this.terrainMesh.receiveShadow = true;
    this.worldGroup.add(this.terrainMesh);

    // 2. Continuous Organic Water Surface intersecting the Smooth Terrain Heightfield!
    if (this.waterDirty) {
      if (this.waterMesh) {
        this.waterMesh.geometry.dispose();
        this.worldGroup.remove(this.waterMesh);
      }
      const waterLevel = -0.17;
      const wPos = new Float32Array(V * V * 3);
      const wInfo = new Float32Array(V * V * 2); // x = pollution, y = water depth (0 at shore -> 1 deep)
      for (let vy = 0; vy < V; vy++) {
        for (let vx = 0; vx < V; vx++) {
          const i = vy * V + vx;
          const groundY = tPos[i * 3 + 1];
          const depth = Math.max(0, Math.min(1, (waterLevel - groundY) / 0.55));
          let polSum = 0;
          let polCnt = 0;
          for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
            const tx = vx + ox;
            const ty = vy + oy;
            if (inBounds(tx, ty) && state.grid[ty][tx].terrain === 'water') {
              polSum += state.grid[ty][tx].waterPollution / 85;
              polCnt++;
            }
          }
          wPos[i * 3] = vx - GRID / 2;
          wPos[i * 3 + 1] = waterLevel;
          wPos[i * 3 + 2] = vy - GRID / 2;
          wInfo[i * 2] = polCnt ? Math.min(1, polSum / polCnt) : 0;
          wInfo[i * 2 + 1] = depth;
        }
      }
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
      wGeo.setAttribute('aWaterInfo', new THREE.BufferAttribute(wInfo, 2));
      wGeo.setIndex(tIdx);
      this.waterMesh = new THREE.Mesh(
        wGeo,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: this.waterUniforms,
          vertexShader: `
            attribute vec2 aWaterInfo;
            varying vec3 vWorldPos;
            varying vec2 vInfo;
            void main() {
              vInfo = aWaterInfo;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform vec3 uSunDir;
            uniform vec3 uSunCol;
            uniform vec3 uWaterDeep;
            uniform vec3 uWaterShallow;
            uniform vec3 uSkyCol;
            varying vec3 vWorldPos;
            varying vec2 vInfo;
            void main() {
              float depth = vInfo.y;
              if (depth <= 0.01) discard;
              float w1 = sin(vWorldPos.z * 3.4 - uTime * 2.2 + vWorldPos.x * 1.2);
              float w2 = cos(vWorldPos.x * 4.8 + vWorldPos.z * 2.1 - uTime * 1.7);
              float w3 = sin((vWorldPos.x - vWorldPos.z) * 7.2 + uTime * 2.9) * 0.4;
              vec3 N = normalize(vec3((w1 + w2 + w3) * 0.055, 1.0, (w1 - w2 + w3) * 0.055));
              vec3 V = normalize(cameraPosition - vWorldPos);
              float fres = pow(1.0 - max(dot(N, V), 0.0), 3.4);
              vec3 H = normalize(normalize(uSunDir) + V);
              float spec = pow(max(dot(N, H), 0.0), 110.0);
              vec3 baseWater = mix(uWaterShallow, uWaterDeep, smoothstep(0.08, 0.72, depth));
              vec3 col = mix(baseWater, uSkyCol, fres * 0.58) + uSunCol * spec * 1.25;
              // Thin delicate shoreline foam ripple right at the beach/bank edge, lit by sky!
              float shoreBand = smoothstep(0.26, 0.02, depth);
              float ripple = 0.55 + 0.45 * sin(uTime * 2.6 + vWorldPos.x * 3.2 + vWorldPos.z * 3.2);
              vec3 foamCol = mix(vec3(0.86, 0.94, 0.98), uSkyCol * 1.25, 0.55);
              col = mix(col, foamCol, shoreBand * ripple * 0.34);
              col = mix(col, vec3(0.36, 0.27, 0.13), clamp(vInfo.x, 0.0, 0.85));
              float alpha = smoothstep(0.01, 0.16, depth) * 0.92;
              gl_FragColor = vec4(col, alpha);
            }
          `,
        })
      );
      this.worldGroup.add(this.waterMesh);
      this.waterDirty = false;
    } else if (this.waterMesh && !this.waterMesh.parent) {
      this.worldGroup.add(this.waterMesh);
    }

    // 3. Sector Grid Overlay Lines
    const linePts: number[] = [];
    for (let i = 0; i <= SECS; i++) {
      const p = i * SECTOR - GRID / 2;
      linePts.push(p, 0.11, -GRID / 2, p, 0.11, GRID / 2);
      linePts.push(-GRID / 2, 0.11, p, GRID / 2, 0.11, p);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    this.sectorGridLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: activeView === 'district' ? 0.55 : 0.12 })
    );
    this.worldGroup.add(this.sectorGridLines);

    // 4. Populate Diverse Multi-Archetype Architecture & Realistic Natural Scenery!
    const B = createWorldBuckets();
    populateCityAndNature(state, activeView, B, this.rotorPositions, this.fireCoords);

    const commitBucket = (
      bucket: InstanceBucket,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      castShadow = true,
      receiveShadow = true
    ) => {
      if (bucket.matrices.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, bucket.matrices.length);
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      for (let i = 0; i < bucket.matrices.length; i++) {
        im.setMatrixAt(i, bucket.matrices[i]);
        im.setColorAt(i, bucket.colors[i]);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.worldGroup.add(im);
    };

    const makeNightMat = (
      map: THREE.Texture,
      emissiveMap: THREE.Texture | null,
      roughness: number,
      metalness: number,
      useRoughMap = false
    ) => {
      const m = new THREE.MeshStandardMaterial({
        map,
        bumpMap: this.textures.buildingBump,
        bumpScale: 0.035,
        roughnessMap: useRoughMap ? this.textures.buildingRough : undefined,
        emissive: emissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
        emissiveMap: emissiveMap || undefined,
        emissiveIntensity: this.currentNight * 1.5,
        roughness,
        metalness,
        envMapIntensity: metalness > 0.4 ? 1.35 : 0.72,
      });
      if (emissiveMap) this.nightMaterials.push(m);
      return m;
    };

    const roadMat = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        map,
        bumpMap: this.textures.roadBump,
        bumpScale: 0.025,
        roughness: 0.82,
        metalness: 0.06,
      });

    commitBucket(B.bRoad, this.geoRoadPlane, roadMat(this.textures.roadStraight), false, true);
    commitBucket(B.bAve, this.geoRoadPlane, roadMat(this.textures.avenueStraight), false, true);
    commitBucket(B.bHwy, this.geoRoadPlane, roadMat(this.textures.highwayStraight), false, true);
    commitBucket(B.bCorner, this.geoRoadPlane, roadMat(this.textures.roadCorner), false, true);
    commitBucket(B.bCross, this.geoRoadPlane, roadMat(this.textures.roadCross), false, true);
    commitBucket(B.bRoundabout, this.geoRoadPlane, roadMat(this.textures.roundabout), false, true);

    commitBucket(B.bPlaza, this.geoUnitBox, new THREE.MeshStandardMaterial({ map: this.textures.plazaTile, roughness: 0.88 }), false, true);
    commitBucket(B.bRoofTop, this.geoUnitBox, new THREE.MeshStandardMaterial({ map: this.textures.roofConcrete, roughness: 0.82 }), true, true);
    commitBucket(B.bResLow, this.geoUnitBox, makeNightMat(this.textures.resLow, this.textures.resLowEmi, 0.72, 0.06));
    commitBucket(B.bResHigh, this.geoUnitBox, makeNightMat(this.textures.resHigh, this.textures.resHighEmi, 0.56, 0.18, true));
    commitBucket(B.bComHigh, this.geoUnitBox, makeNightMat(this.textures.comHigh, this.textures.comHighEmi, 0.24, 0.72, true));
    commitBucket(B.bGlassCyl, this.geoOctTower, makeNightMat(this.textures.comHigh, this.textures.comHighEmi, 0.2, 0.78, true));
    commitBucket(B.bTaperGlass, this.geoTaperTower, makeNightMat(this.textures.office, this.textures.officeEmi, 0.18, 0.8, true));
    commitBucket(B.bOffice, this.geoUnitBox, makeNightMat(this.textures.office, this.textures.officeEmi, 0.22, 0.76, true));
    // 4 NEW Diverse Architectural Materials!
    commitBucket(B.bGoldGlass, this.geoUnitBox, makeNightMat(this.textures.goldGlass, this.textures.goldGlassEmi, 0.18, 0.82, true));
    commitBucket(B.bModernWhite, this.geoUnitBox, makeNightMat(this.textures.modernWhite, this.textures.modernWhiteEmi, 0.42, 0.22, true));
    commitBucket(B.bTerracotta, this.geoUnitBox, makeNightMat(this.textures.terracottaBrick, this.textures.terracottaBrickEmi, 0.78, 0.05));
    commitBucket(B.bArtDeco, this.geoUnitBox, makeNightMat(this.textures.artDecoStone, this.textures.artDecoStoneEmi, 0.62, 0.12));

    commitBucket(B.bInd, this.geoUnitBox, new THREE.MeshStandardMaterial({ map: this.textures.industrial, roughness: 0.76, metalness: 0.28 }));
    commitBucket(B.bCivic, this.geoUnitBox, new THREE.MeshStandardMaterial({ map: this.textures.civic, roughness: 0.44, metalness: 0.18 }));
    commitBucket(B.bSolar, this.geoUnitBox, new THREE.MeshStandardMaterial({ map: this.textures.solar, roughness: 0.18, metalness: 0.78, envMapIntensity: 1.4 }));
    commitBucket(B.bSolidBox, this.geoUnitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.18 }));
    commitBucket(B.bRoof, this.geoRoofPyramid, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.08 }));
    commitBucket(B.bCylinder, this.geoCylinder, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0.26 }));
    commitBucket(B.bTreeTrunk, this.geoCylinder, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 }));
    commitBucket(B.bBroadleaf, this.geoFoliage, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }));
    commitBucket(B.bPine, this.geoPine, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }));
    commitBucket(B.bRock, this.geoRock, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.06 }));
    commitBucket(B.bBush, this.geoBush, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 }));
    commitBucket(B.bLampBulb, this.geoSphere, this.lampBulbMat, false, false);
    commitBucket(B.bBeacon, this.geoUnitBox, this.beaconMat, false, false);

    if (this.rotorMesh) {
      this.dynamicGroup.remove(this.rotorMesh);
      this.rotorMesh.geometry.dispose();
      this.rotorMesh = null;
    }
    if (this.rotorPositions.length > 0) {
      const bladeGeo = new THREE.BoxGeometry(1.18, 0.085, 0.035);
      this.rotorMesh = new THREE.InstancedMesh(
        bladeGeo,
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 }),
        this.rotorPositions.length * 3
      );
      this.rotorMesh.frustumCulled = false;
      this.dynamicGroup.add(this.rotorMesh);
    }

    this.overlays.rebuildPowerCables(state);
    this.overlays.rebuildUtilityOverlays(state, activeView, activeTool);
    this.atmosphere.syncEmitters(state);
    this.worldDirty = false;
  }

  public updateLighting(mode: LightingMode, time: number) {
    let sunAng = 1.02;
    if (mode === 'sunset') sunAng = 0.23;
    else if (mode === 'night') sunAng = -0.35;
    else if (mode === 'auto') sunAng = Math.sin(time * 0.045) * 1.15 + 0.35;

    const night = Math.max(0, Math.min(1, (-sunAng + 0.22) * 2.1));
    const sunset = Math.max(0, 1 - Math.abs(sunAng - 0.24) * 2.6);
    this.currentNight = night;

    // Switch real PMREM IBL environment map for authentic glass skyscraper reflections!
    const desiredEnv: 'day' | 'sunset' | 'night' = night > 0.55 ? 'night' : sunset > 0.45 ? 'sunset' : 'day';
    if (desiredEnv !== this.activeEnvKey) {
      this.activeEnvKey = desiredEnv;
      this.scene.environment =
        desiredEnv === 'night' ? this.envNight : desiredEnv === 'sunset' ? this.envSunset : this.envDay;
    }
    this.scene.environmentIntensity = desiredEnv === 'night' ? 0.5 : desiredEnv === 'sunset' ? 1.05 : 0.92;

    const sunDir = new THREE.Vector3(Math.cos(sunAng) * 0.65, Math.max(0.16, Math.sin(sunAng)), 0.45).normalize();
    this.sunLight.position.set(
      this.cam.tx + sunDir.x * 55,
      Math.max(12, sunDir.y * 65),
      this.cam.tz + sunDir.z * 55
    );
    this.sunLight.target.position.set(this.cam.tx, 0, this.cam.tz);
    this.sunLight.target.updateMatrixWorld();

    const sd = Math.min(44, Math.max(18, this.cam.dist * 0.65));
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.camera.updateProjectionMatrix();

    const sunCol = new THREE.Color(0xfff9ea).lerp(new THREE.Color(0xff8e42), sunset).lerp(new THREE.Color(0x4768a8), night);
    const skyTop = new THREE.Color(0x1d4ed8).lerp(new THREE.Color(0x312e81), sunset).lerp(new THREE.Color(0x060b19), night);
    const skyHor = new THREE.Color(0xcbe4fa).lerp(new THREE.Color(0xfb923c), sunset * 0.85).lerp(new THREE.Color(0x131d36), night);

    this.sunLight.color.copy(sunCol);
    this.sunLight.intensity = Math.max(0.38, 2.2 * (1 - night * 0.78));
    this.fillLight.intensity = Math.max(0.24, 0.56 * (1 - night * 0.45));
    this.fillLight.color.setHex(0x93c5fd).lerp(new THREE.Color(0xa78bfa), sunset * 0.5).lerp(new THREE.Color(0x1e3a8a), night * 0.7);
    this.hemiLight.intensity = Math.max(0.3, 0.75 * (1 - night * 0.54));
    this.hemiLight.color.copy(skyHor);
    (this.scene.fog as THREE.FogExp2).color.copy(skyHor);

    this.skyUniforms.uTopCol.value.copy(skyTop);
    this.skyUniforms.uHorCol.value.copy(skyHor);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uSunCol.value.copy(sunCol);
    this.skyUniforms.uTime.value = time;

    this.waterUniforms.uTime.value = time;
    this.waterUniforms.uSunDir.value.copy(sunDir);
    this.waterUniforms.uSunCol.value.copy(sunCol);
    this.waterUniforms.uSkyCol.value.copy(skyHor);
    this.waterUniforms.uWaterDeep.value.setHex(0x0a4d73).lerp(new THREE.Color(0x061629), night * 0.82);
    this.waterUniforms.uWaterShallow.value.setHex(0x1689a8).lerp(new THREE.Color(0x0c2842), night * 0.82);

    for (const m of this.nightMaterials) {
      m.emissiveIntensity = night * 1.6 + sunset * 0.5;
    }
    this.lampBulbMat.emissiveIntensity = 0.25 + night * 2.3 + sunset * 0.9;
    this.beaconMat.emissiveIntensity = 0.85 + night * 1.4;
    this.bloomPass.strength = 0.13 + sunset * 0.18 + night * 0.46;
    this.bloomPass.threshold = 0.86 - night * 0.28;
  }

  public updateCamera(dt: number, keys: Set<string>) {
    this.lastDt = dt;
    const panSpd = Math.max(12, this.cam.dist * 0.75) * dt;
    const fwdX = -Math.sin(this.cam.yaw);
    const fwdZ = -Math.cos(this.cam.yaw);
    const rightX = Math.cos(this.cam.yaw);
    const rightZ = -Math.sin(this.cam.yaw);
    if (keys.has('w') || keys.has('arrowup')) {
      this.cam.targetTx += fwdX * panSpd;
      this.cam.targetTz += fwdZ * panSpd;
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      this.cam.targetTx -= fwdX * panSpd;
      this.cam.targetTz -= fwdZ * panSpd;
    }
    if (keys.has('a') || keys.has('arrowleft')) {
      this.cam.targetTx -= rightX * panSpd;
      this.cam.targetTz -= rightZ * panSpd;
    }
    if (keys.has('d') || keys.has('arrowright')) {
      this.cam.targetTx += rightX * panSpd;
      this.cam.targetTz += rightZ * panSpd;
    }
    if (keys.has('q')) this.cam.targetYaw -= 1.45 * dt;
    if (keys.has('e')) this.cam.targetYaw += 1.45 * dt;
    if (keys.has('r')) this.cam.targetPitch += 1.05 * dt;
    if (keys.has('f')) this.cam.targetPitch -= 1.05 * dt;
    if (keys.has('z')) this.cam.targetDist *= 1 - 1.2 * dt;
    if (keys.has('x')) this.cam.targetDist *= 1 + 1.2 * dt;

    this.cam.targetTx = Math.max(-GRID / 2, Math.min(GRID / 2, this.cam.targetTx));
    this.cam.targetTz = Math.max(-GRID / 2, Math.min(GRID / 2, this.cam.targetTz));
    this.cam.targetPitch = Math.max(0.24, Math.min(1.42, this.cam.targetPitch));
    this.cam.targetDist = Math.max(9, Math.min(96, this.cam.targetDist));

    const k = Math.min(1, dt * 11);
    this.cam.tx += (this.cam.targetTx - this.cam.tx) * k;
    this.cam.tz += (this.cam.targetTz - this.cam.tz) * k;
    this.cam.yaw += (this.cam.targetYaw - this.cam.yaw) * k;
    this.cam.pitch += (this.cam.targetPitch - this.cam.pitch) * k;
    this.cam.dist += (this.cam.targetDist - this.cam.dist) * k;

    const ch = Math.cos(this.cam.pitch) * this.cam.dist;
    const ey = Math.sin(this.cam.pitch) * this.cam.dist;
    const ex = this.cam.tx + Math.sin(this.cam.yaw) * ch;
    const ez = this.cam.tz + Math.cos(this.cam.yaw) * ch;
    this.camera.position.set(ex, ey, ez);
    this.camera.lookAt(this.cam.tx, 0, this.cam.tz);
    this.skyMesh.position.copy(this.camera.position);
  }

  public renderFrame(
    state: CityState,
    rt: SimRuntime,
    activeView: InfoViewId,
    activeTool: string,
    lightingMode: LightingMode,
    time: number
  ) {
    if (this.worldDirty) {
      this.rebuildWorld(state, activeView, activeTool);
    }

    this.updateLighting(lightingMode, time);
    this.overlays.animate(time);
    this.atmosphere.update(this.lastDt, time, this.currentNight);

    // Spinning wind turbine rotors
    if (this.rotorMesh && this.rotorPositions.length > 0) {
      let idx = 0;
      for (let i = 0; i < this.rotorPositions.length; i++) {
        const p = this.rotorPositions[i];
        for (let b = 0; b < 3; b++) {
          this.dummy.position.copy(p);
          this.dummy.rotation.set(0, 0, time * 2.5 + i * 0.7 + (b * Math.PI * 2) / 3);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          this.rotorMesh.setMatrixAt(idx++, this.dummy.matrix);
        }
      }
      this.rotorMesh.instanceMatrix.needsUpdate = true;
    }

    // 2-Part Detailed Vehicles + Glowing Headlights & Red Taillights!
    let vCount = 0;
    let lightCount = 0;
    const showLights = this.currentNight > 0.2 || lightingMode === 'sunset';

    const pushVeh = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      frac: number,
      colHex: number,
      sx: number,
      sy: number,
      sz: number,
      laneOff: number
    ) => {
      if (vCount >= 160) return;
      const wx0 = tileWorldX(x0);
      const wz0 = tileWorldZ(y0);
      const wx1 = tileWorldX(x1);
      const wz1 = tileWorldZ(y1);
      const dx = wx1 - wx0;
      const dz = wz1 - wz0;
      const len = Math.hypot(dx, dz) || 1;
      const fx = dx / len;
      const fz = dz / len;
      const rx = -fz * laneOff;
      const rz = fx * laneOff;
      const px = wx0 + dx * frac + rx;
      const pz = wz0 + dz * frac + rz;
      const isBridge = state.grid[y0]?.[x0]?.terrain === 'water';
      const py = (isBridge ? 0.26 : Math.max(0.05, tileWorldY(state, x0, y0))) + 0.065 * sy;
      const yaw = Math.atan2(dx, dz);

      // Chassis
      this.dummy.position.set(px, py, pz);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.set(sx, sy, sz);
      this.dummy.updateMatrix();
      this.vehicleMesh.setMatrixAt(vCount, this.dummy.matrix);
      this.tmpCol.setHex(colHex);
      this.vehicleMesh.setColorAt(vCount, this.tmpCol);

      // Tinted upper cabin
      this.dummy.position.set(px - fx * 0.02 * sz, py + 0.08 * sy, pz - fz * 0.02 * sz);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.set(sx * 0.92, sy * 0.95, sz * 0.85);
      this.dummy.updateMatrix();
      this.cabinMesh.setMatrixAt(vCount, this.dummy.matrix);
      vCount++;

      if (showLights && lightCount < 160) {
        // Warm Headlights in front
        this.dummy.position.set(px + fx * 0.2 * sz, py, pz + fz * 0.2 * sz);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.headlightMesh.setMatrixAt(lightCount, this.dummy.matrix);

        // Glowing Red Taillights in back
        this.dummy.position.set(px - fx * 0.2 * sz, py, pz - fz * 0.2 * sz);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.taillightMesh.setMatrixAt(lightCount, this.dummy.matrix);
        lightCount++;
      }
    };

    for (const v of rt.vehicles) {
      if (!v.path || v.idx >= v.path.length - 1) continue;
      const [x0, y0] = v.path[v.idx];
      const [x1, y1] = v.path[v.idx + 1];
      const sz = v.kind === 'bus' ? 1.62 : v.kind === 'truck' ? 1.38 : 1.0;
      const sy = v.kind === 'bus' ? 1.45 : v.kind === 'truck' ? 1.25 : 1.0;
      pushVeh(x0, y0, x1, y1, v.t, v.color, 1.0, sy, sz, v.lane);
    }
    const strobe = Math.sin(time * 18) > 0;
    for (const ev of rt.emergencyVehicles) {
      if (!ev.path || ev.idx >= ev.path.length - 1) continue;
      const [x0, y0] = ev.path[ev.idx];
      const [x1, y1] = ev.path[ev.idx + 1];
      const col =
        ev.kind === 'fire'
          ? strobe ? 0xef4444 : 0xfef08a
          : ev.kind === 'police'
            ? strobe ? 0x3b82f6 : 0xef4444
            : strobe ? 0xffffff : 0xf43f5e;
      pushVeh(x0, y0, x1, y1, ev.t, col, 1.15, 1.35, 1.5, 0.08);
    }

    this.vehicleMesh.count = vCount;
    this.vehicleMesh.instanceMatrix.needsUpdate = true;
    if (this.vehicleMesh.instanceColor) this.vehicleMesh.instanceColor.needsUpdate = true;

    this.cabinMesh.count = vCount;
    this.cabinMesh.instanceMatrix.needsUpdate = true;

    this.headlightMesh.count = lightCount;
    this.headlightMesh.instanceMatrix.needsUpdate = true;

    this.taillightMesh.count = lightCount;
    this.taillightMesh.instanceMatrix.needsUpdate = true;

    const fc = Math.min(this.fireCoords.length, 32);
    this.fireMesh.count = fc;
    for (let i = 0; i < fc; i++) {
      const p = this.fireCoords[i];
      const sc = 0.8 + Math.sin(time * 14 + i * 2.1) * 0.35;
      this.dummy.position.set(p.x, p.y + 0.25, p.z);
      this.dummy.rotation.set(0, time * 3 + i, 0);
      this.dummy.scale.set(sc, sc * 1.25, sc);
      this.dummy.updateMatrix();
      this.fireMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.fireMesh.instanceMatrix.needsUpdate = true;

    this.composer.render();
  }

  public updateLivePreview(
    state: CityState,
    activeTool: string,
    hover: { x: number; y: number } | null,
    plan: BrushPlan | null,
    anchor: { x: number; y: number } | null = null
  ) {
    this.overlays.updateLivePreview(state, activeTool, hover, plan, anchor);
  }
}
