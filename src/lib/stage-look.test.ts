import { describe, expect, it } from 'vitest';
import { stageLookFromSearch } from './stage-look';

describe('stage look', () => {
  it('switches to the physical comparison only for ?stage=physical', () => {
    expect(stageLookFromSearch('')).toBe('shader');
    expect(stageLookFromSearch('?stage=physical')).toBe('physical');
    expect(stageLookFromSearch('?window=display&stage=physical')).toBe('physical');
    expect(stageLookFromSearch('?stage=shader')).toBe('shader');
    expect(stageLookFromSearch('?stage=PHYSICAL')).toBe('shader');
  });
});
