import { color, defineEffect, flag, num } from './model.js';
import { fade, lerp, makeWaves, mix, polygon, puff, skyBands, TAU, trace, waves, wrap, type Ctx, type Pt } from './vector.js';

/** Draw a six-armed snowflake outline at the origin of (x, y). */
function flake(ctx: Ctx, x: number, y: number, r: number, turn: number): void {
  for (let i = 0; i < 6; i++) {
    const a = turn + (i / 6) * TAU;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    const mx = x + Math.cos(a) * r * 0.6;
    const my = y + Math.sin(a) * r * 0.6;
    for (const side of [-0.9, 0.9]) {
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a + side) * r * 0.36, my + Math.sin(a + side) * r * 0.36);
    }
  }
}

/** A blizzard over a mountain valley: layered snowfall, gusts and a cabin holding out. */
export const snowstorm = defineEffect({
  id: 'snowstorm',
  name: 'Snow storm',
  params: [
    num('wind', 'Wind across per loop (minus = left)', 'Motion', 3, -6, 6),
    num('fall', 'Snow falling per loop', 'Motion', 2, 1, 5),
    num('sway', 'Tree sway', 'Motion', 1, 0, 3, 0.05),
    num('density', 'Snow amount', 'Snow', 1.7, 0.1, 3, 0.05),
    num('flakeSize', 'Flake size', 'Snow', 1, 0.4, 2.5, 0.05),
    num('gusts', 'Gust lines', 'Snow', 34, 0, 70),
    num('whiteout', 'Whiteout haze', 'Snow', 0.6, 0, 1, 0.01),
    flag('mountains', 'Show mountains', 'Scene', true),
    num('pines', 'Pine trees', 'Scene', 11, 0, 30),
    flag('cabin', 'Show cabin', 'Scene', true),
    color('skyTop', 'Sky top', '#3d5470'),
    color('skyBottom', 'Sky bottom', '#a9bccb'),
    color('mountain', 'Mountains', '#6c8199'),
    color('mountainShade', 'Mountain shade', '#536980'),
    color('snow', 'Ground snow', '#eef4f9'),
    color('snowShade', 'Snow shade', '#c3d3e2'),
    color('pine', 'Pines', '#2c4f4b'),
    color('wood', 'Cabin', '#6d4531'),
    color('window', 'Window light', '#ffc861'),
    color('flakeColor', 'Snowflakes', '#ffffff'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const wind = Math.round(p.wind);
    const fall = Math.round(p.fall);
    const gustSway = Math.sin(TAU * 2 * t) * 0.6 + Math.sin(TAU * 3 * t + 1) * 0.4;

    if (background) {
      skyBands(ctx, w, h, p.skyTop, p.skyBottom, 12);
      if (p.mountains) {
        const r = rand(1);
        const ridge = (base: number, count: number, tall: number, fill: string, shade: string) => {
          const peaks: Pt[] = [];
          for (let i = 0; i <= count; i++) peaks.push([(i / count) * (w + 40) - 20 + (r() - 0.5) * 20, base - tall * (0.45 + r() * 0.55)]);
          peaks.forEach((peak, i) => {
            const half = (w / count) * 0.95;
            const foot = base + 30;
            polygon(ctx, [[peak[0] - half, foot], peak, [peak[0] + half, foot]], fill);
            polygon(ctx, [peak, [peak[0] + half, foot], [peak[0] + half * 0.1, foot], [peak[0] + half * 0.05 * (i % 2 ? 1 : -1), peak[1] + (foot - peak[1]) * 0.5]], shade);
            const cap = 0.3;
            const cy = peak[1] + (foot - peak[1]) * cap;
            polygon(
              ctx,
              [peak, [peak[0] + half * cap, cy], [peak[0] + half * cap * 0.45, cy - 6], [peak[0] + half * cap * 0.05, cy + 5], [peak[0] - half * cap * 0.4, cy - 5], [peak[0] - half * cap, cy]],
              p.snow,
            );
          });
        };
        ridge(h * 0.55, 4, h * 0.34, mix(p.mountain, p.skyBottom, 0.55), mix(p.mountainShade, p.skyBottom, 0.55));
        ridge(h * 0.62, 3, h * 0.3, p.mountain, p.mountainShade);
      }
    }

    // Rolling snow fields, far to near.
    const r = rand(2);
    const field = (top: number, wobble: number, fill: string) => {
      const list = makeWaves(r, 3, 3, 0);
      const pts: Pt[] = [];
      for (let x = -20; x <= w + 20; x += 20) pts.push([x, top + waves(list, x / w, 0) * wobble]);
      ctx.fillStyle = fill;
      ctx.beginPath();
      trace(ctx, pts);
      ctx.lineTo(w + 20, h + 20);
      ctx.lineTo(-20, h + 20);
      ctx.closePath();
      ctx.fill();
      return (x: number) => top + waves(list, x / w, 0) * wobble;
    };
    const backSnow = background ? field(h * 0.68, 9, p.snowShade) : null;
    const frontSnow = background ? field(h * 0.78, 12, p.snow) : null;

    if (background && backSnow && frontSnow) {
      const pr = rand(3);
      const trees = Array.from({ length: Math.round(p.pines) }, () => ({ x: pr() * w, depth: pr(), phase: pr() * TAU })).sort((a, b) => a.depth - b.depth);
      for (const tree of trees) {
        const ground = tree.depth < 0.5 ? backSnow(tree.x) : frontSnow(tree.x) + tree.depth * 18;
        const tall = lerp(34, 74, tree.depth);
        const lean = (p.sway * 0.05 + p.sway * 0.1 * Math.abs(wind) * 0.2) * (gustSway + Math.sin(TAU * 4 * t + tree.phase) * 0.35) * Math.sign(wind || 1);
        ctx.save();
        ctx.transform(1, 0, -lean, 1, tree.x, ground);
        ctx.fillStyle = mix(p.wood, '#000000', 0.25);
        ctx.fillRect(-2, -8, 4, 9);
        for (let tier = 0; tier < 3; tier++) {
          const top = -tall + (tier * tall) / 3.6;
          const bottom = top + tall * 0.5;
          const half = tall * (0.17 + tier * 0.075);
          const shade = mix(p.pine, p.skyBottom, (1 - tree.depth) * 0.35);
          polygon(ctx, [[0, top], [half, bottom], [0, bottom + 2], [-half, bottom]], shade);
          polygon(ctx, [[0, top], [half * 0.62, top + (bottom - top) * 0.62], [half * 0.2, top + (bottom - top) * 0.5], [0, top + (bottom - top) * 0.66], [-half * 0.25, top + (bottom - top) * 0.5], [-half * 0.62, top + (bottom - top) * 0.62]], p.snow);
        }
        ctx.restore();
      }

      if (p.cabin) {
        const x = w * 0.68;
        const y = frontSnow(x) + 4;
        const cw = 62;
        const ch = 32;
        ctx.fillStyle = p.wood;
        ctx.fillRect(x, y - ch, cw, ch);
        ctx.strokeStyle = mix(p.wood, '#000000', 0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 6; i++) {
          ctx.moveTo(x, y - (i * ch) / 6);
          ctx.lineTo(x + cw, y - (i * ch) / 6);
        }
        ctx.stroke();
        ctx.fillStyle = mix(p.wood, '#000000', 0.4);
        ctx.fillRect(x + cw - 17, y - 22, 12, 22);
        // The window flickers like a fire behind it.
        const flicker = 0.75 + 0.25 * Math.sin(TAU * 9 * t) * Math.sin(TAU * 5 * t + 1);
        ctx.fillStyle = fade(p.window, 0.22 * flicker);
        ctx.beginPath();
        ctx.arc(x + 20, y - 16, 22, 0, TAU);
        ctx.fill();
        ctx.fillStyle = mix(p.wood, p.window, 0.35 + 0.65 * flicker);
        ctx.fillRect(x + 11, y - 24, 18, 14);
        ctx.fillStyle = mix(p.wood, '#000000', 0.5);
        ctx.fillRect(x + 19.2, y - 24, 1.6, 14);
        ctx.fillRect(x + 11, y - 17.8, 18, 1.6);
        ctx.fillStyle = mix(p.wood, '#000000', 0.25);
        ctx.fillRect(x + 44, y - ch - 24, 9, 22);
        polygon(ctx, [[x - 9, y - ch], [x + cw / 2, y - ch - 26], [x + cw + 9, y - ch]], mix(p.wood, '#000000', 0.45));
        polygon(ctx, [[x - 12, y - ch + 1], [x + cw / 2, y - ch - 30], [x + cw + 12, y - ch + 1], [x + cw + 2, y - ch - 3], [x + cw * 0.7, y - ch - 6], [x + cw * 0.45, y - ch - 3], [x + cw * 0.2, y - ch - 7], [x + 2, y - ch - 2]], p.snow);
        const sr = rand(4);
        for (let i = 0; i < 9; i++) {
          const life = wrap(sr() + t * 2);
          const px = x + 48.5 + Math.sign(wind || 1) * life * life * 62;
          const py = y - ch - 26 - life * 38;
          ctx.fillStyle = fade('#e6e9ee', 0.75 * (1 - life));
          ctx.beginPath();
          puff(ctx, px, py, 3 + life * 11, life * 3 + i, 6);
          ctx.fill();
        }
      }
    }

    // Drifting bands of blown snow.
    if (p.whiteout > 0) {
      const hr = rand(5);
      for (let i = 0; i < 3; i++) {
        const top = makeWaves(hr, 3, 3, 0);
        const bottom = makeWaves(hr, 3, 3, 0);
        const cy = h * (0.42 + i * 0.2);
        const span = 26 + i * 8;
        const move = (wind || 1) * (i + 1) * t;
        const upper: Pt[] = [];
        const lower: Pt[] = [];
        for (let x = -10; x <= w + 10; x += 16) {
          upper.push([x, cy - span + waves(top, x / w - move, 0) * 22]);
          lower.unshift([x, cy + span + waves(bottom, x / w - move, 0) * 22]);
        }
        ctx.fillStyle = fade(p.flakeColor, p.whiteout * (0.3 + i * 0.1));
        ctx.beginPath();
        trace(ctx, [...upper, ...lower], true);
        ctx.fill();
      }
    }

    // Gusts: long curved lines racing with the wind.
    const gr = rand(6);
    ctx.lineCap = 'round';
    for (let i = 0; i < p.gusts; i++) {
      const y = gr() * h;
      const x0 = gr();
      const length = 40 + gr() * 90;
      const lift = (gr() - 0.5) * 26;
      const curl = gr() < 0.35;
      const speed = (wind === 0 ? 1 : wind) * (1 + Math.floor(gr() * 2));
      const dir = Math.sign(speed);
      const x = wrap(x0 + speed * t) * (w + length * 2) - length;
      ctx.strokeStyle = fade(p.flakeColor, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - (dir * length) / 2, y);
      ctx.quadraticCurveTo(x, y + lift, x + (dir * length) / 2, y);
      if (curl) ctx.arc(x + (dir * length) / 2, y - 6, 6, Math.PI / 2, dir > 0 ? -Math.PI / 2 - 1.2 : -Math.PI / 2 + 4.3, dir > 0);
      ctx.stroke();
    }

    // Snowflakes in three depths: far dots, middle dots, near six-armed flakes.
    const layers = [
      { n: 150, mul: 1, min: 0.7, max: 1.3, opacity: 0.6 },
      { n: 95, mul: 2, min: 1.5, max: 2.5, opacity: 0.85 },
      { n: 34, mul: 3, min: 4, max: 7, opacity: 1 },
    ];
    layers.forEach((layer, index) => {
      const fr = rand(10 + index);
      const margin = 12;
      ctx.fillStyle = fade(p.flakeColor, layer.opacity);
      ctx.strokeStyle = fade(p.flakeColor, layer.opacity);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < layer.n * p.density; i++) {
        const x0 = fr();
        const y0 = fr();
        const size = lerp(layer.min, layer.max, fr()) * p.flakeSize;
        const swing = fr() * TAU;
        const spin = (fr() < 0.5 ? -1 : 1) * (1 + Math.floor(fr() * 2));
        const start = fr() * TAU;
        const x = wrap(x0 + wind * layer.mul * t) * (w + margin * 2) - margin + Math.sin(TAU * 3 * t + swing) * 6;
        const y = wrap(y0 + fall * layer.mul * t) * (h + margin * 2) - margin;
        if (index === 2) {
          flake(ctx, x, y, size, start + TAU * spin * t);
        } else {
          ctx.moveTo(x + size, y);
          ctx.arc(x, y, size, 0, TAU);
        }
      }
      if (index === 2) ctx.stroke();
      else ctx.fill();
    });
  },
});
