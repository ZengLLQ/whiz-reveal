import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }));

class PreviewChannel {
  static channels = new Set<PreviewChannel>();
  handlers = new Set<() => void>();
  constructor(readonly name: string) { PreviewChannel.channels.add(this); }
  addEventListener(_event: string, handler: () => void) { this.handlers.add(handler); }
  postMessage() {
    for (const channel of PreviewChannel.channels) {
      if (channel !== this && channel.name === this.name) {
        for (const handler of channel.handlers) handler();
      }
    }
  }
  close() { PreviewChannel.channels.delete(this); }
}

const saved = new Map<string, string>();
const localStorage = {
  getItem: vi.fn((key: string) => saved.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => saved.set(key, value)),
};
const popup = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  native.enabled = false;
  saved.clear();
  PreviewChannel.channels.clear();
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, transaction: () => unknown) => {
        const result = queue.then(transaction);
        queue = result.catch(() => undefined);
        return result;
      },
    },
  });
  vi.stubGlobal('window', {
    localStorage,
    location: { href: 'http://localhost:1420/' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    open: popup,
  });
  vi.stubGlobal('BroadcastChannel', PreviewChannel);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('preview synchronization', () => {
  it('persists committed winners and broadcasts the finished state to another window', async () => {
    const controller = await import('./bridge');
    await controller.getSnapshot();
    vi.resetModules();
    const display = await import('./bridge');
    const onDisplay = vi.fn();
    const stop = await display.subscribe(onDisplay);
    const drawing = await controller.draw();
    expect(onDisplay.mock.lastCall?.[0].activeDraw.draw.numbers).toEqual(drawing.history[0].numbers);
    expect(JSON.parse(saved.get('whizreveal.preview.v1')!).history).toEqual(drawing.history);
    await vi.advanceTimersByTimeAsync(1_610);
    const finished = await display.getSnapshot();
    expect(finished.activeDraw).toBeNull();
    expect(finished.history).toEqual(drawing.history);
    expect(onDisplay.mock.lastCall?.[0].activeDraw).toBeNull();
    expect(JSON.parse(saved.get('whizreveal.preview.v1')!).activeDraw).toBeNull();
    stop();
  });

  it('serializes simultaneous draws from separate controllers', async () => {
    const controllerOne = await import('./bridge');
    await controllerOne.getSnapshot();
    vi.resetModules();
    const controllerTwo = await import('./bridge');
    const results = await Promise.allSettled([controllerOne.draw(), controllerTwo.draw()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await controllerOne.getSnapshot()).history).toHaveLength(1);
  });

  it('recovers an interrupted animation using its persisted epoch deadline', async () => {
    const controller = await import('./bridge');
    const drawing = await controller.draw();
    const reloadTime = drawing.activeDraw!.startedAt + 5_000;
    // Vitest's clearAllTimers also resets the fake clock. Reload after the
    // persisted draw deadline instead of advancing that reset clock.
    vi.clearAllTimers();
    vi.setSystemTime(reloadTime);
    vi.resetModules();
    const reloaded = await import('./bridge');
    const recovered = await reloaded.getSnapshot();
    expect(recovered.activeDraw).toBeNull();
    expect(recovered.history).toEqual(drawing.history);
    expect(recovered.revision).toBeGreaterThan(drawing.revision);
  });

  it('reports blocked pop-ups clearly', async () => {
    popup.mockReturnValueOnce(null);
    const bridge = await import('./bridge');
    await expect(bridge.launchDisplay()).rejects.toThrow('Allow pop-ups');
  });

  it('launches a reusable display window with the correct route', async () => {
    const focus = vi.fn();
    const close = vi.fn();
    popup.mockReturnValueOnce({ focus, close, closed: false });
    const bridge = await import('./bridge');
    await bridge.launchDisplay();
    expect(popup).toHaveBeenCalledWith(
      'http://localhost:1420/?window=display', 'WhizRevealDisplay', 'popup,width=1280,height=800',
    );
    expect(focus).toHaveBeenCalledOnce();
    await bridge.closeDisplay();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('native authority', () => {
  it('surfaces IPC errors without creating a separate preview session', async () => {
    native.enabled = true;
    native.invoke.mockRejectedValueOnce(new Error('Backend unavailable'));
    const bridge = await import('./bridge');
    expect(bridge.isNative).toBe(true);
    await expect(bridge.getSnapshot()).rejects.toThrow('Backend unavailable');
    expect(native.invoke).toHaveBeenCalledWith('get_snapshot');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('surfaces event subscription errors instead of switching to browser synchronization', async () => {
    native.enabled = true;
    native.listen.mockRejectedValueOnce(new Error('Event permission denied'));
    const bridge = await import('./bridge');
    await expect(bridge.subscribe(vi.fn())).rejects.toThrow('Event permission denied');
    expect(native.listen).toHaveBeenCalledWith('whizreveal://state', expect.any(Function));
    expect(PreviewChannel.channels.size).toBe(0);
  });
});
