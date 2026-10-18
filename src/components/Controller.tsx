import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CircleHelp, History, Monitor, RotateCcw, Play, X } from 'lucide-react';
import type { Config, Snapshot } from '../lib/types';
import { isNative } from '../lib/bridge';
import { useRaffle } from '../hooks/useRaffle';
import { RevealCanvas } from './RevealCanvas';
import { ImmersiveStage } from './ImmersiveStage';
import { ControllerTextSize } from './ControllerTextSize';
import { ManualGuide } from './ManualGuide';
import { HistoryExportButton } from './HistoryExportButton';
import { useControllerTextSize } from '../hooks/useControllerTextSize';
import '../controller-typography.css';
import { useDrawSound } from '../hooks/useDrawSound';
import { SoundControls } from './SoundControls';

type Actions = ReturnType<typeof useRaffle>['actions'];

function Parameters({ snapshot, actions, busy, onDirtyChange }: { snapshot: Snapshot; actions: Actions; busy: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const [samples, setSamples] = useState(String(snapshot.config.totalSamples));
  const [count, setCount] = useState(String(snapshot.config.drawCount));
  const [fieldError, setFieldError] = useState('');
  const [scale, setScale] = useState(snapshot.presentation.scale);
  const editing = samples !== String(snapshot.config.totalSamples) || count !== String(snapshot.config.drawCount);
  const pendingScale = useRef<number | null>(null);
  const draft = useRef({ samples, count });
  draft.current = { samples, count };
  const disabled = busy || !!snapshot.activeDraw;

  useEffect(() => { setSamples(String(snapshot.config.totalSamples)); setCount(String(snapshot.config.drawCount)); setFieldError(''); }, [snapshot.config.totalSamples, snapshot.config.drawCount, snapshot.sessionId]);
  useEffect(() => { onDirtyChange(editing); }, [editing, onDirtyChange]);
  useEffect(() => {
    if (pendingScale.current !== null && pendingScale.current !== snapshot.presentation.scale) return;
    pendingScale.current = null;
    setScale(snapshot.presentation.scale);
  }, [snapshot.presentation.scale]);

  function saveConfig(event?: FormEvent) {
    event?.preventDefault();
    const totalSamples = Number(draft.current.samples);
    const drawCount = Number(draft.current.count);
    if (!Number.isInteger(totalSamples) || totalSamples < 1 || totalSamples > 1_000_000 || !Number.isInteger(drawCount) || drawCount < 1 || drawCount > 500) {
      setFieldError('Use 1–1,000,000 samples and 1–500 numbers per draw.');
      return;
    }
    setFieldError('');
    const config: Config = { ...snapshot.config, totalSamples, drawCount };
    void actions.updateConfig(config);
  }

  // Debounce only the slider, retaining instant visual feedback while syncing its value live.
  useEffect(() => {
    if (scale === snapshot.presentation.scale) return;
    const timer = window.setTimeout(() => void actions.updatePresentation({ ...snapshot.presentation, scale }), 80);
    return () => window.clearTimeout(timer);
  }, [scale, snapshot.presentation, actions]);

  return (
    <aside className="parameters">
      <div className="section-label">Draw setup</div>
      <form onSubmit={saveConfig} className="settings-form">
        <label className="field-label" htmlFor="total-samples">Total samples</label>
        <div className="input-shell"><input id="total-samples" type="number" min={1} max={1_000_000} step={1}
          value={samples} disabled={disabled || snapshot.history.length > 0}
          onChange={(event) => setSamples(event.target.value)} /><span>samples</span></div>
        <p className="field-hint">{snapshot.history.length ? 'Start a new session to change the pool.' : `Every number from 1 to ${Number(samples) > 0 ? Number(samples).toLocaleString() : '…'}.`}</p>
        <label className="field-label mt-6" htmlFor="draw-count">Number of draws</label>
        <div className="input-shell"><input id="draw-count" type="number" min={1} max={500} step={1} value={count} disabled={disabled}
          onChange={(event) => setCount(event.target.value)} /><span>per draw</span></div>
        {editing && <button className="apply-button" type="submit" disabled={disabled}><Check size={14} />Apply settings</button>}
        {fieldError && <p role="alert" className="field-error">{fieldError}</p>}
      </form>
      <label className="field-label mt-6" htmlFor="draw-duration">Draw duration</label>
      <select id="draw-duration" className="duration-select" value={snapshot.config.drawDurationMs ?? 1600} disabled={disabled || editing}
        onChange={(event) => void actions.updateConfig({ ...snapshot.config, drawDurationMs: Number(event.target.value) })}>
        {[1000, 1600, 3000, 5000, 10000, 15000, 20000, 30000].map(ms => <option key={ms} value={ms}>{ms / 1000} seconds</option>)}
      </select>
      <p className="field-hint">Time before winners are revealed.</p>
      <div className="toggle-row">
        <div><span className="field-label">No duplicates</span><p className="field-hint">Each number wins once.</p></div>
        <button className="switch" role="switch" aria-checked={snapshot.config.noDuplicates} aria-label="No duplicates"
          disabled={disabled} onClick={() => void actions.updateConfig({ ...snapshot.config, noDuplicates: !snapshot.config.noDuplicates })}>
          <span className="switch-thumb" />
        </button>
      </div>
      {!snapshot.config.noDuplicates && <p className="field-hint repeat-note">Repeats are allowed, including within a draw.</p>}
      <div className="settings-divider" />
      <div className="section-label">Presentation</div>
      <span className="field-label mt-5">Display view</span>
      <div className="segmented" role="group" aria-label="Display view">
        <button aria-pressed={snapshot.presentation.view === 'current'} onClick={() => void actions.updatePresentation({ scale, view: 'current' })}>Current draw</button>
        <button aria-pressed={snapshot.presentation.view === 'history'} onClick={() => void actions.updatePresentation({ scale, view: 'history' })}>Full history</button>
      </div>
      <label className="scale-label" htmlFor="display-scale"><span>Display scale</span><output>{Math.round(scale * 100)}%</output></label>
      <input id="display-scale" className="scale-slider" type="range" min="0.5" max="2" step="0.05" value={scale}
        onChange={(event) => { const next = Number(event.target.value); pendingScale.current = next; setScale(next); }} aria-valuetext={`${Math.round(scale * 100)} percent`} />
      <div className="scale-endpoints"><span>50%</span><span>200%</span></div>
    </aside>
  );
}

function HistorySidebar({ snapshot, busy }: { snapshot: Snapshot; busy: boolean }) {
  const completed = snapshot.history.filter((draw) => draw.id !== snapshot.activeDraw?.draw.id);
  return (
    <aside className="history-sidebar">
      <div className="history-heading"><span className="section-label">Session history</span><span className="count-badge">{completed.length}</span></div>
      <div className="history-list" tabIndex={0} aria-label="Session history">
        {completed.length ? completed.map((draw, index) => (
          <motion.div className="history-entry" key={`${snapshot.sessionId}-${draw.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="history-entry-meta"><span>Draw {String(draw.id).padStart(2, '0')}{index === 0 && <span className="latest-label">Latest</span>}</span><time dateTime={new Date(draw.createdAt).toISOString()}>{new Date(draw.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div>
            <div className="history-chips">{draw.numbers.map((number, numberIndex) => <span key={numberIndex}>{number}</span>)}</div>
          </motion.div>
        )) : <div className="empty-history"><History size={20} strokeWidth={1.3} /><p>No draws yet.</p><span>Your results will appear here.</span></div>}
      </div>
      <HistoryExportButton snapshot={snapshot} busy={busy} />
      <div className="history-bottom"><span className="status-dot" />Saved locally</div>
    </aside>
  );
}

export function Controller({ snapshot, actions, busy, displayOpen, displayBusy, onShowWelcome }: { snapshot: Snapshot; actions: Actions; busy: boolean; displayOpen: boolean; displayBusy: boolean; onShowWelcome: () => void }) {
  const textSize = useControllerTextSize();
  const sound = useDrawSound(snapshot);
  const [showReset, setShowReset] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Count only revealed draws, matching Session history, so stats do not change before the reveal.
  const revealed = snapshot.history.filter((draw) => draw.id !== snapshot.activeDraw?.draw.id);
  const drawn = new Set(revealed.flatMap((draw) => draw.numbers)).size;
  const remaining = snapshot.config.totalSamples - drawn;
  const drawing = !!snapshot.activeDraw;
  const exhausted = snapshot.config.noDuplicates && remaining < snapshot.config.drawCount;
  const latest = snapshot.history[0];
  const disabled = busy || drawing || exhausted || dirty;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key === 'Enter' && !event.repeat && !showReset && !document.querySelector('dialog[open]') && !disabled && !target.closest('input, button, dialog, select, textarea, [role="switch"]')) {
        event.preventDefault(); sound.click(); void actions.draw();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, disabled, showReset, sound.click]);
  useEffect(() => { if (showReset) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [showReset]);

  return (
    <div className="controller-shell" data-controller-text-size={textSize.percentage}
      style={{ '--controller-text-scale': textSize.percentage / 100 } as CSSProperties}>
      <header className="app-topbar">
        <div className="branding"><svg className="brand-symbol" viewBox="0 0 40 40" aria-hidden="true"><path d="m7 11 6 19 7-13 7 13 6-19" /></svg><div><span className="brand-name">WhizReveal</span><span className="brand-credit">by JAYCEE 曾令强</span></div></div>
        <div className="topbar-actions"><ControllerTextSize {...textSize} /><ManualGuide /><SoundControls sound={sound} drawing={drawing} /><button className="secondary-button launch-button" onClick={() => void actions.toggleDisplay()} disabled={displayBusy} aria-pressed={displayOpen} aria-label={displayOpen ? 'Close display' : 'Launch display'}>
          {displayOpen ? <X size={15} /> : <Monitor size={15} />}<span>{displayBusy ? 'Please wait' : displayOpen ? 'Close display' : 'Launch display'}</span>
        </button></div>
      </header>
      <main className="workspace">
        <Parameters snapshot={snapshot} actions={actions} busy={busy} onDirtyChange={setDirty} />
        <section className="draw-workspace" aria-label="Draw controller">
          <div className="preview-heading"><span>{snapshot.presentation.view === 'current' ? 'Current draw' : 'Full history'}</span><span className="preview-indicator"><span className={`status-dot ${drawing ? 'pulsing' : ''}`} />{drawing ? 'Drawing' : 'Live preview'}</span></div>
          <ImmersiveStage occupied={!!latest || drawing} snapshot={snapshot}>
            {latest ? <RevealCanvas snapshot={snapshot} /> : <div className="stage-welcome"><h1>Ready to reveal.</h1><p>Set your numbers. Let chance take over.</p></div>}
            <div className="preview-baseline"><span>{drawing ? 'Drawing in progress' : latest ? `Draw ${String(latest.id).padStart(2, '0')} · ${latest.numbers.length} ${latest.numbers.length === 1 ? 'number' : 'numbers'}` : 'WhizReveal / A moment of possibility'}</span><span className="baseline-mark" aria-hidden="true">↗</span></div>
          </ImmersiveStage>
          <div className="session-stats"><div><span className="stat-value">{snapshot.config.totalSamples.toLocaleString()}</span><span className="stat-label">Total samples</span></div><div><span className="stat-value">{drawn.toLocaleString()}</span><span className="stat-label">Unique drawn</span></div><div><span className="stat-value">{snapshot.config.noDuplicates ? remaining.toLocaleString() : '∞'}</span><span className="stat-label">{snapshot.config.noDuplicates ? 'Remaining' : 'With repeats'}</span></div></div>
          <button className="draw-button" disabled={disabled} onClick={() => { sound.click(); void actions.draw(); }}>
            <span>{drawing ? 'Drawing' : dirty ? 'Apply settings to draw' : exhausted ? remaining === 0 ? 'Pool complete' : 'Not enough numbers' : `Draw ${snapshot.config.drawCount} ${snapshot.config.drawCount === 1 ? 'number' : 'numbers'}`}</span>
            {drawing ? <span className="drawing-dots"><i /><i /><i /></span> : <ArrowRight size={21} />}
          </button>
          <div className="draw-note">{exhausted ? remaining === 0 ? 'Start a new session to draw again.' : `Choose ${remaining} or fewer numbers, or start a new session.` : drawing ? 'A moment of possibility.' : <><kbd>Enter</kbd><span>to draw · when controls are unfocused</span></>}</div>
        </section>
        <HistorySidebar snapshot={snapshot} busy={busy} />
      </main>
      <footer className="app-footer"><span className="footer-note"><span className="status-dot" />{!isNative ? 'Browser preview' : displayOpen ? 'Display connected' : 'Ready when you are'}</span><div className="footer-actions"><button className="text-button" disabled={drawing || busy} onClick={onShowWelcome}><Play size={13} />Welcome</button><button className="text-button" disabled={drawing || busy} onClick={() => setShowReset(true)}><RotateCcw size={13} />New session</button></div></footer>
      <dialog ref={dialogRef} className="reset-dialog" onCancel={() => setShowReset(false)} onClose={() => setShowReset(false)}>
        <div className="dialog-icon"><CircleHelp size={24} /></div><h2>Start fresh?</h2><p>This clears the current session’s draw history and makes every number available again. Your presentation settings stay the same.</p>{snapshot.history.length > 0 && <p>To keep these results, choose Keep session and use Export PDF in Session history before starting fresh.</p>}<div className="dialog-actions"><button className="secondary-button" autoFocus onClick={() => setShowReset(false)}>Keep session</button><button className="primary-button" onClick={() => { setShowReset(false); void actions.resetSession(); }}>New session</button></div>
      </dialog>
    </div>
  );
}

export function ErrorToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  return <AnimatePresence>{message && <motion.div className="error-toast" role="alert" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}><span>{message}</span><button onClick={onClose} aria-label="Dismiss error"><X size={17} /></button></motion.div>}</AnimatePresence>;
}
