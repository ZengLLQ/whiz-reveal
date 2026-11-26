import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { DrawRecord, Snapshot } from '../lib/types';
import { cyclingFrame, cyclingValue, sameNumbers } from '../lib/number-grid';
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

/** Writes a tile's decorative digits into its existing text node, without React. */
function writeDigits(value: HTMLElement, text: string) {
  const node = value.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE && !node.nextSibling) {
    if (node.nodeValue !== text) node.nodeValue = text;
  } else value.textContent = text;
}

/**
 * Decorative cycling without React: one animation-frame loop per cycling grid rewrites
 * the digits of its plain tiles every CYCLE_INTERVAL_MS, so a 500-number draw costs no
 * re-render while it cycles. React renders frame 0 and never sees the later values,
 * which only ever reach aria-hidden text. Only tiles on (or near) screen are rewritten;
 * one scrolled into view picks up the cycle on its next frame.
 */
function useDecorativeCycling(gridRef: RefObject<HTMLDivElement | null>, active: boolean, seed: string, count: number, total: number) {
  useEffect(() => {
    const grid = gridRef.current;
    if (!active || !grid) return;
    const tiles = Array.from(grid.children) as HTMLElement[];
    const values = tiles.map((tile) => tile.firstElementChild as HTMLElement | null);
    const canObserve = typeof IntersectionObserver !== 'undefined';
    const onScreen = tiles.map(() => !canObserve);
    let observer: IntersectionObserver | undefined;
    if (canObserve) {
      const indexOf = new Map(tiles.map((tile, index) => [tile, index] as const));
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const index = indexOf.get(entry.target as HTMLElement);
          if (index !== undefined) onScreen[index] = entry.isIntersecting;
        }
      }, { root: grid.closest('.reveal-canvas'), rootMargin: '25% 0px' });
      for (const tile of tiles) observer.observe(tile);
    }
    let start: number | undefined;
    let shown = 0;
    let request = 0;
    const tick = (now: number) => {
      start ??= now;
      const frame = cyclingFrame(now - start);
      if (frame !== shown) {
        shown = frame;
        values.forEach((value, index) => {
          if (value && onScreen[index]) writeDigits(value, String(cyclingValue(frame, index, total)));
        });
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
      observer?.disconnect();
    };
  }, [gridRef, active, seed, count, total]);
}

type NumberGridProps = {
  numbers: number[]; count: number; total: number; cycling: boolean;
  seed: string; large?: boolean; scale?: number; sheen?: boolean;
};

/** Every snapshot arrives as new objects, so a draw's numbers are compared by content. */
function sameGridProps(a: NumberGridProps, b: NumberGridProps) {
  return a.count === b.count && a.total === b.total && a.cycling === b.cycling && a.seed === b.seed
    && a.large === b.large && a.scale === b.scale && a.sheen === b.sheen && sameNumbers(a.numbers, b.numbers);
}

/**
 * Memoised by content: a new snapshot (a draw starting or ending, a sheen clearing)
 * re-renders only the grid whose draw or state changed, never every grid in Full history.
 * Cycling tiles are plain elements driven by useDecorativeCycling; motion components
 * mount only for the spring reveal.
 */
const NumberGrid = memo(function NumberGrid({ numbers, count, total, cycling, seed, large = false, scale = 1, sheen = false }: NumberGridProps) {
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  useDecorativeCycling(gridRef, cycling && !reducedMotion, seed, count, total);

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
    <div ref={gridRef} className={`number-grid ${cycling ? 'is-cycling' : ''}`} style={style}
      role="group" aria-label={cycling ? 'Drawing numbers' : numbers.length ? 'Drawn numbers' : 'Waiting for a draw'}>
      {Array.from({ length: count }, (_, index) => {
        const key = `${seed}-${index}-${cycling ? 'cycling' : 'revealed'}`;
        // Cycling values are decorative only (frame 0 here; later frames are written in place). Winners always come from the draw engine.
        if (cycling) return (
          <div className="number-tile" key={key}>
            <span className="number-value" aria-hidden>{reducedMotion ? '·' : cyclingValue(0, index, total)}</span>
          </div>
        );
        const value = numbers[index] ?? '—';
        const className = `number-tile ${!numbers.length ? 'is-empty' : ''} ${sheening ? 'has-sheen' : ''}`;
        if (!entering) return (
          <div className={className} key={key}>
            <span className="number-value" aria-hidden={false}>{value}</span>
          </div>
        );
        return (
          <motion.div className={className} key={key}
            style={sheening ? { '--sheen-delay': `${tileSheenDelay(index)}s`, '--sheen-duration': `${SHEEN_DURATION_S}s` } as CSSProperties : undefined}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 290, damping: 22, delay: tileRevealDelay(index) }}>
            <span className="number-value" aria-hidden={false}>{value}</span>
          </motion.div>
        );
      })}
    </div>
  );
}, sameGridProps);

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
