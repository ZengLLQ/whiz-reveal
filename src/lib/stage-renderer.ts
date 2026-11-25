import type * as ThreeModule from 'three';
import type { Snapshot } from './types';
import {
  createRevealTracker, damp, detectReveal, drawProgress, energyTarget, frameBudget,
  layoutTarget, pulseTarget, sweepPosition, type RevealTracker, type StageLayout, type StageMode,
} from './stage-motion';

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

interface Engine {
  renderer: ThreeModule.WebGLRenderer;
  camera: ThreeModule.PerspectiveCamera;
  scene: ThreeModule.Scene;
  sculpture: ThreeModule.Mesh;
  uniforms: Record<'uEnergy' | 'uPulse' | 'uSweep' | 'uTime', { value: number }>;
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
  pulse: number;
  revealAt: number;
  layout: StageLayout | null;
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

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
let owner: Owner | null = null;

/** True once this window's renderer exists, so a remounted stage can skip its fallback. */
export function isStageReady(): boolean {
  return !!engine && !engine.lost;
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
  loading ??= import('three')
    .then((THREE) => (engine = createEngine(THREE, mode)))
    .catch(() => null);
  return loading;
}

function createEngine(THREE: Three, mode: StageMode): Engine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor('#0B0D10', 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 30);
  // The audience display can span a 4K screen; give its silhouette more segments.
  const [tubular, radial] = mode === 'presentation' ? [256, 32] : [160, 24];
  const geometry = new THREE.TorusKnotGeometry(1.05, 0.35, tubular, radial, 2, 3);
  const uniforms = {
    uEnergy: { value: 0 },
    uPulse: { value: 0 },
    uSweep: { value: -1 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      ink: { value: new THREE.Vector3(11 / 255, 13 / 255, 16 / 255) },
      panel: { value: new THREE.Vector3(23 / 255, 28 / 255, 34 / 255) },
      edge: { value: new THREE.Vector3(42 / 255, 51 / 255, 61 / 255) },
      muted: { value: new THREE.Vector3(93 / 255, 111 / 255, 130 / 255) },
      paper: { value: new THREE.Vector3(231 / 255, 238 / 255, 245 / 255) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const sculpture = new THREE.Mesh(geometry, material);
  sculpture.rotation.set(0.4, -0.35, -0.35);
  scene.add(sculpture);

  const created: Engine = {
    renderer, camera, scene, sculpture, uniforms,
    tracker: null, frame: 0, lastRender: 0, lastPaint: 0, force: true, lost: false,
    elapsed: 0, spin: 0, energy: 0, pulse: 0, revealAt: -Infinity, layout: null,
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
    owner?.onReady(true);
    invalidateStage();
  });
  document.addEventListener('visibilitychange', invalidateStage);
  return created;
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
  current.renderer.setSize(width, height, false);
  current.camera.aspect = width / height;
  current.camera.position.z = current.camera.aspect < 1 ? 7.7 / current.camera.aspect : 7.7;
  current.camera.updateProjectionMatrix();
  current.camera.lookAt(0, 0, 0);
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
  if (current.energy > 0.01 || current.pulse > 0.01 || current.uniforms.uSweep.value >= 0) return true;
  const target = targetFor(current, inputs);
  const layout = current.layout;
  return !layout || Math.abs(layout.x - target.x) + Math.abs(layout.y - target.y) + Math.abs(layout.scale - target.scale) > 0.004;
}

function targetFor(current: Engine, inputs: StageInputs): StageLayout {
  const halfHeight = HALF_FOV_TAN * current.camera.position.z;
  return layoutTarget(inputs.mode, inputs.occupied, halfHeight * current.camera.aspect, halfHeight);
}

function step(current: Engine, inputs: StageInputs, time: number, delta: number): void {
  const { sculpture, uniforms } = current;
  const { pointer } = inputs;
  const target = targetFor(current, inputs);
  const revealed = current.tracker ? detectReveal(current.tracker, inputs.snapshot) : false;

  if (inputs.reducedMotion) {
    // Reduced motion: no suspense, no sweep, and layout changes land without travel.
    current.energy = 0;
    current.pulse = 0;
    uniforms.uSweep.value = -1;
    current.layout = { ...target };
  } else {
    if (revealed) current.revealAt = time;
    const since = time - current.revealAt;
    const progress = drawProgress(inputs.snapshot, Date.now());
    current.energy = damp(current.energy, energyTarget(!!inputs.snapshot?.activeDraw, progress), 2.2, delta);
    const pulse = pulseTarget(since);
    // Fast attack, slow release: bright at the reveal, then a long, quiet fade.
    current.pulse = damp(current.pulse, pulse, pulse > current.pulse ? 18 : 2.6, delta);
    uniforms.uSweep.value = sweepPosition(since);

    current.elapsed += delta;
    current.spin += delta * current.energy * 1.4;
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
  const bob = inputs.reducedMotion ? 0 : Math.sin(current.elapsed * 0.6) * 0.055;
  sculpture.position.set(layout.x, layout.y + bob, 0);
  sculpture.scale.setScalar(layout.scale);
  uniforms.uEnergy.value = current.energy;
  uniforms.uPulse.value = current.pulse;
  uniforms.uTime.value = current.elapsed;
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
  vec3 displaced = position + normal * ripple * 0.05 * uEnergy;
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
