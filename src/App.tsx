import { useEffect, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { Maximize, Minimize } from 'lucide-react';
import { Controller, ErrorToast } from './components/Controller';
import { RevealCanvas } from './components/RevealCanvas';
import { isNative } from './lib/bridge';
import { useRaffle } from './hooks/useRaffle';

const isDisplay = new URLSearchParams(window.location.search).get('window') === 'display';

export function App() {
  const { snapshot, error, busy, actions, clearError } = useRaffle();
  const [windowError, setWindowError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(isNative && isDisplay);

  async function setPresentationFullscreen(value: boolean) {
    try {
      if (isNative) {
        const display = getCurrentWindow();
        await display.setDecorations(!value);
        await display.setFullscreen(value);
        if (!value) await display.setSize(new LogicalSize(1280, 720));
      }
      else if (value) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      setFullscreen(value);
    } catch (cause) { setWindowError(String(cause)); }
  }

  async function toggleFullscreen() {
    try {
      const current = isNative ? await getCurrentWindow().isFullscreen() : !!document.fullscreenElement;
      await setPresentationFullscreen(!current);
    } catch (cause) { setWindowError(String(cause)); }
  }

  useEffect(() => {
    if (!isNative || !isDisplay) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => void getCurrentWindow().isFullscreen().then((value) => { if (!cancelled) setFullscreen(value); }).catch((cause: unknown) => { if (!cancelled) setWindowError(String(cause)); });
    refresh();
    void getCurrentWindow().onResized(refresh).then((stop) => { if (cancelled) stop(); else unlisten = stop; });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    document.title = `WhizReveal - ${isDisplay ? 'Display' : 'Controller'}`;
    if (!isDisplay) return;
    const change = () => { if (!isNative) setFullscreen(!!document.fullscreenElement); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'F11') {
        event.preventDefault();
        if (event.key === 'Escape') void setPresentationFullscreen(false);
        else void toggleFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', change); window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  return <>
    {snapshot ? isDisplay ? <main className="display-shell"><RevealCanvas snapshot={snapshot} presentation /><div className="display-tools"><button className="display-tool" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F11)'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button></div></main>
      : <Controller snapshot={snapshot} actions={actions} busy={busy} />
      : <main className="loading-screen"><span className="loading-dot" /><span className={isDisplay ? 'sr-only' : ''}>{error ? 'Unable to load session' : 'Opening your session'}</span>{error && <button className="secondary-button" onClick={() => window.location.reload()}>Try again</button>}</main>}
    <ErrorToast message={error ?? windowError} onClose={() => { clearError(); setWindowError(null); }} />
  </>;
}
