import { useRef, type PointerEvent, type ReactNode } from 'react';
import { StageSculpture } from './StageSculpture';
import type { Snapshot } from '../lib/types';
import type { StageMode } from '../lib/stage-motion';
import type { StagePointer } from '../lib/stage-renderer';
import '../cinematic-scene.css';

export function ImmersiveStage({ children, occupied = false, presentation = false, snapshot, welcome = false }: {
  children?: ReactNode; occupied?: boolean; presentation?: boolean; snapshot?: Snapshot; welcome?: boolean;
}) {
  const pointer = useRef<StagePointer>({ x: 0, y: 0, drag: 0, dragging: false });
  const dragging = useRef<{ id: number; x: number; rotation: number } | null>(null);
  const mode: StageMode = welcome ? 'welcome' : presentation ? 'presentation' : 'preview';
  const drawing = !!snapshot?.activeDraw;

  function move(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.current.x = (event.clientX - bounds.left) / bounds.width - 0.5;
    pointer.current.y = (event.clientY - bounds.top) / bounds.height - 0.5;
    if (dragging.current) pointer.current.drag = dragging.current.rotation + (event.clientX - dragging.current.x) * 0.007;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current?.id !== event.pointerId) return;
    dragging.current = null;
    pointer.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={`cinematic-stage ${mode}-stage ${occupied ? 'stage-occupied' : 'stage-idle'} ${drawing ? 'stage-drawing' : ''}`}
      onPointerMove={move}
      onPointerLeave={() => { if (!dragging.current) { pointer.current.x = 0; pointer.current.y = 0; } }}
      onPointerDown={(event) => {
        if (!welcome || event.button !== 0) return;
        dragging.current = { id: event.pointerId, x: event.clientX, rotation: pointer.current.drag };
        pointer.current.dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}>
      <StageSculpture pointer={pointer} mode={mode} occupied={occupied} snapshot={snapshot} />
      {children}
    </div>
  );
}
