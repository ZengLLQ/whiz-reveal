import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { DrawRecord, Snapshot } from '../lib/types';

function NumberGrid({ numbers, count, total, cycling, seed, large = false, scale = 1 }: {
  numbers: number[]; count: number; total: number; cycling: boolean;
  seed: string; large?: boolean; scale?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!cycling || reducedMotion) return;
    const timer = window.setInterval(() => setFrame((value) => value + 1), 68);
    return () => window.clearInterval(timer);
  }, [cycling, reducedMotion]);

  const digits = Math.max(2, String(total).length);
  const dynamicCols = large ? Math.min(count, 5) : Math.min(count, count >= 10 ? 5 : 4);
  const cols = Math.max(1, dynamicCols);
  const style = {
    '--tile-min': `${(large ? 206 : 112) * scale}px`,
    '--presentation-tile-min': `${206 * scale}px`,
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
          <motion.div className={`number-tile ${!numbers.length && !cycling ? 'is-empty' : ''}`}
            key={`${seed}-${index}-${cycling ? 'cycling' : 'revealed'}`}
            initial={reducedMotion || cycling || !numbers.length ? false : { opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 290, damping: 22, delay: Math.min(index * 0.065, 0.35) }}>
            <span className="number-value" aria-hidden={cycling}>{value}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

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

  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, current?.id, snapshot.sessionId]);

  const renderDraw = (draw: DrawRecord, cycling = false) => (
    <NumberGrid numbers={draw.numbers} count={draw.numbers.length} total={config.totalSamples}
      cycling={cycling} seed={`${snapshot.sessionId}-${draw.id}`} large={presentation} scale={scale} />
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
            large={presentation} scale={scale} />
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeDraw ? 'Drawing in progress' : current ? `Draw ${current.id}: ${current.numbers.join(', ')}` : 'Ready for the first draw'}
      </span>
    </div>
  );
}
