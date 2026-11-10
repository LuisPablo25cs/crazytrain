/**
 * How an animation is described. To change an animation, edit its file in this folder: every
 * setting is one line in its `params` list, and the page builds the slider or color box from it.
 */

interface ParamBase<K extends string> {
  key: K;
  label: string;
  /** Heading the control appears under. */
  group: string;
}
export interface NumberParam<K extends string = string> extends ParamBase<K> {
  kind: 'number';
  value: number;
  min: number;
  max: number;
  step: number;
}
export interface ColorParam<K extends string = string> extends ParamBase<K> {
  kind: 'color';
  value: string;
}
export interface FlagParam<K extends string = string> extends ParamBase<K> {
  kind: 'flag';
  value: boolean;
}
export type ParamDef = NumberParam | ColorParam | FlagParam;
export type ParamValue = number | string | boolean;
export type Values = Record<string, ParamValue>;

/** A slider. Keep `step` at 1 for anything counted per loop, so the GIF loops without a jump. */
export function num<K extends string>(key: K, label: string, group: string, value: number, min: number, max: number, step = 1): NumberParam<K> {
  return { kind: 'number', key, label, group, value, min, max, step };
}
export function color<K extends string>(key: K, label: string, value: string, group = 'Colors'): ColorParam<K> {
  return { kind: 'color', key, label, group, value };
}
export function flag<K extends string>(key: K, label: string, group: string, value: boolean): FlagParam<K> {
  return { kind: 'flag', key, label, group, value };
}

type ValueOf<D> = D extends { kind: 'number' } ? number : D extends { kind: 'color' } ? string : boolean;
type ValuesOf<D extends readonly ParamDef[]> = { [P in D[number] as P['key']]: ValueOf<P> };

/** Everything an animation needs to draw one moment. */
export interface Frame<P> {
  ctx: CanvasRenderingContext2D;
  /** Drawing space: always 480 wide, so a scene looks the same at any export size. */
  w: number;
  h: number;
  /** Position in the loop, from 0 up to (not including) 1. */
  t: number;
  p: P;
  /** False when exporting with a transparent background: skip the sky and scenery. */
  background: boolean;
  /** A random number source that repeats exactly on every frame. Use a different salt per use. */
  rand: (salt: number) => () => number;
}

export interface Effect {
  id: string;
  name: string;
  params: readonly ParamDef[];
  draw: (frame: Frame<Values>) => void;
}

export function defineEffect<const D extends readonly ParamDef[]>(effect: {
  id: string;
  name: string;
  params: D;
  draw: (frame: Frame<ValuesOf<D>>) => void;
}): Effect {
  return effect as unknown as Effect;
}

/** Export settings shared by every animation. */
export interface Output {
  width: number;
  height: number;
  seconds: number;
  fps: number;
  seed: number;
  transparent: boolean;
}

export const DEFAULT_OUTPUT: Output = { width: 480, height: 360, seconds: 4, fps: 20, seed: 7, transparent: false };

export function defaultValues(effect: Effect): Values {
  return Object.fromEntries(effect.params.map((d) => [d.key, d.value]));
}

/** Saved values over the defaults, ignoring settings that no longer exist or changed type. */
export function mergeValues(effect: Effect, saved: Values | undefined): Values {
  const out = defaultValues(effect);
  for (const d of effect.params) {
    const v = saved?.[d.key];
    if (typeof v === typeof d.value) out[d.key] = v!;
  }
  return out;
}

export function frameCount(output: Output): number {
  return Math.max(2, Math.round(output.seconds * output.fps));
}
