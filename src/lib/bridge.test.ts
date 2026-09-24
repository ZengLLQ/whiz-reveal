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
  native.invoke.mockReset();
  native.listen.mockReset();
  popup.mockReset();
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

});

function createDisplayPopup(closeDelay = 0) {
  const display = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(() => {
      if (closeDelay) setTimeout(() => { display.closed = true; }, closeDelay);
      else display.closed = true;
    }),
  };
  return display;
}

describe('preview display lifecycle', () => {
  it('toggles open, closed and open again without changing the raffle session', async () => {
    const first = createDisplayPopup();
    const second = createDisplayPopup();
    popup.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const bridge = await import('./bridge');
    const onStatus = vi.fn();
    const stop = await bridge.subscribeDisplayStatus(onStatus);
    expect(await bridge.getDisplayStatus()).toEqual({ open: false, revision: 0 });
    const opening = bridge.toggleDisplay();
    // A browser popup must be opened during the click, before any await.
    expect(popup).toHaveBeenCalledWith(
      'http://localhost:1420/?window=display', 'WhizRevealDisplay', 'popup,width=1280,height=800',
    );
    expect(await opening).toEqual({ open: true, revision: 1 });
    expect(await bridge.toggleDisplay()).toEqual({ open: false, revision: 2 });
    expect(first.close).toHaveBeenCalledOnce();
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 3 });
    expect(second.focus).toHaveBeenCalledOnce();
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      { open: true, revision: 1 }, { open: false, revision: 2 }, { open: true, revision: 3 },
    ]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    stop();
  });

  it('reuses an existing display without a duplicate window or status event', async () => {
    const display = createDisplayPopup();
    popup.mockReturnValueOnce(display);
    const bridge = await import('./bridge');
    const onStatus = vi.fn();
    const stop = await bridge.subscribeDisplayStatus(onStatus);
    expect(await bridge.launchDisplay()).toEqual({ open: true, revision: 1 });
    expect(await bridge.launchDisplay()).toEqual({ open: true, revision: 1 });
    expect(popup).toHaveBeenCalledOnce();
    expect(display.focus).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledOnce();
    stop();
  });

  it('notifies the controller after a manual popup close and allows reopening', async () => {
    const first = createDisplayPopup();
    popup.mockReturnValueOnce(first).mockReturnValueOnce(createDisplayPopup());
    const bridge = await import('./bridge');
    const onStatus = vi.fn();
    const stop = await bridge.subscribeDisplayStatus(onStatus);
    await bridge.toggleDisplay();
    first.closed = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(onStatus).toHaveBeenLastCalledWith({ open: false, revision: 2 });
    expect(vi.getTimerCount()).toBe(0);
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 3 });
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for delayed destruction and coalesces concurrent toggle requests', async () => {
    const display = createDisplayPopup(200);
    popup.mockReturnValueOnce(display);
    const bridge = await import('./bridge');
    await bridge.toggleDisplay();
    const closing = bridge.toggleDisplay();
    const repeated = bridge.toggleDisplay();
    expect(repeated).toBe(closing);
    expect(display.close).toHaveBeenCalledOnce();
    expect(await bridge.getDisplayStatus()).toEqual({ open: true, revision: 1 });
    await vi.advanceTimersByTimeAsync(200);
    expect(await closing).toEqual({ open: false, revision: 2 });
    expect(popup).toHaveBeenCalledOnce();
  });

  it('reports blocked pop-ups and releases the toggle for a later retry', async () => {
    popup.mockReturnValueOnce(null).mockReturnValueOnce(createDisplayPopup());
    const bridge = await import('./bridge');
    await expect(bridge.toggleDisplay()).rejects.toThrow('Allow pop-ups');
    expect(await bridge.getDisplayStatus()).toEqual({ open: false, revision: 0 });
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 1 });
  });

  it('reports a refused close without claiming the display is closed', async () => {
    const display = createDisplayPopup();
    display.close.mockImplementation(() => undefined);
    popup.mockReturnValueOnce(display);
    const bridge = await import('./bridge');
    await bridge.toggleDisplay();
    const closing = expect(bridge.toggleDisplay()).rejects.toThrow('The display could not close');
    await vi.advanceTimersByTimeAsync(5_000);
    await closing;
    expect(await bridge.getDisplayStatus()).toEqual({ open: true, revision: 1 });
    display.closed = true;
    expect(await bridge.getDisplayStatus()).toEqual({ open: false, revision: 2 });
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

  it('uses native lifecycle status for open-close-reopen instead of browser popups', async () => {
    native.enabled = true;
    native.invoke
      .mockResolvedValueOnce({ open: false, revision: 0 })
      .mockResolvedValueOnce({ open: true, revision: 1 })
      .mockResolvedValueOnce({ open: true, revision: 1 })
      .mockResolvedValueOnce({ open: false, revision: 2 })
      .mockResolvedValueOnce({ open: false, revision: 2 })
      .mockResolvedValueOnce({ open: true, revision: 3 });
    const bridge = await import('./bridge');
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 1 });
    expect(await bridge.toggleDisplay()).toEqual({ open: false, revision: 2 });
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 3 });
    expect(native.invoke.mock.calls.map(([command]) => command)).toEqual([
      'get_display_status', 'launch_display', 'get_display_status', 'close_display',
      'get_display_status', 'launch_display',
    ]);
    expect(popup).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous native toggles while the status request is in flight', async () => {
    native.enabled = true;
    let resolveStatus!: (status: { open: boolean; revision: number }) => void;
    native.invoke.mockReturnValueOnce(new Promise((resolve) => { resolveStatus = resolve; }))
      .mockResolvedValueOnce({ open: true, revision: 9 });
    const bridge = await import('./bridge');
    const first = bridge.toggleDisplay();
    const second = bridge.toggleDisplay();
    expect(second).toBe(first);
    expect(native.invoke).toHaveBeenCalledOnce();
    resolveStatus({ open: false, revision: 8 });
    expect(await first).toEqual({ open: true, revision: 9 });
    expect(native.invoke).toHaveBeenCalledTimes(2);
  });

  it('forwards native display event revisions and returns its unsubscriber', async () => {
    native.enabled = true;
    const unsubscribe = vi.fn();
    native.listen.mockResolvedValueOnce(unsubscribe);
    const bridge = await import('./bridge');
    const onStatus = vi.fn();
    const stop = await bridge.subscribeDisplayStatus(onStatus);
    expect(native.listen).toHaveBeenCalledWith('whizreveal://display', expect.any(Function));
    const listener = native.listen.mock.calls[0][1];
    listener({ payload: { open: true, revision: 1 } });
    listener({ payload: { open: false, revision: 2 } });
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      { open: true, revision: 1 }, { open: false, revision: 2 },
    ]);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('surfaces native lifecycle failures and retries through IPC', async () => {
    native.enabled = true;
    native.invoke.mockRejectedValueOnce(new Error('Display permission denied'))
      .mockResolvedValueOnce({ open: false, revision: 0 })
      .mockResolvedValueOnce({ open: true, revision: 1 });
    const bridge = await import('./bridge');
    await expect(bridge.toggleDisplay()).rejects.toThrow('Display permission denied');
    expect(await bridge.toggleDisplay()).toEqual({ open: true, revision: 1 });
    expect(popup).not.toHaveBeenCalled();
  });
});
