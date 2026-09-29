import { useRef, type PointerEvent, type ReactNode } from 'react';
import { StageSculpture } from './StageSculpture';
import type { Snapshot } from '../lib/types';
import '../cinematic-scene.css';

export function ImmersiveStage({ children, occupied = false, presentation = false, snapshot, welcome = false, entering = false }: {
  children?: ReactNode; occupied?: boolean; presentation?: boolean; snapshot?: Snapshot; welcome?: boolean; entering?: boolean;
}) {
  const pointer=useRef({x:0,y:0,drag:0});
  const dragging=useRef<{id:number;x:number;rotation:number}|null>(null);
  function move(event:PointerEvent<HTMLDivElement>) {
    const bounds=event.currentTarget.getBoundingClientRect();
    pointer.current.x=(event.clientX-bounds.left)/bounds.width-.5;
    pointer.current.y=(event.clientY-bounds.top)/bounds.height-.5;
    if(dragging.current)pointer.current.drag=dragging.current.rotation+(event.clientX-dragging.current.x)*.007;
  }
  return <div className={`cinematic-stage ${welcome?'welcome-stage':presentation?'presentation-stage':'preview-stage'} ${occupied?'stage-occupied':'stage-idle'}`}
    onPointerMove={move} onPointerLeave={()=>{if(!dragging.current){pointer.current.x=0;pointer.current.y=0;}}}
    onPointerDown={event=>{if(!welcome||event.button!==0)return;dragging.current={id:event.pointerId,x:event.clientX,rotation:pointer.current.drag};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerUp={event=>{if(dragging.current?.id===event.pointerId){dragging.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}}
    onPointerCancel={()=>{dragging.current=null;}}>
    <StageSculpture pointer={pointer} snapshot={snapshot} welcome={welcome} entering={entering} presentation={presentation}/>{children}
  </div>;
}
