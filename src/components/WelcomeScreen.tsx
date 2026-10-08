import { useEffect, useRef, useState } from 'react';
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
  const [skipNextTime, setSkipNextTime] = useState(readSkipWelcome);
  const started = useRef(false);

  function begin(enabled: boolean) {
    if (started.current) return;
    started.current = true;
    try { onBegin(enabled); }
    catch { /* Audio is optional; always let the user enter. */ }
    onComplete(skipNextTime);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (started.current) return;
      if (event.key === 'Enter' && !(event.target as HTMLElement)?.closest('input, button')) {
        event.preventDefault();
        begin(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        begin(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skipNextTime]);

  return (
    <main className="welcome-screen" aria-labelledby="welcome-title">
      <div className="welcome-scene">
        <ImmersiveStage welcome />
      </div>
      <header className="welcome-topbar">
        <div className="welcome-brand">
          <svg aria-hidden="true" viewBox="0 0 42 42"><path d="M7 12 13 31 21 16 29 31 35 12" /></svg>
          <div><span>WhizReveal</span><small>by JAYCEE 曾令强</small></div>
        </div>
        <span className="welcome-top-note">A little suspense. A big moment.</span>
      </header>

      <div className="welcome-layout">
        <motion.section
          className="welcome-copy"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="welcome-eyebrow"><span />The moment starts here</p>
          <h1 id="welcome-title">Let possibility<br />take the stage.</h1>
          <p className="welcome-description">Your next reveal deserves an entrance.</p>
          <div className="welcome-entry-controls">
            <div className="welcome-entry-actions">
              <button type="button" className="welcome-enter-sound" onClick={() => begin(true)}>
                <Volume2 size={17} aria-hidden="true" /><span>Enter with sound</span><ArrowRight size={19} aria-hidden="true" />
              </button>
              <button type="button" className="welcome-enter-silent" onClick={() => begin(false)}>
                <VolumeX size={16} aria-hidden="true" /><span>Enter silently</span>
              </button>
            </div>
            <label className="welcome-skip-preference">
              <input type="checkbox" checked={skipNextTime} onChange={(event) => setSkipNextTime(event.target.checked)} />
              <span className="welcome-checkbox" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg></span>
              <span>Skip welcome next time</span>
            </label>
          </div>
        </motion.section>
        <div className="welcome-hero-space" aria-hidden="true" />
      </div>

      <footer className="welcome-footer">
        <span className="welcome-drag-hint"><span aria-hidden="true">↔</span> Drag to explore</span>
        <span className="welcome-footer-note">Built for the reveal.</span>
      </footer>
    </main>
  );
}
