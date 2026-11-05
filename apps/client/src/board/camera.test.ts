import { describe, expect, it } from 'vitest';
import { clampAxis } from './CameraRig.js';

describe('clampAxis', () => {
  // A 1000-unit map viewed with half the screen = 200 units, HUD panels of 50 units each side.
  it('stops the left map edge at the left panel', () => {
    expect(clampAxis(0, 1000, 200, 50, 50)).toBe(150);
  });

  it('stops the right map edge at the right panel', () => {
    expect(clampAxis(1000, 1000, 200, 50, 50)).toBe(850);
  });

  it('leaves a center inside the limits alone', () => {
    expect(clampAxis(500, 1000, 200, 50, 50)).toBe(500);
  });

  it('centers the map in the free area when the map is smaller than it', () => {
    // A 1400-unit screen with 100-unit panels leaves 1200 free: the map sits in the middle.
    expect(clampAxis(0, 1000, 700, 100, 100)).toBe(500);
    // A 1600-unit screen with a wider left panel: the free area's middle is 100 right of the
    // screen's middle, so the view center sits 100 left of the map's middle.
    expect(clampAxis(0, 1000, 800, 300, 100)).toBe(400);
  });
});
