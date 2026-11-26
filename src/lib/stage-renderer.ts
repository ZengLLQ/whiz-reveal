import type * as ThreeModule from 'three';
import type { RoomEnvironment as RoomEnvironmentScene } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Snapshot } from './types';
import {
  DUST_PUSH_ATTACK, DUST_PUSH_REACH, DUST_PUSH_RELEASE,
  breathEnergyTarget, choreographySettled, createRevealTracker, damp, detectReveal, dollyCamera, drawProgress,
  dustPushTarget, energyTarget, frameBudget, frameHalfExtents, glowStrength, isPreRevealBreath, layoutTarget,
  pulseTarget, spinRate, sweepEnvelope, sweepPosition,
  type RevealTracker, type StageLayout, type StageMode,
} from './stage-motion';
import { stageLookFromSearch, type StageLook } from './stage-look';
import { clearingDepthBand, createDustField, DUST_CLEARING_FEATHER, DUST_DEPTH } from './stage-dust';
import { KNOT_RADIUS, KNOT_REACH, KNOT_RIPPLE, KNOT_TUBE, silhouetteRadius } from './sculpture-geometry';
import { isSoftwareRenderer, stagePixelRatio } from './stage-resolution';

export interface StagePointer { x: number; y: number; drag: number; dragging: boolean }

/** What the currently mounted stage asks the scene to show. Read on every frame. */
export interface StageInputs {
  mode: StageMode;
  occupied: boolean;
  snapshot?: Snapshot;
  reducedMotion: boolean;
  pointer: StagePointer;
}

type Three = typeof ThreeModule;
type RoomEnvironmentClass = typeof RoomEnvironmentScene;
type Uniform<T> = { value: T };

interface Dust {
  points: ThreeModule.Points;
  uniforms: {
    uDrift: Uniform<number>; uEnergy: Uniform<number>; uPush: Uniform<number>; uPixelScale: Uniform<number>;
    uParallax: Uniform<ThreeModule.Vector2>; uCenter: Uniform<ThreeModule.Vector2>; uClearing: Uniform<ThreeModule.Vector2>;
    uClearingDepth: Uniform<ThreeModule.Vector2>; uField: Uniform<ThreeModule.Vector3>; uEye: Uniform<ThreeModule.Vector3>;
    uDepth: Uniform<ThreeModule.Vector2>;
  };
}

interface Glow {
  mesh: ThreeModule.Mesh;
  uniforms: { uStrength: Uniform<number>; uPulse: Uniform<number> };
}

/** The `?stage=physical` comparison: a lit physical material instead of the palette shader. */
interface PhysicalLook {
  material: ThreeModule.MeshPhysicalMaterial;
  /** Environment maps live in render targets, which a lost context empties. */
  rebuildEnvironment: () => void;
}

interface Engine {
  renderer: ThreeModule.WebGLRenderer;
  /** True on a software renderer, which renders large canvases at a lower resolution (stage-resolution.ts). */
  software: boolean;
  camera: ThreeModule.PerspectiveCamera;
  scene: ThreeModule.Scene;
  sculpture: ThreeModule.Mesh;
  uniforms: Record<'uEnergy' | 'uPulse' | 'uSweep' | 'uTime', Uniform<number>>;
  look: StageLook;
  physical: PhysicalLook | null;
  dust: Dust;
  glow: Glow;
  tracker: RevealTracker | null;
  frame: number;
  /** Cadence anchor for the frame budget; may trail the real paint time by a few ms. */
  lastRender: number;
  /** Real time of the last paint, used for animation deltas. */
  lastPaint: number;
  force: boolean;
  lost: boolean;
  elapsed: number;
  spin: number;
  energy: number;
  /** Energy when the current pre-reveal breath began, or null outside a breath. */
  breathFrom: number | null;
  pulse: number;
  /** Outward push of the dust after a reveal, 0..1. */
  push: number;
  /** Integrated dust time; it runs faster with energy without ever jumping. */
  drift: number;
  /** Damped pointer for the dust parallax. */
  parallax: { x: number; y: number };
  revealAt: number;
  layout: StageLayout | null;
  /** Resting camera distance. Layout is measured here, never at the dollied distance. */
  baseDistance: number;
}

