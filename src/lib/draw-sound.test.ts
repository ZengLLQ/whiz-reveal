import { describe, expect, it } from 'vitest';
import { DrawSoundTracker } from './draw-sound';
import { createPreviewSnapshot, drawPreview, finishPreviewDraw, resetPreviewSession } from './preview-model';

describe('draw sound lifecycle', () => {
  const drawing = () => drawPreview(createPreviewSnapshot('test'), 1000, () => 0);
  it('does not announce restored history', () => {
    expect(new DrawSoundTracker().update(finishPreviewDraw(drawing(), 3000))).toBe('stop');
  });
  it('announces completion once, even when snapshots repeat', () => {
    const tracker = new DrawSoundTracker();
    const active = drawing();
    expect(tracker.update(active)).toBe('shuffle');
    expect(tracker.update({ ...active, revision: active.revision + 1 })).toBe('shuffle');
    const done = finishPreviewDraw(active, 3000);
    expect(tracker.update(done)).toBe('reveal');
    expect(tracker.update(done)).toBe('stop');
  });
  it('does not play a winner cue on reset or session replacement', () => {
    const tracker = new DrawSoundTracker();
    tracker.update(drawing());
    expect(tracker.update(resetPreviewSession(finishPreviewDraw(drawing(), 3000), 'next'))).toBe('stop');
  });
});
