import type { Config, Presentation, Snapshot } from './types';

export const DRAW_DURATION_MS = 1_600;

export function createPreviewSnapshot(sessionId: string): Snapshot {
  return {
    revision: 0,
    sessionId,
    config: { totalSamples: 100, drawCount: 10, noDuplicates: true },
    presentation: { scale: 1, view: 'current' },
    history: [],
    activeDraw: null,
  };
}

export function validateConfig(config: Config): void {
  if (!Number.isInteger(config.totalSamples) || config.totalSamples < 1 || config.totalSamples > 1_000_000) {
    throw new Error('Total samples must be a whole number between 1 and 1,000,000.');
  }
  if (!Number.isInteger(config.drawCount) || config.drawCount < 1 || config.drawCount > 500) {
    throw new Error('Number of draws must be a whole number between 1 and 500.');
  }
  const duration = config.drawDurationMs ?? DRAW_DURATION_MS;
  if (!Number.isInteger(duration) || duration < 1000 || duration > 30000) throw new Error('Draw duration must be between 1 and 30 seconds.');
  if (typeof config.noDuplicates !== 'boolean') {
    throw new Error('No duplicates must be enabled or disabled.');
  }
}

export function validatePresentation(presentation: Presentation): void {
  if (!Number.isFinite(presentation.scale) || presentation.scale < 0.5 || presentation.scale > 2) {
    throw new Error('Display scale must be between 50% and 200%.');
  }
  if (presentation.view !== 'current' && presentation.view !== 'history') {
    throw new Error('Choose either the current draw or full history display view.');
  }
}

function assertIdle(snapshot: Snapshot): void {
  if (snapshot.activeDraw) throw new Error('Wait for the current draw to finish.');
}

export function updatePreviewConfig(snapshot: Snapshot, config: Config): Snapshot {
  assertIdle(snapshot);
  validateConfig(config);
  if (snapshot.history.length > 0 && config.totalSamples !== snapshot.config.totalSamples) {
    throw new Error('Reset the session before changing the total samples.');
  }
  return { ...snapshot, revision: snapshot.revision + 1, config: { ...config } };
}

export function updatePreviewPresentation(snapshot: Snapshot, presentation: Presentation): Snapshot {
  validatePresentation(presentation);
  return { ...snapshot, revision: snapshot.revision + 1, presentation: { ...presentation } };
}

/** Reject the biased tail of uint32 space before reducing it to the desired range. */
export function uniformRandomInt(maxExclusive: number, nextUint32 = (): number => {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0];
}): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new Error('The random range must be a positive uint32-sized integer.');
  }
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let value: number;
  do value = nextUint32(); while (value >= limit);
  return value % maxExclusive;
}

export function drawPreview(
  snapshot: Snapshot,
  now: number,
  randomInt: (maxExclusive: number) => number = uniformRandomInt,
): Snapshot {
  assertIdle(snapshot);
  validateConfig(snapshot.config);
  const { totalSamples, drawCount, noDuplicates } = snapshot.config;
  const numbers: number[] = [];
  if (noDuplicates) {
    // Include numbers from draws made while the constraint was disabled, too.
    const used = new Set(snapshot.history.flatMap((record) => record.numbers));
    const remaining = totalSamples - used.size;
    if (drawCount > remaining) {
      throw new Error(`Only ${remaining.toLocaleString('en-US')} number${remaining === 1 ? '' : 's'} remain. Reduce the number of draws or reset the session.`);
    }
    const available: number[] = [];
    for (let value = 1; value <= totalSamples; value += 1) {
      if (!used.has(value)) available.push(value);
    }
    // Partial Fisher-Yates gives each remaining number equal selection probability.
    for (let index = 0; index < drawCount; index += 1) {
      const selected = randomInt(available.length);
      numbers.push(available[selected]);
      available[selected] = available[available.length - 1];
      available.pop();
    }
  } else {
    for (let index = 0; index < drawCount; index += 1) numbers.push(randomInt(totalSamples) + 1);
  }
  const draw = { id: (snapshot.history[0]?.id ?? 0) + 1, numbers, createdAt: now };
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    history: [draw, ...snapshot.history],
    activeDraw: { draw, startedAt: now, durationMs: snapshot.config.drawDurationMs ?? DRAW_DURATION_MS },
  };
}

export function finishPreviewDraw(snapshot: Snapshot, now: number): Snapshot {
  const active = snapshot.activeDraw;
  if (!active || now < active.startedAt + active.durationMs) return snapshot;
  return { ...snapshot, revision: snapshot.revision + 1, activeDraw: null };
}

export function resetPreviewSession(snapshot: Snapshot, sessionId: string): Snapshot {
  assertIdle(snapshot);
  return { ...snapshot, revision: snapshot.revision + 1, sessionId, history: [], activeDraw: null };
}

/** All state writers share a monotonic revision, including a session reset. */
export function isNewerSnapshot(current: Snapshot | null, incoming: Snapshot): boolean {
  return current === null || incoming.revision > current.revision;
}