interface Owner {
  container: HTMLElement;
  read: () => StageInputs;
  onReady: (ready: boolean) => void;
  visible: boolean;
  release: () => void;
}

const FIELD_OF_VIEW = 34;
const HALF_FOV_TAN = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
const REST_DISTANCE = 7.7;
/**
 * The light pool sits behind the sculpture. Its radius, at the sculpture's plane
 * and scale 1, is about 1.5 times the knot's reach. The falloff reaches zero at
 * that rim, where it would add less than one 8-bit level anyway, so the disc
 * covers only pixels the pool visibly lights.
 */
const GLOW_Z = -1.8;
const GLOW_RADIUS = 2.9;
const GLOW_SEGMENTS = 64;
const GLOW_RINGS = 12;
/** The physical look's reflection strength at rest, and how much full energy adds to it. */
const PHYSICAL_REFLECTION_REST = 0.8;
const PHYSICAL_REFLECTION_ENERGY = 0.45;

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
let owner: Owner | null = null;

/** True once this window's renderer exists, so a remounted stage can skip its fallback. */
export function isStageReady(): boolean {
  return !!engine && !engine.lost;
}

/** The sculpture material this window renders, once its engine exists. */
export function stageLook(): StageLook | null {
  return engine?.look ?? null;
}

/**
 * Shows the shared sculpture inside `container`. Each window keeps one WebGL
 * context for its whole life, so moving from the welcome screen to the
 * controller reuses the compiled scene instead of flashing the CSS fallback.
 * The most recently mounted stage owns the canvas. Returns a release function.
 */
export function acquireStage(container: HTMLElement, read: () => StageInputs, onReady: (ready: boolean) => void): () => void {
  let released = false;
  let attached: Owner | null = null;
  void load(read().mode).then((loaded) => {
    if (released) return;
    if (!loaded) { onReady(false); return; }
    attached = attach(loaded, container, read, onReady);
  });
  return () => {
    released = true;
    attached?.release();
  };
}

/** Requests a frame now, for example after a stage changes mode or a draw starts. */
export function invalidateStage(): void {
  if (!engine) return;
  engine.force = true;
  schedule(engine);
}

function load(mode: StageMode): Promise<Engine | null> {
  loading ??= (async () => {
    // The look is read once, when the window's only engine is created.
    const look = stageLookFromSearch(window.location.search);
    const [THREE, room] = await Promise.all([
      import('three'),
      // The comparison look loads its environment generator on demand; the default bundle never does.
      look === 'physical'
        ? import('three/examples/jsm/environments/RoomEnvironment.js').then((module) => module.RoomEnvironment, () => null)
        : Promise.resolve(null),
    ]);
    engine = createEngine(THREE, mode, room);
    return engine;
  })().catch(() => null);
  return loading;
}

/** True when WebGL renders on the CPU (some virtual machines, remote sessions, blocklisted drivers). */
function rendersInSoftware(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return isSoftwareRenderer(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null);
}

