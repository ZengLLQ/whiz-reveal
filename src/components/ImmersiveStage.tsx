import type { PointerEvent, ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/** Only the decorative backdrop moves. Draw results keep a stable, readable plane. */
export function ImmersiveStage({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, { stiffness: 90, damping: 24 });
  const y = useSpring(targetY, { stiffness: 90, damping: 24 });

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (reducedMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    targetX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 24);
    targetY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 16);
  }

  return <div className="preview-stage" onPointerMove={followPointer}
    onPointerLeave={() => { targetX.set(0); targetY.set(0); }}>
    <motion.div className="stage-atmosphere" aria-hidden="true" style={reducedMotion ? undefined : { x, y }}>
      <div className="stage-orbit stage-orbit-outer" />
      <div className="stage-orbit stage-orbit-inner" />
      <div className="stage-horizon" />
    </motion.div>
    {children}
  </div>;
}
