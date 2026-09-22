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
  const latest = useRef<Snapshot | null>(null);
  const mounted = useRef(false);
  const pendingActions = useRef(0);

  const accept = useCallback((incoming: Snapshot) => {
    if (!mounted.current || !isNewerSnapshot(latest.current, incoming)) return;
    latest.current = incoming;
    setSnapshot(incoming);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
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
    return () => {
      cancelled = true;
      mounted.current = false;
      unlisten?.();
    };
  }, [accept]);

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

  const actions = useMemo(() => ({
    updateConfig: (config: Config) => run(() => bridge.updateConfig(config)),
    updatePresentation: (presentation: Presentation) => run(() => bridge.updatePresentation(presentation)),
    draw: () => run(bridge.draw),
    resetSession: () => run(bridge.resetSession),
    launchDisplay: () => run(bridge.launchDisplay),
    closeDisplay: () => run(bridge.closeDisplay),
  }), [run]);
  const clearError = useCallback(() => setError(null), []);

  return { snapshot, error, busy, actions, clearError };
}