function createEngine(THREE: Three, mode: StageMode, RoomEnvironment: RoomEnvironmentClass | null): Engine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  const software = rendersInSoftware(renderer.getContext());
  renderer.setPixelRatio(stagePixelRatio(0, 0, window.devicePixelRatio, software));
  renderer.setClearColor('#0B0D10', 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 30);
  camera.position.z = REST_DISTANCE;
  const palette = {
    ink: { value: new THREE.Vector3(11 / 255, 13 / 255, 16 / 255) },
    panel: { value: new THREE.Vector3(23 / 255, 28 / 255, 34 / 255) },
    edge: { value: new THREE.Vector3(42 / 255, 51 / 255, 61 / 255) },
    muted: { value: new THREE.Vector3(93 / 255, 111 / 255, 130 / 255) },
    paper: { value: new THREE.Vector3(231 / 255, 238 / 255, 245 / 255) },
  };

  // If the comparison look cannot be built, the window keeps the palette shader rather than losing WebGL.
  const physical = RoomEnvironment ? createPhysicalLook(THREE, renderer, RoomEnvironment) : null;
  // The audience display can span a 4K screen, and a clear coat shows every facet; both get more segments.
  const [tubular, radial] = mode === 'presentation' || physical ? [256, 32] : [160, 24];
  const geometry = new THREE.TorusKnotGeometry(KNOT_RADIUS, KNOT_TUBE, tubular, radial, 2, 3);
  const uniforms = {
    uEnergy: { value: 0 },
    uPulse: { value: 0 },
    uSweep: { value: -1 },
    uTime: { value: 0 },
  };
  const material = physical?.material ?? new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...palette },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const sculpture = new THREE.Mesh(geometry, material);
  sculpture.rotation.set(0.4, -0.35, -0.35);

  const glow = createGlow(THREE, palette);
  const dust = createDust(THREE);
  scene.add(glow.mesh, sculpture, dust.points);

  const created: Engine = {
    renderer, software, camera, scene, sculpture, uniforms, look: physical ? 'physical' : 'shader', physical, dust, glow,
    tracker: null, frame: 0, lastRender: 0, lastPaint: 0, force: true, lost: false,
    elapsed: 0, spin: 0, energy: 0, breathFrom: null, pulse: 0, push: 0, drift: 0, parallax: { x: 0, y: 0 },
    revealAt: -Infinity, layout: null, baseDistance: REST_DISTANCE,
  };

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    created.lost = true;
    cancelAnimationFrame(created.frame);
    created.frame = 0;
    owner?.onReady(false);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    created.lost = false;
    try {
      created.physical?.rebuildEnvironment();
    } catch {
      // The comparison look renders unlit by its environment rather than failing the restore.
    }
    owner?.onReady(true);
    invalidateStage();
  });
  document.addEventListener('visibilitychange', invalidateStage);
  return created;
}

/** A soft pool of palette light behind the sculpture, so the form sits in space rather than floating. */
function createGlow(THREE: Three, palette: Record<'edge' | 'muted' | 'paper', Uniform<ThreeModule.Vector3>>): Glow {
  const uniforms = { uStrength: { value: 0 }, uPulse: { value: 0 } };
  // The pool is the first thing drawn onto a canvas cleared to transparent black, so it can
  // simply write its premultiplied colour: an opaque-pass material gets no blending, which
  // spares every covered pixel a framebuffer read, and it needs no depth test. The sculpture
  // then overwrites it, and the dust blends over both; the canvas composites correctly over any panel.
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, edge: palette.edge, muted: palette.muted, paper: palette.paper },
    vertexShader: GLOW_VERTEX_SHADER,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  // A disc, not a square: the pool is round, so a quad's corners would only shade transparent pixels.
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0, 1, GLOW_SEGMENTS, GLOW_RINGS), material);
  mesh.position.z = GLOW_Z;
  // Opaque objects draw in render order: the pool goes first, before the sculpture.
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** Ambient dust: one THREE.Points layer, positioned entirely in its vertex shader. */
function createDust(THREE: Three): Dust {
  const field = createDustField();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(field.alphas, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(field.phases, 1));
  const uniforms = {
    uDrift: { value: 0 },
    uEnergy: { value: 0 },
    uPush: { value: 0 },
    uPixelScale: { value: 1 },
    uParallax: { value: new THREE.Vector2() },
    uCenter: { value: new THREE.Vector2() },
    uClearing: { value: new THREE.Vector2(KNOT_REACH, KNOT_REACH + DUST_CLEARING_FEATHER) },
    uClearingDepth: { value: new THREE.Vector2(clearingDepthBand(1).from, clearingDepthBand(1).to) },
    uField: { value: new THREE.Vector3(1, 1, REST_DISTANCE) },
    uEye: { value: new THREE.Vector3(0, 0, REST_DISTANCE) },
    uDepth: { value: new THREE.Vector2(DUST_DEPTH.back, DUST_DEPTH.front) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
  });
  const points = new THREE.Points(geometry, material);
  // The shader places every speck, so the geometry's own bounds mean nothing to culling.
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, uniforms };
}

/**
 * Clear-coated physical material lit by Three's procedural RoomEnvironment,
 * prefiltered locally with PMREM: no HDR download. Tinted from the palette.
 * Returns null if any of it fails, so the window falls back to the palette shader.
 */
