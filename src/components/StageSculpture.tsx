import { useEffect, useRef, useState, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Snapshot } from '../lib/types';

type Pointer = RefObject<{ x: number; y: number; drag: number }>;
export function StageSculpture({ pointer, snapshot, welcome = false, entering = false, presentation = false }: {
  pointer: Pointer; snapshot?: Snapshot; welcome?: boolean; entering?: boolean; presentation?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState('fallback');
  const state = useRef({ snapshot, entering }); state.current = { snapshot, entering };
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    const abort = new AbortController();
    let cleanup = () => {};
    setReady(false);
    void Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')]).then(async ([T, { GLTFLoader }]) => {
      if (disposed) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor('#0B0D10', 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      container.appendChild(renderer.domElement);
      const scene = new T.Scene();
      scene.fog = new T.FogExp2('#0B0D10', .022);
      const camera = new T.PerspectiveCamera(40, 1, .1, 70);
      const sculpture = new T.Group(); scene.add(sculpture);
      const ambient = new T.HemisphereLight('#E7EEF5', '#171C22', 2.4); scene.add(ambient);
      const key = new T.DirectionalLight('#E7EEF5', 5); key.position.set(-3, 5, 5); scene.add(key);
      const rim = new T.PointLight('#E7EEF5', 35, 18); rim.position.set(2, 2, -2); scene.add(rim);
      const fill = new T.DirectionalLight('#5D6F82', 3); fill.position.set(4, 1, 4); scene.add(fill);
      const disposeTree = (root: import('three').Object3D) => root.traverse(o => {
        if (o instanceof T.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }
      });
      const fallback = new T.Group(); sculpture.add(fallback);
      const metal = new T.MeshStandardMaterial({ color: '#5D6F82', metalness: .65, roughness: .28 });
      const pearl = new T.MeshStandardMaterial({ color: '#E7EEF5', emissive: '#5D6F82', emissiveIntensity: .5, metalness: .3, roughness: .3 });
      const shape = new T.Shape();
      const points = [[-1.5,1.3],[-.98,-1.3],[-.5,-1.3],[0,.18],[.5,-1.3],[.98,-1.3],[1.5,1.3],[1.02,1.3],[.7,-.5],[.22,.8],[-.22,.8],[-.7,-.5],[-1.02,1.3]];
      points.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
      const w = new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:3,steps:1}),metal);
      w.name = 'W_Monolith'; w.visible = !presentation; fallback.add(w);
      for(let i=0;i<2;i++) { const r = new T.Mesh(new T.TorusGeometry(2.1+i*.55,.018,10,96),pearl); r.name=i?'Orbit_Outer':'Orbit_Inner'; r.rotation.set(.25+i*.4,i*.4,0); fallback.add(r); }
      let rings: import('three').Object3D[] = fallback.children.filter(o=>o.name.startsWith('Orbit'));
      let ringRest = rings.map(r=>r.quaternion.clone());
      let frame = 0, previous = 0, elapsed = 0, visible = true, lost = false, lowQuality = false, slowFrames = 0;
      let oldActive: string | null = null, revealAt = -Infinity, entranceAt = -1;
      let previousSession = state.current.snapshot?.sessionId;
      const resize = () => { const {width,height}=container.getBoundingClientRect(); if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix(); };
      const render = (time: number) => {
        frame = 0;
        if(disposed||lost||!visible||document.hidden)return;
        const gap=previous ? time-previous : 16;
        previous=time;
        const delta=Math.min(gap/1000,.05); elapsed+=delta;
        if(gap>45) slowFrames++; else slowFrames=Math.max(0,slowFrames-1);
        if(slowFrames>40&&!lowQuality) { lowQuality=true; renderer.setPixelRatio(1); resize(); container.dataset.graphicsQuality='balanced'; }
        const {snapshot:s,entering:enter}=state.current;
        const active=s?.activeDraw;
        const activeKey=active ? `${s?.sessionId}/${active.draw.id}` : null;
        if(s?.sessionId!==previousSession) { oldActive=null; revealAt=-Infinity;previousSession=s?.sessionId; }
        if(oldActive&&!activeKey&&s?.history.some(d=>`${s.sessionId}/${d.id}`===oldActive))revealAt=time;
        oldActive=activeKey;
        const progress=active?Math.min(1,Math.max(0,(Date.now()-active.startedAt)/active.durationMs)):0;
        const pulse=Math.max(0,1-(time-revealAt)/1400);
        if(enter&&entranceAt<0)entranceAt=time;
        const entry=enter ? Math.min(1,(time-entranceAt)/4000) : 0;
        const motion = reducedMotion ? 0 : 1;
        const breathe=Math.sin(elapsed*.45)*.04*motion;
        sculpture.rotation.y += ((pointer.current.x*.32+pointer.current.drag)*motion-sculpture.rotation.y)*.065;
        sculpture.rotation.x += (pointer.current.y*.11*motion-sculpture.rotation.x)*.065;
        sculpture.position.y=breathe;
        rings.forEach((ring,i)=>{ring.quaternion.copy(ringRest[i]); if(motion)ring.rotateY(elapsed*(.08+i*.045)+progress*2.5+entry*1.2);});
        const baseDistance=camera.aspect<.95?11.5:9.8;
        camera.position.set(.6+pointer.current.x*.35*motion,1.25-pointer.current.y*.25*motion,baseDistance-entry*2.8*motion-progress*.25*motion);
        camera.lookAt(0,-.1,0);
        key.intensity=5+progress*1.8+pulse*2*motion;
        rim.intensity=35+progress*22+pulse*28*motion;
        renderer.render(scene,camera);
        if(!reducedMotion)frame=requestAnimationFrame(render);
      };
      const resume=()=>{cancelAnimationFrame(frame);previous=0;frame=requestAnimationFrame(render);};
      const observer=new ResizeObserver(()=>{resize();resume();});observer.observe(container);
      const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;resume();});intersection.observe(container);
      const onLost=(event:Event)=>{event.preventDefault();lost=true;setReady(false);cancelAnimationFrame(frame);};
      const onRestored=()=>{lost=false;setReady(true);resume();};
      renderer.domElement.addEventListener('webglcontextlost',onLost);
      renderer.domElement.addEventListener('webglcontextrestored',onRestored);
      document.addEventListener('visibilitychange',resume);
      cleanup=()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',resume);renderer.domElement.removeEventListener('webglcontextlost',onLost);renderer.domElement.removeEventListener('webglcontextrestored',onRestored);disposeTree(scene);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
      container.dataset.graphicsQuality='adaptive';setReady(true);resize();resume();
      try {
        const response=await fetch('/models/whizreveal-orbital.glb',{signal:abort.signal});if(!response.ok)throw new Error('Model unavailable');
        const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
        if(disposed){disposeTree(gltf.scene);return;}
        const removable: import('three').Object3D[]=[];
        gltf.scene.traverse(o=>{ if(o instanceof T.Light||o instanceof T.Camera)removable.push(o); if(o.name==='W_Monolith')o.visible=!presentation; });
        removable.forEach(o=>o.removeFromParent());
        sculpture.remove(fallback);disposeTree(fallback);sculpture.add(gltf.scene);
        rings=[];gltf.scene.traverse(o=>{if(o.name.startsWith('Orbit_'))rings.push(o);});ringRest=rings.map(r=>r.quaternion.clone());
        setSource('higgsfield');resume();
      } catch { /* The locally constructed W stays interactive if the asset is unavailable. */ }
    }).catch(()=>{if(!disposed)setReady(false);});
    return ()=>{disposed=true;abort.abort();cleanup();};
  },[pointer,reducedMotion,welcome,presentation]);
  return <div className={`stage-sculpture ${ready?'sculpture-ready':''}`} aria-hidden="true" data-scene-source={source}>
    <div className="sculpture-fallback"><i/><i/><i/></div><div className="sculpture-webgl" ref={host}/>
  </div>;
}
