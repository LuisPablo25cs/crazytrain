import { describe, expect, it } from 'vitest';
import { EFFECTS } from './index.js';
import { DEFAULT_OUTPUT, defaultValues, frameCount, mergeValues, type Effect, type ParamDef } from './model.js';
import { makeRng, makeWaves, mix, waves, wrap } from './vector.js';

const hurricane = EFFECTS.find((e) => e.id === 'hurricane') as Effect;

describe('animation settings', () => {
  it('has the six animations, each with unique settings and starting values inside their limits', () => {
    expect(EFFECTS.map((e) => e.id)).toEqual(['hurricane', 'snowstorm', 'tsunami', 'earthquake', 'volcano', 'tornado']);
    for (const e of EFFECTS) {
      expect(new Set(e.params.map((d) => d.key)).size).toBe(e.params.length);
      for (const d of e.params.filter((x): x is Extract<ParamDef, { kind: 'number' }> => x.kind === 'number')) {
        expect(d.value, `${e.id}.${d.key}`).toBeGreaterThanOrEqual(d.min);
        expect(d.value, `${e.id}.${d.key}`).toBeLessThanOrEqual(d.max);
      }
    }
  });

  it('keeps saved values, adds new settings and drops ones that no longer exist', () => {
    const merged = mergeValues(hurricane, { arms: 6, gone: 1, cloud: 12 });
    expect(merged.arms).toBe(6);
    expect(merged).not.toHaveProperty('gone');
    // A saved value of the wrong type falls back to the default.
    expect(merged.cloud).toBe(defaultValues(hurricane).cloud);
    expect(merged.size).toBe(defaultValues(hurricane).size);
  });

  it('turns seconds and frames per second into a frame count', () => {
    expect(frameCount({ ...DEFAULT_OUTPUT, seconds: 4, fps: 20 })).toBe(80);
    expect(frameCount({ ...DEFAULT_OUTPUT, seconds: 0, fps: 20 })).toBe(2);
  });
});

describe('drawing helpers', () => {
  it('repeats the same random numbers for the same seed', () => {
    const a = makeRng(5);
    const b = makeRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('makes wiggles that end exactly where they start, so loops have no jump', () => {
    const list = makeWaves(makeRng(3), 5, 7, 4);
    expect(waves(list, 0.37, 1)).toBeCloseTo(waves(list, 0.37, 0), 9);
    expect(waves(list, 1, 0.2)).toBeCloseTo(waves(list, 0, 0.2), 9);
  });

  it('wraps and mixes', () => {
    expect(wrap(1.25)).toBeCloseTo(0.25);
    expect(wrap(-0.25)).toBeCloseTo(0.75);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
