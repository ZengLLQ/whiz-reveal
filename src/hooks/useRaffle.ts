import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as bridge from '../lib/bridge';
import { isNewerSnapshot } from '../lib/preview-model';
import type { Config, Presentation, Snapshot } from '../lib/types';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong. Please try again.';
}

export function useRaffle() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [displayBusy, setDisplayBusy] = useState(true);
  const latestDisplay = useRef<bridge.DisplayStatus | null>(null);
  const displayPending = useRef(false);
  const latest = useRef<Snapshot | null>(null);
  const mounted = useRef(false);
  const pendingActions = useRef(0);

  const accept = useCallback((incoming: Snapshot) => {
    if (!mounted.current || !isNewerSnapshot(latest.current, incoming)) return;
    latest.current = incoming;
    setSnapshot(incoming);
  }, []);

  const acceptDisplay = useCallback((incoming: bridge.DisplayStatus) => {
    if (!mounted.current || (latestDisplay.current && incoming.revision < latestDisplay.current.revision)) return;
    latestDisplay.current = incoming;
    setDisplayOpen(incoming.open);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let unlistenDisplay: (() => void) | undefined;
    const connect = async () => {
      // Listening first prevents a draw between the initial fetch and subscription
      // from being lost. The revision guard also rejects an older fetch response.
      const stop = await bridge.subscribe((incoming) => {
        if (!cancelled) accept(incoming);
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      const initial = await bridge.getSnapshot();
      if (!cancelled) accept(initial);
    };
    void connect().catch((reason: unknown) => {
      if (!cancelled) setError(errorMessage(reason));
    });
    const connectDisplay = async () => {
      const stop = await bridge.subscribeDisplayStatus((incoming) => {
        if (!cancelled) acceptDisplay(incoming);
      });
      if (cancelled) { stop(); return; }
      unlistenDisplay = stop;
      // Subscribe before fetching; revisions reject a late response from before
      // a launch or a manual Alt+F4 close event.
      const initial = await bridge.getDisplayStatus();
      if (!cancelled) acceptDisplay(initial);
    };
    void connectDisplay().catch((reason: unknown) => {
      if (!cancelled) setError(errorMessage(reason));
    }).finally(() => {
      if (!cancelled) setDisplayBusy(displayPending.current);
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      unlisten?.();
      unlistenDisplay?.();
    };
  }, [accept, acceptDisplay]);

  const run = useCallback(async (action: () => Promise<Snapshot | void>): Promise<void> => {
    pendingActions.current += 1;
    if (mounted.current) {
      setBusy(true);
      setError(null);
    }
    try {
      const next = await action();
      if (next) accept(next);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      pendingActions.current -= 1;
      if (mounted.current) setBusy(pendingActions.current > 0);
    }
  }, [accept]);

  const runDisplay = useCallback(async (action: () => Promise<bridge.DisplayStatus>): Promise<void> => {
    // A ref takes effect before React renders the disabled button, blocking a
    // rapid second click while native window creation/destruction is pending.
    if (displayPending.current) return;
    displayPending.current = true;
    if (mounted.current) { setDisplayBusy(true); setError(null); }
    try {
      acceptDisplay(await action());
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      displayPending.current = false;
      if (mounted.current) setDisplayBusy(false);
    }
  }, [acceptDisplay]);

  const actions = useMemo(() => ({
    updateConfig: (config: Config) => run(() => bridge.updateConfig(config)),
    updatePresentation: (presentation: Presentation) => run(() => bridge.updatePresentation(presentation)),
    draw: () => run(bridge.draw),
    resetSession: () => run(bridge.resetSession),
    launchDisplay: () => runDisplay(bridge.launchDisplay),
    closeDisplay: () => runDisplay(bridge.closeDisplay),
    toggleDisplay: () => runDisplay(bridge.toggleDisplay),
  }), [run, runDisplay]);
  const clearError = useCallback(() => setError(null), []);

  return { snapshot, error, busy, displayOpen, displayBusy, actions, clearError };
}
