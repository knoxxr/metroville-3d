import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
import {
  bakeVerticalAO,
  createGraniteRockGeometry,
  createGroundedBoxGeometry,
  createGroundedTowerGeometry,
  createOrganicBroadleafGeometry,
  createOrganicPineGeometry,
  createRealisticCarGeometry,
} from './geometries';
import {
  buildConformingRoadMeshes,
  computeCityElevationField,
  type CityElevationField,
} from './roads';

const PhotorealPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uNear: { value: 0.6 },
    uFar: { value: 380.0 },
    uNight: { value: 0.0 },
    uSunset: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uNear;
    uniform float uFar;
    uniform float uNight;
    uniform float uSunset;
    varying vec2 vUv;

    float readLinearDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return (uNear * uFar) / max(0.0001, uFar - z * (uFar - uNear));
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // 1. Subtle DSLR Unsharp Mask (razor-sharp window mullions, leaves & road markings)
      vec3 blur = (
        texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb +
        texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb
      ) * 0.25;
      col = max(vec3(0.0), col + (col - blur) * mix(0.28, 0.14, uNight));

      // 2. Real Hardware-Depth Screen-Space Ambient Occlusion (SSAO — zero extra scene passes!)
      float rawD = texture2D(tDepth, vUv).x;
      if (rawD < 0.9992) {
        float centerZ = readLinearDepth(vUv);
        float ao = 0.0;
        // Scale kernel gently with distance so skyscrapers & streets both get rich contact GI shadows
        float radPx = clamp(240.0 / max(centerZ, 8.0), 3.0, 14.0);
        // 8-tap golden-angle rotated spiral kernel
        float hashAng = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.28318;
        for (int i = 0; i < 8; i++) {
          float fi = float(i);
          float ang = hashAng + fi * 2.39996;
          float r = radPx * (0.32 + 0.68 * (fi + 0.5) / 8.0);
          vec2 suv = clamp(vUv + vec2(cos(ang), sin(ang)) * r * texel, 0.001, 0.999);
          float sz = readLinearDepth(suv);
          float dz = centerZ - sz;
          // Occlude if neighboring geometry is closer within physical contact radius (0.12m..2.8m)
          float rangeCheck = smoothstep(3.2, 0.15, abs(dz));
          ao += smoothstep(0.06, 0.55, dz) * rangeCheck;
        }
        ao = clamp(1.0 - (ao / 8.0) * mix(0.62, 0.34, uNight), 0.48, 1.0);
        col *= ao;
      }

      // 3. Natural Photographic Filmic S-Curve Contrast
      vec3 scurve = col * col * (3.0 - 2.0 * col);
      col = mix(col, scurve, 0.20);

      // 4. Aerial-Photo Split-Toning (cool atmospheric shadows, crisp warm sunlit highlights)
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = mix(vec3(0.95, 0.98, 1.04), vec3(0.90, 0.95, 1.08), uNight);
      vec3 highlightTint = mix(vec3(1.03, 1.01, 0.97), vec3(1.09, 0.96, 0.87), uSunset);
      col *= mix(shadowTint, highlightTint, smoothstep(0.16, 0.84, lum));

      // Natural saturation calibration
      float sat = mix(0.95, 1.03, uNight);
      col = mix(vec3(lum), col, sat);

      // Subtle optical lens vignette
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.88, 0.28, dot(d, d));
      col *= mix(0.90, 1.0, vig);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `,
};

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
  private gradePass: ShaderPass;
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
  private elevField: CityElevationField | null = null;

  // Reusable AO-baked & botanical photorealistic geometries
  private geoUnitBox = createGroundedBoxGeometry();
  private geoRoadPlane = new THREE.PlaneGeometry(1.006, 1.006);
  private geoRoofPyramid = bakeVerticalAO(new THREE.ConeGeometry(0.68, 0.44, 4), 0.72, 1.05);
  private geoCylinder = bakeVerticalAO(new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 2), 0.62, 1.04);
  private geoOctTower = createGroundedTowerGeometry(0.46, 0.5, 8);
  private geoTaperTower = createGroundedTowerGeometry(0.26, 0.5, 8);
  private geoPine = createOrganicPineGeometry();
  private geoFoliage = createOrganicBroadleafGeometry();
  private geoRock = createGraniteRockGeometry();
  private geoBush = createOrganicBroadleafGeometry();
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
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 2. Scene, Atmospheric Aerial Perspective Fog, Camera & Cloud-Reflecting IBL Cubemaps
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xd0e0ed, 0.0044);
    this.camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.6, 380);

    this.envDay = buildProceduralEnvironment(this.renderer, 0x3b6fa8, 0xdbe8f4, 0x4b5645, 2.5);
    this.envSunset = buildProceduralEnvironment(this.renderer, 0x2b365e, 0xe89966, 0x382e2b, 3.0);
    this.envNight = buildProceduralEnvironment(this.renderer, 0x050a18, 0x162640, 0x090e1a, 0.75);
    this.scene.environment = this.envDay;
    this.scene.environmentIntensity = 1.0;

    // 3. Post-Processing Pipeline with Hardware DepthTexture for Zero-Overhead Real SSAO!
    const initRt = new THREE.WebGLRenderTarget(1280, 720, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1280, 720),
    });
    this.composer = new EffectComposer(this.renderer, initRt);
    this.composer.renderTarget1.depthTexture = new THREE.DepthTexture(1280, 720);
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(1280, 720);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.10, 0.45, 0.90);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(PhotorealPostShader);
    this.composer.addPass(this.gradePass);

    // 4. High-Res Procedural PBR Textures (Normal Maps + Metalness/Roughness + Botanical Cards)
    this.textures = createPBRTextures();

    // 5. Physically Balanced Three-Point Outdoor Lighting (Crisp 4K Sun + Cool Sky Bounce + Hemisphere)
    this.hemiLight = new THREE.HemisphereLight(0xdcebf7, 0x525d49, 0.72);
    this.scene.add(this.hemiLight);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererInfo = String(
      (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
    );
    const isSoftwareGL = /swiftshader|llvmpipe|software/i.test(rendererInfo);
    const shadowRes = !isSoftwareGL && typeof window !== 'undefined' && window.innerWidth >= 1024 ? 4096 : 2048;
    this.sunLight = new THREE.DirectionalLight(0xfff6e3, 2.45);
    this.sunLight.position.set(34, 52, 28);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 160;
    const sd = 34;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.00032;
    this.sunLight.shadow.normalBias = 0.022;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Opposite cool sky bounce fill light for crisp sunlit/shadow contrast
    this.fillLight = new THREE.DirectionalLight(0x9bc0e6, 0.48);
    this.fillLight.position.set(-38, 24, -30);
    this.scene.add(this.fillLight);

    // 6. Photorealistic Rayleigh + Mie Scattering Sky Dome
    this.skyUniforms = {
      uTopCol: { value: new THREE.Color(0x36669c) },
      uHorCol: { value: new THREE.Color(0xd2e2ef) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.72, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0xfff3d4) },
      uTime: { value: 0 },
    };
    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(250, 32, 20),
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
            float h = clamp(d.y * 1.45 + 0.05, 0.0, 1.0);
            vec3 col = mix(uHorCol, uTopCol, pow(h, 0.58));
            float horizonBand = exp(-abs(d.y) * 9.0);
            col = mix(col, uHorCol * 1.06, horizonBand * 0.45);
            float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
            col += uSunCol * pow(sunDot, 7.0) * 0.22 + uSunCol * smoothstep(0.9965, 0.9994, sunDot) * 1.5;
            if (d.y > 0.04) {
              vec2 uv = d.xz / (d.y + 0.26) * 1.35 + vec2(uTime * 0.009, uTime * 0.003);
              float cl = noise(uv * 2.0) * 0.50 + noise(uv * 4.4) * 0.30 + noise(uv * 9.2) * 0.14 + noise(uv * 18.0) * 0.06;
              float mask = smoothstep(0.56, 0.82, cl) * smoothstep(0.04, 0.24, d.y);
              vec3 cloudLit = mix(uHorCol * 1.04, vec3(0.98, 0.97, 0.95), 0.55) + uSunCol * pow(sunDot, 4.0) * 0.18;
              col = mix(col, cloudLit, mask * 0.52);
            }
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.scene.add(this.skyMesh);

    // 7. Depth-Absorbing Natural Coastal Water Shader Uniforms
    this.waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.72, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0xfff5dc) },
      uWaterDeep: { value: new THREE.Color(0x0d283b) },
      uWaterShallow: { value: new THREE.Color(0x2a5c68) },
      uSkyCol: { value: new THREE.Color(0xc8daea) },
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
      emissive: 0xfcd34d,
      emissiveIntensity: 0.2,
      roughness: 0.25,
    });
    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0x94b8cc,
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.16,
      roughness: 0.28,
      metalness: 0.35,
    });

    // Sculpted Photorealistic Clearcoat Vehicles + Tinted Windshield Cabin + Headlights & Taillights
    this.vehicleMesh = new THREE.InstancedMesh(
      createRealisticCarGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.16,
        metalness: 0.68,
        envMapIntensity: 1.5,
      }),
      160
    );
    this.vehicleMesh.castShadow = true;
    this.vehicleMesh.count = 0;
    this.vehicleMesh.frustumCulled = false;
    this.dynamicGroup.add(this.vehicleMesh);

    this.cabinMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.072, 0.19),
      new THREE.MeshStandardMaterial({ color: 0x16202e, roughness: 0.08, metalness: 0.92, envMapIntensity: 1.6 }),
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
    const dpr = this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.gradePass.uniforms.uResolution.value.set(w * dpr, h * dpr);
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
        c.setHex(0x163544);
      } else if (isSouthOcean) {
        y = -0.78;
        c.setHex(0x0d2b3e);
      } else {
        const ridge =
          Math.pow(Math.min(1, distOut / 46), 1.55) *
          (8.2 + Math.sin(x * 0.075) * 4.5 + Math.cos(z * 0.085) * 4.0 + Math.sin((x + z) * 0.048) * 5.0);
        y = -0.06 + Math.max(0, ridge);
        if (y > 12.5) c.setHex(0xdbe2ea);
        else if (y > 8.2) c.setHex(0x687078);
        else if (y > 3.6) c.setHex(0x3e4f3b);
        else c.setHex(0x526146);
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
        normalMap: this.textures.terrainNormal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        vertexColors: true,
        roughness: 0.94,
        metalness: 0.02,
      })
    );
    this.outerValleyMesh.receiveShadow = true;
    this.scene.add(this.outerValleyMesh);

    const oceanGeo = new THREE.PlaneGeometry(260, 130);
    oceanGeo.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(
      oceanGeo,
      new THREE.MeshStandardMaterial({
        color: 0x0d283b,
        roughness: 0.12,
        metalness: 0.72,
        envMapIntensity: 1.4,
      })
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
    if (activeView === 'noise') {
      return t.noise > 18 ? 0xef4444 : t.noise > 9 ? 0xf59e0b : t.noise > 3 ? 0xfde047 : 0x22c55e;
    }

    if (t.terrain === 'water') return 0x1b3744;
    if (t.terrain === 'sand') {
      return unlocked ? (t.hash > 0.5 ? 0xd2c2a2 : 0xc2b08d) : 0x918775;
    }
    if (!unlocked) return t.hash > 0.5 ? 0x4b5944 : 0x43503d;
    if (t.pollution > 18) return 0x73694e;

    // Photorealistic aerial-photo multi-biome meadow, olive uplands & rocky scrub
    const natY = sampleNaturalElevation(x, y, t.elev, false, false);
    const patch = Math.sin(x * 0.23 + y * 0.17) * 0.5 + 0.5;
    let baseHex = patch > 0.62 ? 0x61734e : patch > 0.3 ? 0x566846 : 0x4d5e3f;
    if (natY > 0.42) baseHex = patch > 0.55 ? 0x767c5f : 0x686f55;
    else if (natY > 0.2) baseHex = patch > 0.5 ? 0x6a7652 : 0x5c6948;
    else if (t.isCoast) baseHex = 0x64734f;

    // Subtle graded development lot tint instead of flat neon toy squares!
    if (t.zone && !t.building) {
      const col = TOOL_MAP['zone_' + t.zone]?.zCol;
      if (col) {
        return new THREE.Color(baseHex).lerp(new THREE.Color(col), 0.24).getHex();
      }
    }
    return baseHex;
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

    // 1. Compute Continuous Step-Free Terrain & Road Heightfield (zero road steps, smooth bridge ramps!)
    const elev = computeCityElevationField(state);
    this.elevField = elev;

    const V = GRID + 1;
    const tPos = new Float32Array(V * V * 3);
    const tUV = new Float32Array(V * V * 2);
    const tCol = new Float32Array(V * V * 3);
    const tIdx: number[] = [];
    const cAcc = new THREE.Color();

    for (let vy = 0; vy < V; vy++) {
      for (let vx = 0; vx < V; vx++) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let cnt = 0;
        for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const tx = vx + ox;
          const ty = vy + oy;
          if (!inBounds(tx, ty)) continue;
          cAcc.setHex(this.getTileSurfaceColor(state, tx, ty, activeView));
          sumR += cAcc.r;
          sumG += cAcc.g;
          sumB += cAcc.b;
          cnt++;
        }
        const i = vy * V + vx;
        tPos[i * 3] = vx - GRID / 2;
        tPos[i * 3 + 1] = elev.terrainV[i];
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

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    if (activeView === 'none') {
      terrainMat.map = this.textures.terrainGrass;
      terrainMat.normalMap = this.textures.terrainNormal;
      terrainMat.normalScale = new THREE.Vector2(1.05, 1.05);
      // World-space multi-scale aerial meadow variation, automatic steep-slope rock & wet shoreline darkening!
      terrainMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNorm;')
          .replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTerrainWorldNorm = normalize(mat3(modelMatrix) * objectNormal);'
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNorm;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            // Dual-scale macro aerial-photo meadow/soil mottling (eliminates any tiling!)
            float m1 = sin(vTerrainWorldPos.x * 0.27 + vTerrainWorldPos.z * 0.19) * cos(vTerrainWorldPos.z * 0.31 - vTerrainWorldPos.x * 0.14);
            float m2 = sin(vTerrainWorldPos.x * 0.85 - vTerrainWorldPos.z * 0.72) * 0.5 + 0.5;
            diffuseColor.rgb *= (0.90 + 0.14 * m1 + 0.06 * (m2 - 0.5));
            // Automatic steep-slope rocky embankment exposure
            float slopeRock = smoothstep(0.92, 0.74, vTerrainWorldNorm.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.38) * (0.85 + 0.25 * m2), slopeRock * 0.85);
            // Realistic dark damp soil/sand right along the waterline (-0.17)
            float wetEdge = smoothstep(-0.01, -0.18, vTerrainWorldPos.y);
            diffuseColor.rgb *= mix(1.0, 0.62, wetEdge);
            `
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            float wetRough = smoothstep(-0.02, -0.18, vTerrainWorldPos.y);
            roughnessFactor = mix(roughnessFactor, 0.28, wetRough);
            `
          );
      };
    }
    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
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

            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p) {
              vec2 i = floor(p), f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
            }

            void main() {
              float depth = vInfo.y;
              if (depth <= 0.01) discard;
              // 6-octave river current swells + crisp micro capillary wind ripples
              vec2 p = vWorldPos.xz;
              float w1 = sin(p.y * 2.5 - uTime * 1.7 + p.x * 1.1);
              float w2 = cos(p.x * 4.2 + p.y * 2.1 - uTime * 1.4) * 0.72;
              float w3 = sin((p.x - p.y) * 8.4 + uTime * 2.6) * 0.42;
              float w4 = cos((p.x * 1.7 + p.y) * 14.2 - uTime * 3.2) * 0.28;
              float w5 = (vnoise(p * 3.8 + vec2(uTime * 0.45, -uTime * 0.35)) - 0.5) * 1.6;
              float w6 = (vnoise(p * 9.5 + vec2(-uTime * 0.7, uTime * 0.5)) - 0.5) * 0.9;
              vec3 N = normalize(vec3((w1 + w2 + w3 + w4 + w5 + w6) * 0.052, 1.0, (w1 - w2 + w3 - w4 - w5 + w6) * 0.052));

              vec3 V = normalize(cameraPosition - vWorldPos);
              vec3 R = reflect(-V, N);
              float NdotV = max(dot(N, V), 0.0);
              // Physical Schlick Fresnel (F0 = 0.03)
              float fres = 0.03 + 0.97 * pow(1.0 - NdotV, 4.2);

              // Reflected sky gradient + drifting procedural clouds on the river surface!
              vec2 ruv = R.xz / max(R.y + 0.25, 0.12) * 1.3 + vec2(uTime * 0.01, 0.0);
              float reflCloud = smoothstep(0.48, 0.78, vnoise(ruv * 1.6) * 0.65 + vnoise(ruv * 3.5) * 0.35);
              vec3 skyRefl = mix(uSkyCol * 0.78, uSkyCol * 1.18, clamp(R.y * 1.6, 0.0, 1.0));
              skyRefl = mix(skyRefl, mix(uSkyCol, vec3(0.96, 0.96, 0.94), 0.7), reflCloud * 0.42);

              // Crisp sunlit sparkle path + broad glint
              vec3 H = normalize(normalize(uSunDir) + V);
              float specTight = pow(max(dot(N, H), 0.0), 260.0);
              float specBroad = pow(max(dot(N, H), 0.0), 38.0) * 0.16;

              // Beers-Law physical water depth absorption + subtle dark riverbank ambient shadow
              vec3 baseWater = mix(uWaterShallow, uWaterDeep, smoothstep(0.05, 0.68, depth));
              float bankShadow = smoothstep(0.02, 0.34, depth);
              baseWater *= mix(0.76, 1.0, bankShadow);

              vec3 col = mix(baseWater, skyRefl, clamp(fres * 0.84, 0.0, 0.88)) + uSunCol * (specTight * 1.65 + specBroad);

              // Organic fine shoreline foam lap
              float shoreBand = smoothstep(0.18, 0.02, depth);
              float foamNoise = vnoise(p * 5.2 + vec2(uTime * 0.8, uTime * 0.6));
              vec3 foamCol = mix(vec3(0.84, 0.89, 0.92), uSkyCol * 1.12, 0.45);
              col = mix(col, foamCol, shoreBand * smoothstep(0.35, 0.85, foamNoise) * 0.28);

              col = mix(col, vec3(0.32, 0.26, 0.16), clamp(vInfo.x, 0.0, 0.85));
              float alpha = smoothstep(0.01, 0.14, depth) * 0.96;
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

    // 3. Sector Grid Overlay Lines (hidden in normal photorealistic gameplay, shown in district view)
    if (activeView === 'district') {
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
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.52 })
      );
      this.worldGroup.add(this.sectorGridLines);
    } else {
      this.sectorGridLines = null;
    }

    // 4. Populate Diverse Multi-Archetype Architecture & Realistic Natural Scenery!
    const B = createWorldBuckets();
    populateCityAndNature(state, activeView, B, this.rotorPositions, this.fireCoords, elev);

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
      useGlassPBR = false
    ) => {
      const params: THREE.MeshStandardMaterialParameters = {
        map,
        normalMap: this.textures.buildingNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        emissive: emissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
        emissiveIntensity: this.currentNight * 1.5,
        vertexColors: true,
        roughness: useGlassPBR ? 0.96 : roughness,
        metalness: useGlassPBR ? 0.92 : metalness,
        envMapIntensity: useGlassPBR ? 1.75 : metalness > 0.4 ? 1.45 : 0.7,
      };
      if (useGlassPBR) {
        params.roughnessMap = this.textures.buildingRough;
        params.metalnessMap = this.textures.buildingMetal;
      }
      if (emissiveMap) params.emissiveMap = emissiveMap;
      const m = new THREE.MeshStandardMaterial(params);
      if (emissiveMap) this.nightMaterials.push(m);
      return m;
    };

    // Continuous Step-Free Conforming Road Surfaces, Retaining Curbs & Sloped Bridge Guardrails!
    const roadMat = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        map,
        normalMap: this.textures.roadNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        vertexColors: true,
        roughness: 0.84,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

    const roadMeshes = buildConformingRoadMeshes(state, activeView, elev);
    const roadTextures = {
      road: this.textures.roadStraight,
      ave: this.textures.avenueStraight,
      hwy: this.textures.highwayStraight,
      corner: this.textures.roadCorner,
      cross: this.textures.roadCross,
      roundabout: this.textures.roundabout,
    };
    (Object.keys(roadTextures) as (keyof typeof roadTextures)[]).forEach((k) => {
      const geo = roadMeshes.surfaces[k];
      if (!geo) return;
      const m = new THREE.Mesh(geo, roadMat(roadTextures[k]));
      m.receiveShadow = true;
      this.worldGroup.add(m);
    });
    if (roadMeshes.curbsGeo) {
      const curbMesh = new THREE.Mesh(
        roadMeshes.curbsGeo,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.88,
          metalness: 0.06,
        })
      );
      curbMesh.castShadow = true;
      curbMesh.receiveShadow = true;
      this.worldGroup.add(curbMesh);
    }
    if (roadMeshes.railsGeo) {
      const railMesh = new THREE.Mesh(
        roadMeshes.railsGeo,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.56,
          metalness: 0.25,
        })
      );
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      this.worldGroup.add(railMesh);
    }

    commitBucket(
      B.bPlaza,
      this.geoUnitBox,
      new THREE.MeshStandardMaterial({
        map: this.textures.plazaTile,
        normalMap: this.textures.roadNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        vertexColors: true,
        roughness: 0.9,
      }),
      false,
      true
    );
    commitBucket(
      B.bRoofTop,
      this.geoUnitBox,
      new THREE.MeshStandardMaterial({
        map: this.textures.roofConcrete,
        normalMap: this.textures.roadNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        vertexColors: true,
        roughness: 0.86,
      }),
      true,
      true
    );
    commitBucket(B.bResLow, this.geoUnitBox, makeNightMat(this.textures.resLow, this.textures.resLowEmi, 0.78, 0.05));
    commitBucket(B.bResHigh, this.geoUnitBox, makeNightMat(this.textures.resHigh, this.textures.resHighEmi, 0.58, 0.16, true));
    commitBucket(B.bComHigh, this.geoUnitBox, makeNightMat(this.textures.comHigh, this.textures.comHighEmi, 0.22, 0.74, true));
    commitBucket(B.bGlassCyl, this.geoOctTower, makeNightMat(this.textures.comHigh, this.textures.comHighEmi, 0.18, 0.8, true));
    commitBucket(B.bTaperGlass, this.geoTaperTower, makeNightMat(this.textures.office, this.textures.officeEmi, 0.16, 0.82, true));
    commitBucket(B.bOffice, this.geoUnitBox, makeNightMat(this.textures.office, this.textures.officeEmi, 0.2, 0.78, true));
    commitBucket(B.bGoldGlass, this.geoUnitBox, makeNightMat(this.textures.goldGlass, this.textures.goldGlassEmi, 0.18, 0.82, true));
    commitBucket(B.bModernWhite, this.geoUnitBox, makeNightMat(this.textures.modernWhite, this.textures.modernWhiteEmi, 0.46, 0.18, true));
    commitBucket(B.bTerracotta, this.geoUnitBox, makeNightMat(this.textures.terracottaBrick, this.textures.terracottaBrickEmi, 0.82, 0.04));
    commitBucket(B.bArtDeco, this.geoUnitBox, makeNightMat(this.textures.artDecoStone, this.textures.artDecoStoneEmi, 0.68, 0.1));

    commitBucket(
      B.bInd,
      this.geoUnitBox,
      new THREE.MeshStandardMaterial({
        map: this.textures.industrial,
        normalMap: this.textures.buildingNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.26,
      })
    );
    commitBucket(
      B.bCivic,
      this.geoUnitBox,
      new THREE.MeshStandardMaterial({
        map: this.textures.civic,
        normalMap: this.textures.buildingNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        vertexColors: true,
        roughness: 0.52,
        metalness: 0.14,
      })
    );
    commitBucket(
      B.bSolar,
      this.geoUnitBox,
      new THREE.MeshStandardMaterial({
        map: this.textures.solar,
        vertexColors: true,
        roughness: 0.14,
        metalness: 0.88,
        envMapIntensity: 1.65,
      })
    );
    commitBucket(B.bSolidBox, this.geoUnitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.16 }));
    commitBucket(B.bRoof, this.geoRoofPyramid, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.05 }));
    commitBucket(B.bCylinder, this.geoCylinder, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.58, metalness: 0.24 }));
    commitBucket(B.bTreeTrunk, this.geoCylinder, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96 }));

    // Alpha-Tested Photorealistic Botanical Broadleaf & Conifer Spruce Foliage!
    const broadleafMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.foliageCardRGBA,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.0,
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.pineFrondRGBA,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0,
    });
    commitBucket(B.bBroadleaf, this.geoFoliage, broadleafMat);
    commitBucket(B.bBush, this.geoBush, broadleafMat);
    commitBucket(B.bPine, this.geoPine, pineMat);
    commitBucket(
      B.bRock,
      this.geoRock,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.textures.rockAlbedo,
        normalMap: this.textures.rockNormal,
        normalScale: new THREE.Vector2(1.4, 1.4),
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.04,
      })
    );
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
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.38 }),
        this.rotorPositions.length * 3
      );
      this.rotorMesh.frustumCulled = false;
      this.dynamicGroup.add(this.rotorMesh);
    }

    this.overlays.rebuildPowerCables(state);
    this.overlays.rebuildUtilityOverlays(state, activeView, activeTool);
    this.overlays.rebuildProblemIcons(state, elev.sampleTerrainY);
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
    this.scene.environmentIntensity = desiredEnv === 'night' ? 0.48 : desiredEnv === 'sunset' ? 1.02 : 0.92;

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

    const sunCol = new THREE.Color(0xfff5df).lerp(new THREE.Color(0xf79452), sunset).lerp(new THREE.Color(0x4c6b9e), night);
    const skyTop = new THREE.Color(0x36669c).lerp(new THREE.Color(0x2a355c), sunset).lerp(new THREE.Color(0x050a17), night);
    const skyHor = new THREE.Color(0xd0e1ee).lerp(new THREE.Color(0xe69562), sunset * 0.85).lerp(new THREE.Color(0x111c32), night);

    this.sunLight.color.copy(sunCol);
    this.sunLight.intensity = Math.max(0.36, 2.35 * (1 - night * 0.8));
    this.fillLight.intensity = Math.max(0.22, 0.48 * (1 - night * 0.45));
    this.fillLight.color.setHex(0x9bc0e6).lerp(new THREE.Color(0x9b89c4), sunset * 0.5).lerp(new THREE.Color(0x1d356b), night * 0.7);
    this.hemiLight.intensity = Math.max(0.28, 0.68 * (1 - night * 0.55));
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
    this.waterUniforms.uWaterDeep.value.setHex(0x0f2c40).lerp(new THREE.Color(0x051120), night * 0.84);
    this.waterUniforms.uWaterShallow.value.setHex(0x285664).lerp(new THREE.Color(0x0b2134), night * 0.84);

    for (const m of this.nightMaterials) {
      m.emissiveIntensity = night * 1.55 + sunset * 0.48;
    }
    this.lampBulbMat.emissiveIntensity = 0.16 + night * 2.25 + sunset * 0.85;
    this.beaconMat.emissiveIntensity = 0.16 + night * 1.85 + sunset * 0.6;
    this.bloomPass.strength = 0.09 + sunset * 0.16 + night * 0.42;
    this.bloomPass.threshold = 0.9 - night * 0.3;
    this.gradePass.uniforms.uNight.value = night;
    this.gradePass.uniforms.uSunset.value = sunset;
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
      const roadSurfY = this.elevField
        ? this.elevField.sampleRoadY(px, pz)
        : state.grid[y0]?.[x0]?.terrain === 'water'
          ? 0.24
          : Math.max(0.05, tileWorldY(state, x0, y0));
      const aheadY = this.elevField
        ? this.elevField.sampleRoadY(px + fx * 0.22, pz + fz * 0.22)
        : roadSurfY;
      const py = roadSurfY + 0.052 * sy;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(aheadY - roadSurfY, 0.22);

      // Chassis hugging sloped asphalt & bridge approach ramps
      this.dummy.rotation.order = 'YXZ';
      this.dummy.position.set(px, py, pz);
      this.dummy.rotation.set(pitch, yaw, 0);
      this.dummy.scale.set(sx, sy, sz);
      this.dummy.updateMatrix();
      this.vehicleMesh.setMatrixAt(vCount, this.dummy.matrix);
      this.tmpCol.setHex(colHex);
      this.vehicleMesh.setColorAt(vCount, this.tmpCol);

      // Tinted upper cabin
      this.dummy.position.set(px - fx * 0.02 * sz, py + 0.08 * sy, pz - fz * 0.02 * sz);
      this.dummy.rotation.set(pitch, yaw, 0);
      this.dummy.scale.set(sx * 0.92, sy * 0.95, sz * 0.85);
      this.dummy.updateMatrix();
      this.cabinMesh.setMatrixAt(vCount, this.dummy.matrix);
      vCount++;

      if (showLights && lightCount < 160) {
        const slopeDy = (aheadY - roadSurfY) * (0.2 * sz / 0.22);
        // Warm Headlights in front
        this.dummy.position.set(px + fx * 0.2 * sz, py + slopeDy, pz + fz * 0.2 * sz);
        this.dummy.rotation.set(pitch, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.headlightMesh.setMatrixAt(lightCount, this.dummy.matrix);

        // Glowing Red Taillights in back
        this.dummy.position.set(px - fx * 0.2 * sz, py - slopeDy, pz - fz * 0.2 * sz);
        this.dummy.rotation.set(pitch, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.taillightMesh.setMatrixAt(lightCount, this.dummy.matrix);
        lightCount++;
      }
      this.dummy.rotation.order = 'XYZ';
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

    this.gradePass.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
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

  public updateRouteInspector(
    state: CityState,
    rt: SimRuntime,
    selected: { x: number; y: number } | null
  ) {
    this.overlays.rebuildRouteInspector(state, rt.activeRoutes, selected, this.elevField?.sampleRoadY);
  }

  public refreshProblemIcons(state: CityState) {
    this.overlays.rebuildProblemIcons(state, this.elevField?.sampleTerrainY);
  }
}