function createPhysicalLook(THREE: Three, renderer: ThreeModule.WebGLRenderer, RoomEnvironment: RoomEnvironmentClass): PhysicalLook | null {
  let room: RoomEnvironmentScene | null = null;
  let material: ThreeModule.MeshPhysicalMaterial | null = null;
  try {
    // An Edge-toned body keeps the form in the palette's dark range; the clear coat's
    // Primary-tinted highlights carry its shape, as the shader's ramp does.
    const physical = new THREE.MeshPhysicalMaterial({
      color: '#2A333D',
      roughness: 0.25,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      specularColor: new THREE.Color('#E7EEF5'),
      emissive: new THREE.Color('#E7EEF5'),
      emissiveIntensity: 0,
      envMapIntensity: PHYSICAL_REFLECTION_REST,
    });
    material = physical;
    const scene = new RoomEnvironment();
    room = scene;
    let target: ThreeModule.WebGLRenderTarget | null = null;
    const rebuildEnvironment = () => {
      const generator = new THREE.PMREMGenerator(renderer);
      try {
        const next = generator.fromScene(scene, 0.04);
        target?.dispose();
        target = next;
        // On the material, not scene.environment: three applies envMapIntensity only to a
        // material's own map, and the energy cue drives that intensity.
        physical.envMap = next.texture;
        physical.needsUpdate = true;
      } finally {
        generator.dispose();
      }
    };
    rebuildEnvironment();
    return { material: physical, rebuildEnvironment };
  } catch {
    room?.dispose();
    material?.dispose();
    return null;
  }
}

function attach(current: Engine, container: HTMLElement, read: () => StageInputs, onReady: (ready: boolean) => void): Owner {
  owner?.release();
  const resize = new ResizeObserver(() => fit(current, container));
  const visibility = new IntersectionObserver(([entry]) => {
    next.visible = entry.isIntersecting;
    invalidateStage();
  });
  const next: Owner = {
    container, read, onReady, visible: true,
    release: () => {
      resize.disconnect();
      visibility.disconnect();
      if (owner !== next) return;
      owner = null;
      cancelAnimationFrame(current.frame);
      current.frame = 0;
      current.renderer.domElement.remove();
    },
  };
  owner = next;
  current.tracker ??= createRevealTracker(read().snapshot);
  container.appendChild(current.renderer.domElement);
  resize.observe(container);
  visibility.observe(container);
  fit(current, container);
  onReady(!current.lost);
  return next;
}

/** Matches the drawing buffer to the container and paints immediately, avoiding a stretched frame. */
function fit(current: Engine, container: HTMLElement): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;
  const { camera, renderer, dust } = current;
  // Also picks up a new device pixel ratio when the window moves to another screen.
  const pixelRatio = stagePixelRatio(width, height, window.devicePixelRatio, current.software);
  if (pixelRatio !== renderer.getPixelRatio()) renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  current.baseDistance = camera.aspect < 1 ? REST_DISTANCE / camera.aspect : REST_DISTANCE;
  // The camera always looks straight down -z; only its position dollies (see step).
  const eye = dollyCamera(current.baseDistance, current.layout ?? { x: 0, y: 0 }, current.energy);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.updateProjectionMatrix();
  const { halfWidth, halfHeight } = frameHalfExtents(current.baseDistance, camera.aspect, FIELD_OF_VIEW);
  dust.uniforms.uField.value.set(halfWidth, halfHeight, current.baseDistance);
  // Pixels per world unit at distance 1, so speck sizes attenuate with depth like real geometry.
  dust.uniforms.uPixelScale.value = renderer.domElement.height / (2 * HALF_FOV_TAN);
  current.force = true;
  cancelAnimationFrame(current.frame);
  current.frame = 0;
  tick(current, performance.now());
}

function schedule(current: Engine): void {
  if (!current.frame) current.frame = requestAnimationFrame((time) => tick(current, time));
}

function tick(current: Engine, time: number): void {
  current.frame = 0;
  const active = owner;
  if (!active || current.lost || document.hidden || !active.visible) return;
  const inputs = active.read();
  // Hold back frames until the budget has elapsed: 30 fps at rest, 60 fps while moving.
  const budget = frameBudget(isAnimating(current, inputs));
  const sinceRender = time - current.lastRender;
  if (!current.force && current.lastRender && sinceRender < budget - 1.5) {
    if (!inputs.reducedMotion) schedule(current);
    return;
  }
  // Carry the overshoot forward so a 100 or 144 Hz display still averages the budget.
  current.lastRender = current.lastRender ? time - Math.min(Math.max(sinceRender - budget, 0), budget / 2) : time;
  const delta = current.lastPaint ? Math.min((time - current.lastPaint) / 1000, 0.1) : 1 / 60;
  current.lastPaint = time;
  current.force = false;
  step(current, inputs, time, delta);
  current.renderer.render(current.scene, current.camera);
  if (!inputs.reducedMotion) schedule(current);
}

