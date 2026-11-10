import { color, defineEffect, flag, num } from './model.js';
import { bolt, fade, lerp, mix, polygon, puff, skyBands, TAU, trace, wrap, type Pt } from './vector.js';

/** A tornado crossing farmland: a twisting funnel under a dark wall cloud, flinging debris. */
export const tornado = defineEffect({
  id: 'tornado',
  name: 'Tornado',
  params: [
    num('height', 'Funnel height', 'Funnel', 1, 0.5, 1.3, 0.01),
    num('width', 'Funnel width', 'Funnel', 1, 0.5, 2, 0.05),
    num('bend', 'Funnel bend', 'Funnel', 1, 0, 2.5, 0.05),
    num('spin', 'Spins per loop', 'Motion', 6, 1, 16),
    num('sway', 'Sways per loop', 'Motion', 1, 0, 4),
    num('debris', 'Flying debris', 'Detail', 46, 0, 140),
    num('dust', 'Dust at the base', 'Detail', 22, 0, 60),
    num('rain', 'Rain streaks', 'Detail', 80, 0, 260),
    num('bolts', 'Lightning bolts', 'Detail', 2, 0, 8),
    flag('farm', 'Show farm', 'Scene', true),
    color('skyTop', 'Sky top', '#2f3b3a'),
    color('skyBottom', 'Sky bottom', '#8c9a86'),
    color('cloud', 'Wall cloud', '#3d4646'),
    color('cloudLight', 'Cloud edges', '#5f6b67'),
    color('funnel', 'Funnel', '#7d847c'),
    color('funnelDark', 'Funnel shade', '#555c56'),
    color('field', 'Fields', '#7f8f4f'),
    color('fieldDark', 'Far fields', '#5f6f45'),
    color('barn', 'Barn', '#9b3b2a'),
    color('dustColor', 'Dust', '#9c8b6e'),
    color('flash', 'Lightning', '#eef3ff'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const ground = h * 0.8;
    const top = lerp(ground, h * 0.16, p.height);
    const sway = Math.sin(TAU * Math.round(p.sway) * t);
    const baseX = w * 0.5 + sway * w * 0.08;
    const topX = w * 0.55;
    // The funnel's center line at height k (0 at the ground, 1 at the cloud).
    const axis = (k: number): Pt => {
      const x = lerp(baseX, topX, k) + Math.sin(k * Math.PI) * 26 * p.bend * (0.6 + 0.4 * sway);
      return [x, lerp(ground, top, k)];
    };
    const radius = (k: number) => (5 + Math.pow(k, 1.8) * 46) * p.width;
    const spin = TAU * Math.round(p.spin) * t;

    if (background) {
      skyBands(ctx, w, h, p.skyTop, p.skyBottom, 12);
      ctx.fillStyle = p.fieldDark;
      ctx.beginPath();
      trace(ctx, [[-10, ground - 14], [w * 0.3, ground - 22], [w * 0.62, ground - 12], [w + 10, ground - 20]]);
      ctx.lineTo(w + 10, h + 10);
      ctx.lineTo(-10, h + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.field;
      ctx.fillRect(-10, ground, w + 20, h - ground + 10);
      ctx.strokeStyle = mix(p.field, '#000000', 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -8; i <= 8; i++) {
        ctx.moveTo(w / 2 + i * 6, ground);
        ctx.lineTo(w / 2 + i * 70, h + 10);
      }
      ctx.stroke();
      if (p.farm) {
        const lean = 0.18 * (0.6 + 0.4 * Math.sin(TAU * 3 * t));
        const bx = w * 0.14;
        polygon(ctx, [[bx, ground + 2], [bx + 48, ground + 2], [bx + 48, ground - 26], [bx + 24, ground - 42], [bx, ground - 26]], p.barn);
        polygon(ctx, [[bx - 4, ground - 25], [bx + 24, ground - 45], [bx + 52, ground - 25], [bx + 48, ground - 22], [bx + 24, ground - 39], [bx, ground - 22]], mix(p.barn, '#000000', 0.45));
        ctx.fillStyle = '#efe6d2';
        ctx.fillRect(bx + 17, ground - 18, 14, 20);
        ctx.strokeStyle = p.barn;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx + 17, ground - 18);
        ctx.lineTo(bx + 31, ground + 2);
        ctx.moveTo(bx + 31, ground - 18);
        ctx.lineTo(bx + 17, ground + 2);
        ctx.stroke();
        for (const tx of [w * 0.82, w * 0.9]) {
          ctx.save();
          ctx.transform(1, 0, -lean, 1, tx, ground);
          ctx.fillStyle = '#4b3a2b';
          ctx.fillRect(-1.5, -18, 3, 18);
          ctx.fillStyle = mix(p.field, '#000000', 0.35);
          ctx.beginPath();
          puff(ctx, 0, -26, 12, 0.4, 6);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = '#4b3a2b';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          ctx.moveTo(w * 0.62 + i * 12, ground + 14);
          ctx.lineTo(w * 0.62 + i * 12, ground + 4);
        }
        ctx.moveTo(w * 0.62, ground + 7);
        ctx.lineTo(w * 0.62 + 96, ground + 7);
        ctx.stroke();
      }
    }

    // Debris orbits the funnel; pieces behind it are drawn first.
    const dr = rand(1);
    const debris = Array.from({ length: p.debris }, () => {
      const k = 0.05 + dr() * 0.7;
      const phase = dr() * TAU;
      const speed = 1 + Math.floor(dr() * 2);
      const size = 1 + dr() * 2.6;
      const tone = dr();
      const a = phase + spin * speed;
      const [ax, ay] = axis(k);
      const reach = radius(k) * (1.25 + 0.35 * Math.sin(phase * 3));
      return { x: ax + Math.cos(a) * reach, y: ay + Math.sin(a) * reach * 0.22, front: Math.sin(a) > 0, size, tone, a };
    });
    const drawDebris = (front: boolean) => {
      for (const d of debris.filter((x) => x.front === front)) {
        const c = Math.cos(d.a);
        polygon(ctx, [[d.x - d.size * c, d.y - d.size], [d.x + d.size, d.y - d.size * 0.4 * c], [d.x + d.size * 0.3, d.y + d.size]], mix('#3b2f25', p.dustColor, d.tone));
      }
    };
    drawDebris(false);

    // The funnel: stacked bands that slide sideways as it spins.
    const rings = 26;
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= rings; i++) {
      const k = i / rings;
      const [x, y] = axis(k);
      const r = radius(k);
      left.push([x - r, y]);
      right.unshift([x + r, y]);
    }
    ctx.fillStyle = p.funnel;
    ctx.beginPath();
    trace(ctx, [...left, ...right], true);
    ctx.fill();
    for (let i = 1; i < rings; i++) {
      const k = i / rings;
      const [x, y] = axis(k);
      const r = radius(k);
      const offset = Math.sin(spin + k * 9) * r * 0.5;
      ctx.strokeStyle = fade(i % 2 ? p.funnelDark : mix(p.funnel, '#ffffff', 0.25), 0.8);
      ctx.lineWidth = 1.6 + k * 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.9 + offset * 0.2, y + 1.5);
      ctx.quadraticCurveTo(x + offset, y + 4 + k * 4, x + r * 0.9 + offset * 0.2, y + 1.5);
      ctx.stroke();
    }
    drawDebris(true);

    // Dust kicked up where the funnel meets the ground.
    const pr = rand(2);
    for (let i = 0; i < p.dust; i++) {
      const life = wrap(pr() + t * 3);
      const side = pr() < 0.5 ? -1 : 1;
      const out = pr();
      const x = baseX + side * (8 + life * (30 + out * 50));
      const y = ground + 2 - life * (10 + out * 26);
      ctx.fillStyle = fade(p.dustColor, 0.85 * (1 - life * 0.8));
      ctx.beginPath();
      puff(ctx, x, y, 6 + life * 14, life * 3 + i, 6);
      ctx.fill();
    }

    // The wall cloud the funnel hangs from.
    const cr = rand(3);
    ctx.fillStyle = p.cloud;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const x = wrap(cr() + t) * (w + 120) - 60;
      puff(ctx, x, top - 18 + cr() * 22, 24 + cr() * 22, cr() * TAU, 7);
    }
    ctx.fill();
    ctx.fillRect(-10, -10, w + 20, top - 26);
    ctx.fillStyle = p.cloudLight;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = wrap(cr() + t) * (w + 120) - 60;
      puff(ctx, x, top - 8 + cr() * 8, 10 + cr() * 9, cr() * TAU, 6);
    }
    ctx.fill();

    const lr = rand(4);
    for (let i = 0; i < p.bolts; i++) {
      const when = lr();
      const x = lr() * w;
      const seed = Math.floor(lr() * 999);
      if (wrap(t - when) > 0.05) continue;
      ctx.fillStyle = fade(p.flash, 0.16);
      ctx.fillRect(0, 0, w, h);
      bolt(ctx, rand(1000 + seed), x, top - 10, Math.PI / 2 + 0.2, (ground - top) * 0.8, p.flash, 1.8);
    }

    const rr = rand(5);
    ctx.strokeStyle = fade('#cfd8dc', 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < p.rain; i++) {
      const x = wrap(rr() + t * 2) * (w + 40) - 20;
      const y = wrap(rr() + t * 6) * (h + 20) - 10;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 13);
    }
    ctx.stroke();
  },
});
