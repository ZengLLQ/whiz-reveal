import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSkipWelcome, writeSkipWelcome } from './welcome-preferences';

afterEach(() => vi.unstubAllGlobals());

describe('welcome preference', () => {
  it('starts with the welcome and lets a replay restore it on future launches', () => {
    const storage = new Map<string, string>([['whizreveal.preview.v1', 'session-data']]);
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
    expect(readSkipWelcome()).toBe(false);
    writeSkipWelcome(true);
    expect(readSkipWelcome()).toBe(true);
    writeSkipWelcome(false);
    expect(readSkipWelcome()).toBe(false);
    expect(storage.get('whizreveal.preview.v1')).toBe('session-data');
  });

  it('keeps the welcome available if settings storage is inaccessible or malformed', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'invalid' } });
    expect(readSkipWelcome()).toBe(false);
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', {
      get() { throw new Error('Storage blocked'); },
    }));
    expect(readSkipWelcome()).toBe(false);
    expect(() => writeSkipWelcome(true)).not.toThrow();
  });
});
