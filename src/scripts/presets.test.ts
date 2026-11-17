import { describe, expect, it } from 'vitest';

import { applyContrast, DEFAULT_PRESET, findPreset, glyphFor, PRESETS } from './presets';

describe('PRESETS', () => {
  it('has the house braille first, then every Devault preset, each once', () => {
    expect(PRESETS[0].id).toBe(DEFAULT_PRESET);
    expect(PRESETS).toHaveLength(20);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it('falls back to the house braille for an unknown id', () => {
    expect(findPreset('nope').id).toBe(DEFAULT_PRESET);
    expect(findPreset(null).id).toBe(DEFAULT_PRESET);
    expect(findPreset('matrix').label).toBe('Digital rain');
  });
});

describe('glyphFor', () => {
  it('picks the densest glyph for full ink and the last for none', () => {
    expect(glyphFor('@%#*+=-:. ', 1)).toBe('@');
    expect(glyphFor('@%#*+=-:. ', 0)).toBe(' ');
    expect(glyphFor('10 ', 0.5)).toBe('0');
  });
});

describe('applyContrast', () => {
  it('spreads values from the midpoint and clamps them', () => {
    expect(applyContrast(0.5, 50)).toBe(0.5);
    expect(applyContrast(0.75, 100)).toBe(1);
    expect(applyContrast(0.25, 0)).toBe(0.25);
  });
});
