import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { ImmersiveStage } from './ImmersiveStage';
import { readSkipWelcome } from '../lib/welcome-preferences';
import '../welcome.css';

interface WelcomeScreenProps {
  onBegin: (enabled: boolean) => void;
  onComplete: (skipNextTime: boolean) => void;
}

/** Opening the session never depends on audio permission or WebGL availability. */
export function WelcomeScreen({ onBegin, onComplete }: WelcomeScreenProps) {
  const reducedMotion = useReducedMotion();
  const [entering, setEntering] = useState(false);
  const [skipNextTime, setSkipNextTime] = useState(readSkipWelcome);
  const started = useRef(false);
  const completed = useRef(false);
  const deadline = useRef(0);
  const skipButton = useRef<HTMLButtonElement>(null);

  const complete = useCallback(() => {
    if (!started.current || completed.current) return;
    completed.current = true;
    onComplete(skipNextTime);
  }, [onComplete, skipNextTime]);

  function begin(enabled: boolean) {
    if (started.current) return;
    started.current = true;
    deadline.current = performance.now() + (reducedMotion ? 150 : 1050);
    // This callback stays within the click gesture so Web Audio can be unlocked.
    try { onBegin(enabled); }
    catch { /* Audio is optional; always let the user enter. */ }
    setEntering(true);
  }

  useEffect(() => {
    if (!entering) return;
    skipButton.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(complete, Math.max(0, deadline.current - performance.now()));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      complete();
    };
    window.addEventListener('keydown', escape, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', escape, true); };
  }, [entering, complete]);

  return <main className={`welcome-screen${entering ? ' welcome-entering' : ''}`} aria-labelledby="welcome-title">
    <div className="welcome-scene"><ImmersiveStage welcome entering={entering} /></div>
    <header className="welcome-topbar">
      <div className="welcome-brand">
        <svg aria-hidden="true" viewBox="0 0 42 42"><path d="M7 12 13 31 21 16 29 31 35 12" /></svg>
        <div><span>WhizReveal</span><small>by JAYCEE 曾令强</small></div>
      </div>
      <span className="welcome-top-note">A little suspense. A big moment.</span>
    </header>

    <div className="welcome-layout">
      <motion.section className="welcome-copy" initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: entering ? 0 : 1, y: entering ? -18 : 0 }}
        transition={{ duration: reducedMotion ? 0 : entering ? 0.45 : 0.9, ease: [0.22, 1, 0.36, 1] }}>
        <p className="welcome-eyebrow"><span />The moment starts here</p>
        <h1 id="welcome-title">Let possibility<br />take the stage.</h1>
        <p className="welcome-description">Your next reveal deserves an entrance.</p>
        <div className="welcome-entry-controls" inert={entering}>
          <div className="welcome-entry-actions">
            <button type="button" className="welcome-enter-sound" onClick={() => begin(true)} disabled={entering}>
              <Volume2 size={17} aria-hidden="true" /><span>Enter with sound</span><ArrowRight size={19} aria-hidden="true" />
            </button>
            <button type="button" className="welcome-enter-silent" onClick={() => begin(false)} disabled={entering}>
              <VolumeX size={16} aria-hidden="true" /><span>Enter silently</span>
            </button>
          </div>
          <label className="welcome-skip-preference">
            <input type="checkbox" checked={skipNextTime} disabled={entering} onChange={(event) => setSkipNextTime(event.target.checked)} />
            <span className="welcome-checkbox" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg></span>
            <span>Skip welcome next time</span>
          </label>
        </div>
      </motion.section>
      <div className="welcome-hero-space" aria-hidden="true" />
    </div>

    <footer className="welcome-footer">
      {entering ? <>
        <span className="welcome-entering-status" role="status">Opening your stage</span>
        <button type="button" className="welcome-skip-intro" ref={skipButton} onClick={complete}>Skip intro <kbd>Esc</kbd><ArrowRight size={16} aria-hidden="true" /></button>
      </> : <>
        <span className="welcome-drag-hint"><span aria-hidden="true">↔</span> Drag to explore</span>
        <span className="welcome-footer-note">Built for the reveal.</span>
      </>}
    </footer>
  </main>;
}
