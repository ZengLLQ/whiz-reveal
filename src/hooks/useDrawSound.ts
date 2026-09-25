import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawSound, DrawSoundTracker } from '../lib/draw-sound';
import type { Snapshot } from '../lib/types';

const key = 'whizreveal.sound-enabled';
export function useDrawSound(snapshot: Snapshot) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(key) !== 'false'; } catch { return true; }
  });
  const sound = useRef<DrawSound | null>(null);
  const tracker = useRef(new DrawSoundTracker());
  const engine = useCallback(() => sound.current ??= new DrawSound(), []);
  useEffect(() => {
    const cue = tracker.current.update(snapshot);
    if (!enabled) { sound.current?.stop(); return; }
    if (cue === 'shuffle' && snapshot.activeDraw) engine().shuffle(snapshot.activeDraw.startedAt, snapshot.activeDraw.durationMs);
    else if (cue === 'reveal') engine().reveal();
    else sound.current?.stop();
  }, [snapshot, enabled, engine]);
  useEffect(() => () => { sound.current?.dispose(); sound.current = null; }, []);
  const click = useCallback(() => { if (enabled) engine().click(); }, [enabled, engine]);
  function toggle() {
    const next = !enabled;
    if (next) engine().unlock(); else sound.current?.stop();
    setEnabled(next);
    try { localStorage.setItem(key, String(next)); } catch { /* Private storage. */ }
  }
  return { enabled, toggle, click };
}
