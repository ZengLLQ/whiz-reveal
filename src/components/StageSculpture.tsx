import { useEffect, useRef, useState, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Snapshot } from '../lib/types';

type Pointer = RefObject<{ x: number; y: number; drag: number }>;

// Continuous rotation state across instances so angle never snaps or hitches.
let sharedElapsed = 0;
let sharedRotX = 0.4;
let sharedRotY = -0.35;
let sharedRotZ = -0.35;

/** A compact, offline shader sculpture. It uses no model downloads or texture assets. */
export function StageSculpture({ pointer, welcome = false }: {
  pointer: Pointer; snapshot?: Snapshot; welcome?: boolean; entering?: boolean; presentation?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setReady(false);
    void import('three').then((THREE) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor('#0B0D10', 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
      const geometry = new THREE.TorusKnotGeometry(1.05, 0.35, 160, 24, 2, 3);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ink: { value: new THREE.Vector3(11 / 255, 13 / 255, 16 / 255) },
          panel: { value: new THREE.Vector3(23 / 255, 28 / 255, 34 / 255) },
          edge: { value: new THREE.Vector3(42 / 255, 51 / 255, 61 / 255) },
          muted: { value: new THREE.Vector3(93 / 255, 111 / 255, 130 / 255) },
          paper: { value: new THREE.Vector3(231 / 255, 238 / 255, 245 / 255) },
        },
        vertexShader: `varying vec3 surfaceNormal; varying vec3 viewDirection; void main(){ vec4 viewPosition=modelViewMatrix*vec4(position,1.0); surfaceNormal=normalize(normalMatrix*normal); viewDirection=normalize(-viewPosition.xyz); gl_Position=projectionMatrix*viewPosition; }`,
        fragmentShader: `uniform vec3 ink,panel,edge,muted,paper; varying vec3 surfaceNormal; varying vec3 viewDirection; void main(){ vec3 normal=normalize(surfaceNormal); vec3 view=normalize(viewDirection); vec3 light=normalize(vec3(-0.7,1.0,1.2)); float diffuse=dot(normal,light)*0.5+0.5; float rim=pow(1.0-max(dot(normal,view),0.0),3.0); float gloss=pow(max(dot(reflect(-light,normal),view),0.0),30.0); vec3 color=mix(ink,panel,smoothstep(0.0,0.3,diffuse)); color=mix(color,edge,smoothstep(0.25,0.6,diffuse)); color=mix(color,muted,smoothstep(0.5,0.88,diffuse)); color=mix(color,paper,smoothstep(0.87,1.0,diffuse)*0.8); color=mix(color,paper,min(0.85,gloss*0.7+rim*0.3)); gl_FragColor=vec4(color,1.0); }`,
      });
      const sculpture = new THREE.Mesh(geometry, material);
      sculpture.rotation.set(sharedRotX, sharedRotY, sharedRotZ);
      scene.add(sculpture);
      container.appendChild(renderer.domElement);

      let frame = 0, previous = 0, elapsed = sharedElapsed, visible = true, lost = false;

      function render(time: number) {
        frame = 0;
        if (disposed || lost || !visible || document.hidden) return;
        const delta = Math.min((time - previous || 16) / 1000, 0.05);
        previous = time;

        if (!reducedMotion) {
          elapsed += delta;
          sharedElapsed = elapsed;
          sculpture.rotation.x += (0.4 + pointer.current.y * 0.45 - sculpture.rotation.x) * 0.055;
          sculpture.rotation.y += (-0.35 + Math.sin(elapsed * 0.22) * 0.35 + pointer.current.x * 0.75 + pointer.current.drag - sculpture.rotation.y) * 0.055;
          sculpture.rotation.z = -0.35 + Math.sin(elapsed * 0.18) * 0.08;
          sculpture.position.y = Math.sin(elapsed * 0.6) * 0.055;
          sharedRotX = sculpture.rotation.x;
          sharedRotY = sculpture.rotation.y;
          sharedRotZ = sculpture.rotation.z;
        }

        // On desktop welcome screen, sit gently in hero area on right.
        sculpture.position.x = welcome ? (camera.aspect > 1 ? 0.85 : 0) : 0;
        sculpture.scale.setScalar(1);
        camera.position.z = camera.aspect < 1 ? 7.7 / camera.aspect : 7.7;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (!reducedMotion) frame = requestAnimationFrame(render);
      }

      function resume() {
        cancelAnimationFrame(frame);
        previous = 0;
        frame = requestAnimationFrame(render);
      }

      const resize = new ResizeObserver(() => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        resume();
      });
      const visibility = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        resume();
      });
      const onLost = (event: Event) => {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frame);
        setReady(false);
      };
      const onRestored = () => {
        lost = false;
        setReady(true);
        resume();
      };

      renderer.domElement.addEventListener('webglcontextlost', onLost);
      renderer.domElement.addEventListener('webglcontextrestored', onRestored);
      document.addEventListener('visibilitychange', resume);
      resize.observe(container);
      visibility.observe(container);
      setReady(true);
      resume();

      cleanup = () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        visibility.disconnect();
        document.removeEventListener('visibilitychange', resume);
        renderer.domElement.removeEventListener('webglcontextlost', onLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    }).catch(() => {
      if (!disposed) setReady(false);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [pointer, reducedMotion, welcome]);

  return (
    <div className={`stage-sculpture ${ready ? 'sculpture-ready' : ''}`} aria-hidden="true" data-scene-source="shader">
      <div className="sculpture-fallback"><i /><i /><i /></div>
      <div className="sculpture-webgl" ref={host} />
    </div>
  );
}
