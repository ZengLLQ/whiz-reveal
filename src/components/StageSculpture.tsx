import { useEffect, useRef, useState, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Snapshot } from '../lib/types';
import type { StageMode } from '../lib/stage-motion';
import { acquireStage, invalidateStage, isStageReady, type StageInputs, type StagePointer } from '../lib/stage-renderer';

/**
 * A compact, offline shader sculpture. It uses no model downloads or texture assets.
 * The renderer is shared per window (see stage-renderer.ts); this component only
 * lends it a container and describes what the scene should show.
 */
export function StageSculpture({ pointer, mode, occupied, snapshot }: {
  pointer: RefObject<StagePointer>; mode: StageMode; occupied: boolean; snapshot?: Snapshot;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = !!useReducedMotion();
  // A remount after the welcome screen finds the scene already compiled: no fallback flash.
  const [ready, setReady] = useState(isStageReady);
  const inputs = useRef<StageInputs>({ mode, occupied, snapshot, reducedMotion, pointer: pointer.current });
  inputs.current = { mode, occupied, snapshot, reducedMotion, pointer: pointer.current };

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    return acquireStage(container, () => inputs.current, setReady);
  }, []);

  useEffect(() => { invalidateStage(); }, [mode, occupied, snapshot, reducedMotion]);

  return (
    <div className={`stage-sculpture ${ready ? 'sculpture-ready' : ''}`} aria-hidden="true" data-scene-source="shader">
      <div className="sculpture-fallback"><i /><i /><i /></div>
      <div className="sculpture-webgl" ref={host} />
    </div>
  );
}
