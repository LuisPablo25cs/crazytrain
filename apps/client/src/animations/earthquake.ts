import { color, defineEffect, flag, num } from './model.js';
import { clamp, fade, lerp, makeWaves, mix, polygon, puff, skyBands, TAU, waves, wrap, type Pt } from './vector.js';

/** A street cut open to show the fault: buildings whip, the ground splits, seismic waves spread. */
export const earthquake = defineEffect({
  id: 'earthquake',
  name: 'Earthquake',
  params: [
    num('intensity', 'Shake strength', 'Shaking', 5, 0, 16, 0.5),
    num('shakes', 'Shakes per loop', 'Shaking', 16, 4, 40),
    num('pause', 'Calm between quakes', 'Shaking', 0.15, 0, 0.7, 0.01),
    num('drop', 'Ground drop at the fault', 'Ground', 16, 0, 40),
    num('crack', 'Crack opening', 'Ground', 20, 0, 40),
    num('faultAt', 'Fault position', 'Ground', 0.52, 0.2, 0.8, 0.01),
    flag('rings', 'Seismic waves underground', 'Ground', true),
    num('buildings', 'Buildings', 'City', 7, 2, 12),
    num('dust', 'Dust clouds', 'City', 30, 0, 90),
    num('debris', 'Falling debris', 'City', 34, 0, 120),
    flag('poles', 'Power lines', 'City', true),
    color('skyTop', 'Sky top', '#a3c6d8'),
    color('skyBottom', 'Sky bottom', '#f4e4c4'),
    color('hill', 'Hills', '#9fb18b'),
    color('building', 'Buildings', '#b3836a'),
    color('building2', 'Buildings, alternate', '#7f8f9f'),
    color('windowColor', 'Windows', '#35495c'),
    color('topsoil', 'Topsoil', '#7c9151'),
    color('soil', 'Soil', '#8d6946'),
    color('clay', 'Clay', '#71513a'),
    color('rock', 'Bedrock', '#4d3d36'),
    color('ringColor', 'Seismic waves', '#ffb347'),
    color('dustColor', 'Dust', '#cdbb9b'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const span = Math.max(0.2, 1 - p.pause);
    const phase = (t - p.pause / 2) / span;
    const env = phase > 0 && phase < 1 ? Math.pow(Math.sin(Math.PI * phase), 1.1) : 0;
    const shakes = Math.round(p.shakes);
    const shake = (salt: number) => Math.sin(TAU * shakes * t + salt) * 0.7 + Math.sin(TAU * (shakes * 2 + 1) * t + salt * 2) * 0.3;

    const margin = 40;
    const ground = h * 0.56;
    const faultX = w * p.faultAt;
    const drop = p.drop * env;
    const swell = makeWaves(rand(1), 3, 5, shakes);
    const surface = (x: number) => ground + waves(swell, x / w, t) * 1.4 * env * (p.intensity / 5) + (x > faultX ? drop : 0);

    ctx.save();
    ctx.translate(shake(0) * p.intensity * env, shake(1.7) * p.intensity * 0.65 * env);

    if (background) {
      skyBands(ctx, w, h, p.skyTop, p.skyBottom, 12, margin);
      const hr = rand(2);
      ctx.fillStyle = p.hill;
      ctx.beginPath();
      ctx.moveTo(-margin, ground + 6);
      for (let x = -margin; x <= w + margin; x += 36) ctx.lineTo(x, ground - 20 - hr() * 34);
      ctx.lineTo(w + margin, ground + 80);
      ctx.lineTo(-margin, ground + 80);
      ctx.closePath();
      ctx.fill();
    }

    // Buildings: each floor swings a little further than the one below it.
    const br = rand(3);
    const count = Math.round(p.buildings);
    const tops: { x: number; y: number; half: number }[] = [];
    for (let i = 0; i < count; i++) {
      const bw = 34 + br() * 24;
      const floors = 4 + Math.floor(br() * 8);
      const fh = 11 + br() * 3;
      const x = ((i + 0.5) / count) * w + (br() - 0.5) * 12;
      const fill = br() < 0.5 ? p.building : p.building2;
      const tone = (br() - 0.5) * 0.2;
      const swing = br() * TAU;
      const roof = br();
      if (Math.abs(x - faultX) < bw / 2 + p.crack + 3) continue;
      const base = surface(x) + 3;
      const offset = (floor: number) => {
        const k = floor / floors;
        return env * p.intensity * (Math.sin(TAU * shakes * t + swing + k * 1.5) * Math.pow(k, 1.3) * 1.9);
      };
      const body = tone > 0 ? mix(fill, '#ffffff', tone) : mix(fill, '#000000', -tone);
      const side = mix(body, '#000000', 0.2);
      for (let f = 0; f < floors; f++) {
        const y0 = base - f * fh;
        const y1 = y0 - fh;
        const o0 = offset(f);
        const o1 = offset(f + 1);
        polygon(ctx, [[x - bw / 2 + o0, y0], [x + bw / 2 + o0, y0], [x + bw / 2 + o1, y1], [x - bw / 2 + o1, y1]], body);
        polygon(ctx, [[x + bw / 4 + o0, y0], [x + bw / 2 + o0, y0], [x + bw / 2 + o1, y1], [x + bw / 4 + o1, y1]], side);
        ctx.fillStyle = mix(body, '#000000', 0.32);
        ctx.fillRect(x - bw / 2 + o0, y0 - 0.7, bw, 0.9);
        ctx.fillStyle = p.windowColor;
        const cols = Math.floor(bw / 12);
        for (let c = 0; c < cols; c++) {
          if (Math.sin(i * 3.3 + f * 4.1 + c * 2.7) < -0.72) continue;
          const wx = x - bw / 2 + ((c + 0.5) / cols) * bw + (o0 + o1) / 2 - 2.8;
          ctx.fillRect(wx, y1 + 2.8, 5.6, fh - 5.4);
          if (Math.sin(i * 5.1 + f * 2.2 + c) > 0.55) {
            ctx.fillStyle = '#f2d68b';
            ctx.fillRect(wx, y1 + 2.8, 5.6, fh - 5.4);
            ctx.fillStyle = p.windowColor;
          }
        }
      }
      const topO = offset(floors);
      const topY = base - floors * fh;
      ctx.fillStyle = mix(body, '#000000', 0.4);
      ctx.fillRect(x - bw / 2 - 2 + topO, topY - 3, bw + 4, 3);
      if (roof < 0.4) {
        ctx.fillRect(x - 6 + topO * 1.1, topY - 13, 12, 10);
        ctx.fillRect(x - 8 + topO * 1.1, topY - 15, 16, 2.5);
      } else if (roof < 0.7) {
        ctx.fillRect(x + topO * 1.25, topY - 22, 1.3, 19);
      }
      // Cracks run down the wall once the shaking is strong.
      if (env > 0.3) {
        const cr = rand(40 + i);
        ctx.strokeStyle = '#2a211c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let cy = topY + 4;
        let cx = x + (cr() - 0.5) * bw * 0.6 + topO;
        ctx.moveTo(cx, cy);
        const reach = clamp((env - 0.3) / 0.7) * floors * fh * 0.7;
        while (cy < topY + 4 + reach) {
          cx += (cr() - 0.5) * 11;
          cy += 5 + cr() * 7;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      tops.push({ x, y: topY, half: bw / 2 });
    }

    if (p.poles) {
      const poleTop = (x: number) => surface(x) - 44;
      const xs = [w * 0.07, w * 0.33, w * 0.72, w * 0.95];
      const lean = (i: number) => Math.sin(TAU * shakes * t + i * 2) * env * p.intensity * 0.7;
      ctx.strokeStyle = '#3a2d25';
      ctx.lineWidth = 2.2;
      xs.forEach((x, i) => {
        ctx.beginPath();
        ctx.moveTo(x, surface(x) + 3);
        ctx.lineTo(x + lean(i), poleTop(x));
        ctx.moveTo(x - 8 + lean(i), poleTop(x) + 4);
        ctx.lineTo(x + 8 + lean(i), poleTop(x) + 4);
        ctx.stroke();
      });
      ctx.lineWidth = 0.9;
      for (let i = 0; i < xs.length - 1; i++) {
        for (const side of [-7, 7]) {
          const a = xs[i]!;
          const b = xs[i + 1]!;
          const sag = 14 + Math.sin(TAU * shakes * t + i) * env * 9;
          ctx.beginPath();
          ctx.moveTo(a + side + lean(i), poleTop(a) + 4);
          ctx.quadraticCurveTo((a + b) / 2, (poleTop(a) + poleTop(b)) / 2 + sag, b + side + lean(i + 1), poleTop(b) + 4);
          ctx.stroke();
        }
      }
    }

    // Layers of earth on each side of a jagged fault; the right side slips down.
    const fr = rand(5);
    const fault: Pt[] = [];
    for (let k = 0; k <= 9; k++) fault.push([faultX + k * 3.5 + (k === 0 ? 0 : (fr() - 0.5) * 10), lerp(ground - 30, h + margin, k / 9)]);
    const strata = [
      { top: 0, fill: p.topsoil },
      { top: 9, fill: p.soil },
      { top: 46, fill: p.clay },
      { top: 92, fill: p.rock },
    ];
    const lr = rand(6);
    const lines = strata.map(() => makeWaves(lr, 3, 4, 0));
    const earth = (right: boolean) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(right ? w + margin : -margin, -margin);
      fault.forEach(([x, y], k) => (k === 0 ? ctx.lineTo(x, -margin) : ctx.lineTo(x, y)));
      ctx.lineTo(right ? w + margin : -margin, h + margin);
      ctx.closePath();
      ctx.clip();
      strata.forEach((layer, i) => {
        ctx.fillStyle = layer.fill;
        ctx.beginPath();
        ctx.moveTo(-margin, h + margin + 30);
        for (let x = -margin; x <= w + margin; x += 8) {
          const y = i === 0 ? surface(x) : ground + layer.top + waves(lines[i]!, x / w, 0) * 5 + (right ? drop : 0);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w + margin, h + margin + 30);
        ctx.closePath();
        ctx.fill();
      });
      // Pebbles in the deep layers.
      const pr = rand(right ? 8 : 7);
      ctx.fillStyle = fade('#000000', 0.2);
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = pr() * w;
        const y = ground + 22 + pr() * (h - ground) + (right ? drop : 0);
        const size = 1 + pr() * 2.4;
        ctx.moveTo(x + size * 1.4, y);
        ctx.ellipse(x, y, size * 1.4, size, pr() * 3, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    };
    earth(false);
    earth(true);

    // Seismic waves spreading from the focus, only below ground.
    const focus = fault[7]!;
    if (p.rings && env > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-margin, ground + 8, w + margin * 2, h);
      ctx.clip();
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const k = wrap(i / 5 + t * 4);
        ctx.strokeStyle = fade(p.ringColor, (1 - k) * env * 0.9);
        ctx.beginPath();
        ctx.arc(focus[0], focus[1], 8 + k * w * 0.62, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = fade(p.ringColor, env);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const rad = (i % 2 ? 5 : 12) * (0.75 + 0.25 * Math.sin(TAU * shakes * t));
        const a = (i / 16) * TAU;
        const px = focus[0] + Math.cos(a) * rad;
        const py = focus[1] + Math.sin(a) * rad;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // The fault itself, and the wedge of the crack gaping open at the surface.
    ctx.strokeStyle = '#1e1613';
    ctx.lineWidth = 1.6 + env * 1.6;
    ctx.beginPath();
    fault.forEach(([x, y], k) => {
      if (k === 0) ctx.moveTo(x, surface(x - 1));
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (env > 0.01) {
      const gap = p.crack * env;
      const a = fault[0]!;
      const b = fault[1]!;
      const c = fault[2]!;
      const mouth = surface(faultX - 1) - 1;
      polygon(ctx, [[a[0] - gap / 2, mouth], [a[0] + gap / 2, mouth + drop], [b[0] + gap * 0.28, b[1]], [c[0], c[1] + 8 * env], [b[0] - gap * 0.3, b[1] + 4]], '#120c0a');
      const sr = rand(9);
      ctx.strokeStyle = '#1e1613';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) {
        const from = fault[1 + Math.floor(sr() * 6)]!;
        const dir = sr() < 0.5 ? -1 : 1;
        let x = from[0];
        let y = from[1];
        const steps = 2 + Math.floor(sr() * 3);
        ctx.beginPath();
        ctx.moveTo(x, y + (dir > 0 ? drop : 0));
        for (let k = 0; k < steps; k++) {
          x += dir * (6 + sr() * 12) * env;
          y += (sr() - 0.3) * 12 * env;
          ctx.lineTo(x, y + (dir > 0 ? drop : 0));
        }
        ctx.stroke();
      }
    }

    // Debris dropping from the rooftops, dust billowing at street level.
    const dr = rand(10);
    if (tops.length) {
      for (let i = 0; i < p.debris; i++) {
        const top = tops[Math.floor(dr() * tops.length)]!;
        const life = wrap(dr() + t * 3);
        const x0 = top.x + (dr() - 0.5) * top.half * 2;
        const vx = (dr() - 0.5) * 34;
        const size = 1.2 + dr() * 3.2;
        const turn = dr() * TAU;
        const shade = dr();
        const x = x0 + vx * life;
        const y = lerp(top.y, surface(x) + 2, life * life);
        const a = turn + life * 9;
        const s = size * clamp(env * 2.4);
        if (s < 0.15) continue;
        polygon(ctx, [0, 1.5, 2.8, 4.4].map((k): Pt => [x + Math.cos(a + k) * s, y + Math.sin(a + k) * s * 0.85]), mix(p.dustColor, '#3d3029', shade));
      }
    }
    for (let i = 0; i < p.dust; i++) {
      const x0 = dr() * w;
      const life = wrap(dr() + t * 2);
      const drift = (dr() - 0.5) * 40;
      const turn = dr() * TAU;
      const x = x0 + drift * life;
      const y = surface(x0) - 2 - life * 46;
      ctx.fillStyle = fade(p.dustColor, (1 - life) * 0.62 * env);
      ctx.beginPath();
      puff(ctx, x, y, (5 + life * 20) * clamp(env * 1.5), turn + life * 2, 7);
      ctx.fill();
    }
    ctx.restore();
  },
});
