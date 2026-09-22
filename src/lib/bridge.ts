import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  createPreviewSnapshot,
  drawPreview,
  finishPreviewDraw,
  resetPreviewSession,
  updatePreviewConfig,
  updatePreviewPresentation,
  validateConfig,
  validatePresentation,
} from './preview-model';
import type { Config, Presentation, Snapshot } from './types';

export const isNative = typeof window !== 'undefined' && isTauri();
const STATE_EVENT = 'whizreveal://state';
const STORAGE_KEY = 'whizreveal.preview.v1';
const CHANNEL_NAME = 'whizreveal.preview.sync.v1';
const LOCK_NAME = 'whizreveal.preview.write.v1';
type StateListener = (snapshot: Snapshot) => void;

const previewListeners = new Set<StateListener>();
let previewChannel: BroadcastChannel | null = null;
let previewStarted = false;
let finishTimer: ReturnType<typeof setTimeout> | undefined;
let localWriteQueue: Promise<unknown> = Promise.resolve();
let displayWindow: Window | null = null;

function sessionId(): string {
  return globalThis.crypto.randomUUID();
}

function readStoredPreview(): Snapshot | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as Snapshot;
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.sessionId !== 'string') {
      throw new Error('Invalid session metadata.');
    }
    validateConfig(state.config);
    validatePresentation(state.presentation);
    if (!Array.isArray(state.history)) throw new Error('Invalid history.');
    for (const draw of state.history) {
      if (!Number.isSafeInteger(draw.id) || draw.id < 1 || !Number.isFinite(draw.createdAt)
        || !Array.isArray(draw.numbers) || draw.numbers.length < 1 || draw.numbers.length > 500
        || draw.numbers.some((value) => !Number.isInteger(value) || value < 1 || value > state.config.totalSamples)) {
        throw new Error('Invalid draw.');
      }
    }
    if (state.activeDraw !== null && (!state.activeDraw
      || !Number.isFinite(state.activeDraw.startedAt) || !Number.isFinite(state.activeDraw.durationMs)
      || state.activeDraw.durationMs <= 0 || state.activeDraw.draw?.id !== state.history[0]?.id)) {
      throw new Error('Invalid active draw.');
    }
    return state;
  } catch {
    throw new Error('The saved browser preview session is unreadable. Clear this site’s local storage to start a new preview.');
  }
}

function scheduleFinish(state: Snapshot): void {
  if (finishTimer !== undefined) clearTimeout(finishTimer);
  finishTimer = undefined;
  if (!state.activeDraw) return;
  const remaining = state.activeDraw.startedAt + state.activeDraw.durationMs - Date.now();
  finishTimer = setTimeout(() => {
    finishTimer = undefined;
    void withPreviewState((current) => current).catch((error: unknown) => {
      console.error('Could not finish the browser preview draw:', error);
    });
  }, Math.max(remaining, 0) + 5);
}

function deliverPreview(state: Snapshot): void {
  scheduleFinish(state);
  for (const listener of previewListeners) listener(state);
}

function receivePreviewChange(): void {
  try {
    const state = readStoredPreview();
    if (state) deliverPreview(state);
  } catch (error) {
    console.error('Could not synchronize the browser preview:', error);
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY && event.storageArea === window.localStorage) receivePreviewChange();
}

function startPreviewSync(): void {
  if (previewStarted) return;
  previewStarted = true;
  window.addEventListener('storage', onStorage);
  if (typeof BroadcastChannel !== 'undefined') {
    previewChannel = new BroadcastChannel(CHANNEL_NAME);
    previewChannel.addEventListener('message', receivePreviewChange);
  }
}

function persistPreview(state: Snapshot): void {
  // Commit the winners before notifying either window or starting the visual reveal.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  deliverPreview(state);
  previewChannel?.postMessage({ revision: state.revision });
}

async function withPreviewState(update: (current: Snapshot) => Snapshot): Promise<Snapshot> {
  startPreviewSync();
  const transaction = (): Snapshot => {
    const stored = readStoredPreview();
    const initial = stored ?? createPreviewSnapshot(sessionId());
    const current = finishPreviewDraw(initial, Date.now());
    if (!stored || current !== initial) persistPreview(current);
    const next = update(current);
    if (next !== current) persistPreview(next);
    else scheduleFinish(next);
    return next;
  };

  // Web Locks serialize read-modify-write transactions between controller tabs.
  if (navigator.locks) return navigator.locks.request(LOCK_NAME, transaction);
  // Older browsers still serialize actions in the current controller tab.
  const result = localWriteQueue.then(transaction, transaction);
  localWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function getSnapshot(): Promise<Snapshot> {
  if (isNative) return invoke<Snapshot>('get_snapshot');
  return withPreviewState((state) => state);
}

export async function updateConfig(config: Config): Promise<Snapshot> {
  if (isNative) return invoke<Snapshot>('update_config', { config });
  return withPreviewState((state) => updatePreviewConfig(state, config));
}

export async function updatePresentation(presentation: Presentation): Promise<Snapshot> {
  if (isNative) return invoke<Snapshot>('update_presentation', { presentation });
  return withPreviewState((state) => updatePreviewPresentation(state, presentation));
}

export async function draw(): Promise<Snapshot> {
  if (isNative) return invoke<Snapshot>('draw');
  return withPreviewState((state) => drawPreview(state, Date.now()));
}

export async function resetSession(): Promise<Snapshot> {
  if (isNative) return invoke<Snapshot>('reset_session');
  return withPreviewState((state) => resetPreviewSession(state, sessionId()));
}

export async function launchDisplay(): Promise<void> {
  if (isNative) return invoke<void>('launch_display');
  const url = new URL(window.location.href);
  url.searchParams.set('window', 'display');
  const opened = window.open(url.toString(), 'WhizRevealDisplay', 'popup,width=1280,height=800');
  if (!opened) throw new Error('The display window was blocked. Allow pop-ups for this preview and try again.');
  displayWindow = opened;
  opened.focus();
}

export async function closeDisplay(): Promise<void> {
  if (isNative) return invoke<void>('close_display');
  if (displayWindow && !displayWindow.closed) displayWindow.close();
  displayWindow = null;
}

export async function subscribe(listener: StateListener): Promise<() => void> {
  if (isNative) return listen<Snapshot>(STATE_EVENT, (event) => listener(event.payload));
  startPreviewSync();
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
    if (previewListeners.size === 0) {
      window.removeEventListener('storage', onStorage);
      previewChannel?.close();
      previewChannel = null;
      previewStarted = false;
    }
  };
}
