import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { DrawRecord, Snapshot } from '../lib/types';
import { createRevealTracker, detectRevealedDraw } from '../lib/stage-motion';
import { SHEEN_DURATION_S, SHEEN_WINDOW_MS, revealGetsSheen, tileRevealDelay, tileSheenDelay } from '../lib/tile-reveal';

type View = Snapshot['presentation']['view'];

/**
 * The draw this window watched being revealed, while its sheen plays. It uses the
 * stage's reveal detector, so a restored result or a remount never counts as a reveal.
 * Only draws that get a sheen are remembered (see revealGetsSheen), and a view switch
 * forgets the draw, so the grids that switch remounts spring in without replaying it.
 */
function useWatchedReveal(snapshot: Snapshot, reducedMotion: boolean): DrawRecord | null {
  const [tracker] = useState(() => createRevealTracker(snapshot));
  const [watched, setWatched] = useState<{ draw: DrawRecord; view: View } | null>(null);
  const view = snapshot.presentation.view;
  // Before paint, so the revealed tiles mount with their sheen already scheduled.
  useLayoutEffect(() => {
    const draw = detectRevealedDraw(tracker, snapshot);
    if (draw && revealGetsSheen(draw.numbers.length, reducedMotion)) setWatched({ draw, view: snapshot.presentation.view });
  }, [tracker, snapshot, reducedMotion]);
  useEffect(() => {
    if (!watched) return;
    const timer = window.setTimeout(() => setWatched(null), SHEEN_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [watched]);
  // Adjusted while rendering, so no grid of the new view ever renders with the sheen.
  if (watched && watched.view !== view) {
    setWatched(null);
    return null;
  }
  return watched?.draw ?? null;
}

/**
 * Memoised: clearing a sheen re-renders only the grid whose `sheen` changed, never
 * every grid in Full history. Its other props are primitives or the snapshot's own
 * arrays, which keep their identity until the snapshot changes.
 */
const NumberGrid = memo(function NumberGrid({ numbers, count, total, cycling, seed, large = false, scale = 1, sheen = false }: {
  numbers: number[]; count: number; total: number; cycling: boolean;
  seed: string; large?: boolean; scale?: number; sheen?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!cycling || reducedMotion) return;
    const timer = window.setInterval(() => setFrame((value) => value + 1), 68);
    return () => window.clearInterval(timer);
  }, [cycling, reducedMotion]);

  // Committed numbers spring in. Never while cycling or for reduced motion.
  const entering = !reducedMotion && !cycling && numbers.length > 0;
  // One sheen then crosses each tile, only for the reveal this window watched (small draws only; see useWatchedReveal).
  const sheening = entering && sheen;
  const digits = Math.max(2, String(total).length);
  const dynamicCols = large ? Math.min(count, 5) : Math.min(count, count >= 10 ? 5 : 4);
  const cols = Math.max(1, dynamicCols);
  const style = {
    '--display-scale': scale,
    '--tile-height': `${(large ? 226 : 146) * scale}px`,
    '--number-font': `${(large ? 108 : 66) * scale}px`,
    '--grid-gap': `${(large ? 22 : 12) * scale}px`,
    '--grid-max': `${cols * (large ? 254 : 176) * scale}px`,
    '--grid-columns': `${cols}`,
    '--digits': digits,
  } as CSSProperties;

  return (
    <div className={`number-grid ${cycling ? 'is-cycling' : ''}`} style={style}
      role="group" aria-label={cycling ? 'Drawing numbers' : numbers.length ? 'Drawn numbers' : 'Waiting for a draw'}>
      {Array.from({ length: count }, (_, index) => {
        // These values are decorative only. Winners always come from the draw engine.
        const shuffled = ((frame * (total > 1 && total % 73 === 0 ? 71 : 73) + index * 41 + 17) % total) + 1;
        const value = cycling ? reducedMotion ? '·' : shuffled : numbers[index] ?? '—';
        return (
          <motion.div className={`number-tile ${!numbers.length && !cycling ? 'is-empty' : ''} ${sheening ? 'has-sheen' : ''}`}
            key={`${seed}-${index}-${cycling ? 'cycling' : 'revealed'}`}
            style={sheening ? { '--sheen-delay': `${tileSheenDelay(index)}s`, '--sheen-duration': `${SHEEN_DURATION_S}s` } as CSSProperties : undefined}
            initial={entering ? { opacity: 0, scale: 0.86 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 290, damping: 22, delay: tileRevealDelay(index) }}>
            <span className="number-value" aria-hidden={cycling}>{value}</span>
          </motion.div>
        );
      })}
    </div>
  );
});

function drawOrdinal(id: number) {
  const lastTwoDigits = id % 100;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[id % 10] ?? 'th';
  return `${id}${suffix}`;
}

export function RevealCanvas({ snapshot, presentation = false }: { snapshot: Snapshot; presentation?: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { activeDraw, config, history } = snapshot;
  const current = activeDraw?.draw ?? history[0];
  const view = snapshot.presentation.view;
  const scale = presentation ? snapshot.presentation.scale : 1;
  const visibleHistory = history.filter((draw) => draw.id !== activeDraw?.draw.id);
  const reducedMotion = !!useReducedMotion();
  const revealed = useWatchedReveal(snapshot, reducedMotion);

  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, current?.id, snapshot.sessionId]);

  const renderDraw = (draw: DrawRecord, cycling = false) => (
    <NumberGrid numbers={draw.numbers} count={draw.numbers.length} total={config.totalSamples}
      cycling={cycling} seed={`${snapshot.sessionId}-${draw.id}`} large={presentation} scale={scale}
      sheen={!cycling && draw.id === revealed?.id} />
  );

  return (
    <div ref={canvasRef} className={`reveal-canvas ${presentation ? 'presentation-canvas' : 'preview-canvas'} ${view === 'history' ? 'history-canvas' : ''}`}
      tabIndex={0} aria-label={view === 'history' ? 'Full draw history' : 'Current draw'}>
      {view === 'history' && (history.length > 0) ? (
        <div className="history-rows">
          {activeDraw && <div className="history-draw" key={activeDraw.draw.id}>
            <div className="history-draw-heading"><span>{drawOrdinal(activeDraw.draw.id)} Draw</span><span className="history-draw-state">Drawing</span></div>
            {renderDraw(activeDraw.draw, true)}
          </div>}
          {visibleHistory.map((draw) => <div className="history-draw" key={draw.id}>
            <div className="history-draw-heading"><span>{drawOrdinal(draw.id)} Draw</span></div>
            {renderDraw(draw)}
          </div>)}
        </div>
      ) : (
        <div className="current-numbers">
          <NumberGrid numbers={current?.numbers ?? []} count={current?.numbers.length ?? Math.min(config.drawCount, 500)}
            total={config.totalSamples} cycling={!!activeDraw} seed={`${snapshot.sessionId}-${current?.id ?? 'empty'}`}
            large={presentation} scale={scale} sheen={!activeDraw && !!current && current.id === revealed?.id} />
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeDraw ? 'Drawing in progress' : current ? `Draw ${current.id}: ${current.numbers.join(', ')}` : 'Ready for the first draw'}
      </span>
    </div>
  );
}
