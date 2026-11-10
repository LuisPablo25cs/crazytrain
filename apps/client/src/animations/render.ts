import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { frameCount, type Effect, type Output, type Values } from './model.js';
import { makeRng } from './vector.js';

const DESIGN_WIDTH = 480;

/** Draw one moment of the loop (`t` from 0 up to 1) onto a canvas of the output size. */
export function renderFrame(ctx: CanvasRenderingContext2D, effect: Effect, values: Values, output: Output, t: number): void {
  const scale = output.width / DESIGN_WIDTH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const h = output.height / scale;
  ctx.clearRect(0, 0, DESIGN_WIDTH, h);
  // Keep the scene inside its frame even when the camera shakes.
  ctx.beginPath();
  ctx.rect(0, 0, DESIGN_WIDTH, h);
  ctx.clip();
  effect.draw({
    ctx,
    w: DESIGN_WIDTH,
    h,
    t,
    p: values,
    background: !output.transparent,
    rand: (salt) => makeRng(Math.imul(output.seed + 1, 7919) + Math.imul(salt + 1, 104729)),
  });
  ctx.restore();
}

const SAMPLE_FRAMES = 16;
const FORMAT = 'rgb565';

/**
 * Render the whole loop as a GIF. One palette serves every frame, which keeps flat colors from
 * flickering. A pixel is either solid or fully transparent, because GIF has nothing in between.
 */
export async function encodeGif(effect: Effect, values: Values, output: Output, onProgress: (done: number) => void): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const frames = frameCount(output);
  const pixels = (i: number) => {
    renderFrame(ctx, effect, values, output, i / frames);
    return ctx.getImageData(0, 0, output.width, output.height).data;
  };

  // Sampling fewer pixels on big GIFs keeps memory use about the same at any size.
  const stride = 4 * Math.max(2, Math.ceil((output.width * output.height) / 100_000));
  const solid: number[] = [];
  for (let s = 0; s < SAMPLE_FRAMES; s++) {
    const data = pixels(Math.floor((s / SAMPLE_FRAMES) * frames));
    for (let i = 0; i < data.length; i += stride) {
      if (data[i + 3]! >= 128) solid.push(data[i]!, data[i + 1]!, data[i + 2]!, 255);
    }
  }
  const colors = quantize(new Uint8Array(solid.length ? solid : [0, 0, 0, 255]), output.transparent ? 255 : 256, { format: FORMAT });
  const clear = colors.length;
  const palette = output.transparent ? [...colors, [0, 0, 0]] : colors;

  const gif = GIFEncoder();
  const delay = 1000 / output.fps;
  for (let i = 0; i < frames; i++) {
    const data = pixels(i);
    const index = applyPalette(data, colors, FORMAT);
    if (output.transparent) {
      for (let p = 0; p < index.length; p++) if (data[p * 4 + 3]! < 128) index[p] = clear;
    }
    gif.writeFrame(index, output.width, output.height, {
      palette,
      delay,
      ...(output.transparent ? { transparent: true, transparentIndex: clear, dispose: 2 } : {}),
    });
    onProgress((i + 1) / frames);
    // Let the page repaint its progress text.
    if (i % 8 === 0) await new Promise((r) => setTimeout(r));
  }
  gif.finish();
  return gif.bytes();
}