function isAnimating(current: Engine, inputs: StageInputs): boolean {
  if (inputs.reducedMotion) return false;
  if (inputs.pointer.dragging || inputs.snapshot?.activeDraw) return true;
  const { energy, pulse, push } = current;
  if (!choreographySettled({ energy, pulse, push, sweep: current.uniforms.uSweep.value })) return true;
  const target = targetFor(current, inputs);
  const layout = current.layout;
  return !layout || Math.abs(layout.x - target.x) + Math.abs(layout.y - target.y) + Math.abs(layout.scale - target.scale) > 0.004;
}

function targetFor(current: Engine, inputs: StageInputs): StageLayout {
  const { halfWidth, halfHeight } = frameHalfExtents(current.baseDistance, current.camera.aspect, FIELD_OF_VIEW);
  return layoutTarget(inputs.mode, inputs.occupied, halfWidth, halfHeight);
}

function step(current: Engine, inputs: StageInputs, time: number, delta: number): void {
  const { sculpture, uniforms, camera, glow, dust } = current;
  const { pointer } = inputs;
  const target = targetFor(current, inputs);
  const revealed = current.tracker ? detectReveal(current.tracker, inputs.snapshot) : false;

  if (inputs.reducedMotion) {
    // Reduced motion: no suspense, sweep, dolly, drift or parallax, and layout changes land without travel.
    current.energy = 0;
    current.breathFrom = null;
    current.pulse = 0;
    current.push = 0;
    current.parallax = { x: 0, y: 0 };
    uniforms.uSweep.value = -1;
    current.layout = { ...target };
  } else {
    if (revealed) current.revealAt = time;
    const since = time - current.revealAt;
    const now = Date.now();
    const drawing = !!inputs.snapshot?.activeDraw;
    // The score's silent breath before the reveal: the stage exhales and its spin holds.
    const breathing = isPreRevealBreath(inputs.snapshot, now);
    current.breathFrom = breathing ? current.breathFrom ?? current.energy : null;
    const energy = current.breathFrom !== null
      ? breathEnergyTarget(current.breathFrom)
      : energyTarget(drawing, drawProgress(inputs.snapshot, now));
    // The breath lasts at most 240 ms, so it eases faster than the build-up.
    current.energy = damp(current.energy, energy, breathing ? 7 : 2.2, delta);
    const pulse = pulseTarget(since);
    // Fast attack, slow release: bright at the reveal, then a long, quiet fade.
    current.pulse = damp(current.pulse, pulse, pulse > current.pulse ? 18 : 2.6, delta);
    const push = dustPushTarget(since);
    // A soft attack and a long release: the dust breathes out, never pops. The reveal frame
    // is the busiest one (the tiles mount), so a long frame advances the push by at most 1/30 s.
    current.push = damp(current.push, push, push > current.push ? DUST_PUSH_ATTACK : DUST_PUSH_RELEASE, Math.min(delta, 1 / 30));
    uniforms.uSweep.value = sweepPosition(since);

    current.elapsed += delta;
    // The spin only builds while the draw builds; from the breath on it holds, through the reveal.
    current.spin += delta * spinRate(current.energy, drawing && !breathing);
    current.drift += delta * (1 + current.energy * 1.6);
    current.parallax = {
      x: damp(current.parallax.x, pointer.x, 2.4, delta),
      y: damp(current.parallax.y, pointer.y, 2.4, delta),
    };
    const follow = 1 - Math.exp(-3.4 * delta);
    sculpture.rotation.x += (0.4 + pointer.y * 0.45 - sculpture.rotation.x) * follow;
    sculpture.rotation.y += (-0.35 + Math.sin(current.elapsed * 0.22) * 0.35 + pointer.x * 0.75 + pointer.drag + current.spin - sculpture.rotation.y) * follow;
    sculpture.rotation.z = -0.35 + Math.sin(current.elapsed * 0.18) * 0.08;

    const layout = current.layout ?? { ...target };
    current.layout = {
      x: damp(layout.x, target.x, 3, delta),
      y: damp(layout.y, target.y, 3, delta),
      scale: damp(layout.scale, target.scale, 3, delta),
    };
  }

  const layout = current.layout!;
  // The dolly moves the camera toward the sculpture, so the form grows without leaving its place on screen.
  const eye = dollyCamera(current.baseDistance, layout, current.energy);
  camera.position.set(eye.x, eye.y, eye.z);
  const bob = inputs.reducedMotion ? 0 : Math.sin(current.elapsed * 0.6) * 0.055;
  sculpture.position.set(layout.x, layout.y + bob, 0);
  sculpture.scale.setScalar(layout.scale);
  uniforms.uEnergy.value = current.energy;
  uniforms.uPulse.value = current.pulse;
  uniforms.uTime.value = current.elapsed;

  // Keep the light pool centred behind the sculpture, at the same apparent size, as the camera sees it.
  const toGlow = (eye.z - GLOW_Z) / eye.z;
  glow.mesh.position.set(eye.x + (layout.x - eye.x) * toGlow, eye.y + (layout.y - eye.y) * toGlow, GLOW_Z);
  glow.mesh.scale.setScalar(GLOW_RADIUS * layout.scale * toGlow);
  glow.uniforms.uStrength.value = glowStrength(current.energy, current.pulse);
  glow.uniforms.uPulse.value = current.pulse;

  dust.uniforms.uDrift.value = current.drift;
  dust.uniforms.uEnergy.value = current.energy;
  dust.uniforms.uPush.value = current.push * DUST_PUSH_REACH;
  dust.uniforms.uParallax.value.set(current.parallax.x, current.parallax.y);
  dust.uniforms.uCenter.value.set(layout.x, layout.y);
  dust.uniforms.uEye.value.set(eye.x, eye.y, eye.z);
  // Front specks clear the knot's outline as this camera sees it, then fade back in.
  const outline = silhouetteRadius(KNOT_REACH * layout.scale, eye.z);
  dust.uniforms.uClearing.value.set(outline, outline + DUST_CLEARING_FEATHER * layout.scale);
  const band = clearingDepthBand(layout.scale);
  dust.uniforms.uClearingDepth.value.set(band.from, band.to);

  if (current.physical) {
    // The physical look cannot draw the travelling band or the ripple: energy strengthens its
    // reflections, and the reveal lifts its emissive light.
    const { material } = current.physical;
    material.envMapIntensity = PHYSICAL_REFLECTION_REST + PHYSICAL_REFLECTION_ENERGY * current.energy;
    material.emissiveIntensity = 0.03 * current.energy + 0.2 * current.pulse + 0.28 * sweepEnvelope(uniforms.uSweep.value);
  }
}

