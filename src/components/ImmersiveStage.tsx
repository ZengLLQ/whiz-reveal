import { useRef, type PointerEvent, type ReactNode } from 'react';
import { StageSculpture } from './StageSculpture';

/** Only the decorative backdrop moves. Draw results keep a stable, readable plane. */
export function ImmersiveStage({ children, occupied = false }: { children: ReactNode; occupied?: boolean }) {
  const pointer = useRef({ x: 0, y: 0 });

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: (event.clientX - bounds.left) / bounds.width - 0.5, y: (event.clientY - bounds.top) / bounds.height - 0.5 };
  }

  return <div className={`preview-stage ${occupied ? 'stage-occupied' : 'stage-idle'}`} onPointerMove={followPointer}
    onPointerLeave={() => { pointer.current = { x: 0, y: 0 }; }}>
    <StageSculpture pointer={pointer} />
    {children}
  </div>;
}