const VERTEX_SHADER = /* glsl */ `
uniform float uEnergy;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

void main() {
  // While a draw builds, the tube surface breathes with a slow interference ripple.
  float ripple = sin(position.x * 3.1 + uTime * 2.3) * sin(position.y * 2.7 - uTime * 1.9) * sin(position.z * 2.3 + uTime * 1.6);
  vec3 displaced = position + normal * ripple * ${KNOT_RIPPLE.toFixed(3)} * uEnergy;
  vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-viewPosition.xyz);
  vLocal = position;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 ink;
uniform vec3 panel;
uniform vec3 edge;
uniform vec3 muted;
uniform vec3 paper;
uniform float uEnergy;
uniform float uPulse;
uniform float uSweep;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(vView);
  vec3 light = normalize(vec3(-0.7, 1.0, 1.2));
  float diffuse = dot(normal, light) * 0.5 + 0.5;
  float rim = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
  float gloss = pow(max(dot(reflect(-light, normal), view), 0.0), 30.0);

  // Five-token ramp: the form is shaded only with the interface palette.
  vec3 color = mix(ink, panel, smoothstep(0.0, 0.3, diffuse));
  color = mix(color, edge, smoothstep(0.25, 0.6, diffuse));
  color = mix(color, muted, smoothstep(0.5, 0.88, diffuse));
  color = mix(color, paper, smoothstep(0.87, 1.0, diffuse) * 0.8);

  // Suspense: the silhouette catches more light as the reveal approaches.
  color = mix(color, paper, min(0.9, gloss * 0.7 + rim * (0.3 + 0.5 * uEnergy)));

  // Reveal: one band of light travels across the form, then the form settles.
  float along = dot(vLocal, normalize(vec3(0.9, 0.55, 0.35)));
  float band = (1.0 - smoothstep(0.0, 0.42, abs(along - mix(-2.6, 2.6, uSweep)))) * step(0.0, uSweep);
  color = mix(color, paper, min(0.85, band * 0.7 + uPulse * 0.16 * diffuse));

  gl_FragColor = vec4(color, 1.0);
}
`;

// The pool covers much of the frame, so it is shaded per vertex on concentric rings
// and every pixel only interpolates the result. Its falloff and colour are smooth
// enough that the rings never show.
const GLOW_VERTEX_SHADER = /* glsl */ `
uniform vec3 edge;
uniform vec3 muted;
uniform vec3 paper;
uniform float uStrength;
uniform float uPulse;
varying vec4 vLight;

void main() {
  // A soft falloff that reaches exactly zero, with a flat slope, at the disc's rim:
  // the canvas stays transparent around it and no rim or band shows.
  float inside = max(1.0 - dot(position.xy, position.xy), 0.0);
  float falloff = inside * sqrt(inside);
  // Muted light that cools to Edge toward the rim; the reveal warms the heart toward Primary.
  vec3 color = mix(edge, muted, inside);
  color = mix(color, paper, uPulse * 0.35 * falloff * falloff);
  float alpha = falloff * uStrength;
  vLight = vec4(color * alpha, alpha);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
varying vec4 vLight;

void main() {
  // A whisper of interleaved-gradient noise keeps the dim gradient from banding on 8-bit displays.
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor = vLight + vec4(noise / 255.0);
}
`;

const DUST_VERTEX_SHADER = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
uniform float uDrift;
uniform float uEnergy;
uniform float uPush;
uniform float uPixelScale;
uniform vec2 uParallax;
uniform vec2 uCenter;
uniform vec2 uClearing;
uniform vec2 uClearingDepth;
uniform vec3 uField;
uniform vec3 uEye;
uniform vec2 uDepth;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float z = mix(uDepth.x, uDepth.y, position.z * 0.5 + 0.5);
  // Spread each layer to the frustum at its own depth, so the field fills the frame at any aspect.
  float spread = (uField.z - z) / uField.z * 1.06;
  vec3 p = vec3(position.xy * uField.xy * spread, z);
  float phase = aPhase * 6.2832;
  p += vec3(sin(uDrift * 0.21 + phase), cos(uDrift * 0.17 + phase * 1.7), 0.5 * sin(uDrift * 0.13 + phase * 2.3)) * 0.16;
  // Where the camera's line of sight to the sculpture's centre crosses this speck's depth.
  float depthShare = (uEye.z - p.z) / uEye.z;
  vec2 center = uEye.xy + (uCenter - uEye.xy) * depthShare;
  // At the reveal, specks around the sculpture as seen drift outward from it, then settle back.
  vec2 away = p.xy - center;
  float reach = length(away);
  p.xy += away / max(reach, 0.001) * uPush * exp(-reach * reach * 0.06);
  // Parallax: nearer specks travel further against the pointer.
  p.xy -= vec2(uParallax.x, -uParallax.y) * (z - uDepth.x) * 0.12;
  // Specks that could sit in front of the form clear its outline: a dark speck over the lit
  // surface would read as a blemish. Specks behind it are hidden by depth anyway; the
  // clearing fades in over a depth band that follows the form's scale (clearingDepthBand).
  vec2 seen = uEye.xy + (p.xy - uEye.xy) / ((uEye.z - p.z) / uEye.z) - uCenter;
  float clearing = mix(1.0, smoothstep(uClearing.x, uClearing.y, length(seen)), smoothstep(uClearingDepth.x, uClearingDepth.y, p.z));
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, aSize * uPixelScale / -view.z);
  gl_Position = projectionMatrix * view;
  vColor = aColor;
  vAlpha = aAlpha * (0.7 + 0.45 * uEnergy) * clearing;
}
`;

const DUST_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = (1.0 - smoothstep(0.15, 1.0, d)) * vAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;
