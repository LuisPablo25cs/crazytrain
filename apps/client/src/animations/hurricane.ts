import { color, defineEffect, flag, num } from './model.js';
import { bolt, fade, lerp, makeWaves, puff, TAU, trace, waves, wrap, type Pt } from './vector.js';

/** A hurricane seen from a satellite: spiral cloud arms turning around a clear eye. */
export const hurricane = defineEffect({
  id: 'hurricane',
  name: 'Hurricane',
  params: [
    num('size', 'Storm size', 'Shape', 1, 0.4, 1.5, 0.01),
    num('arms', 'Spiral arms', 'Shape', 3, 1, 8),
    num('winding', 'How tightly the arms wind', 'Shape', 0.8, 0.3, 2, 0.05),
    num('armWidth', 'Arm width', 'Shape', 1, 0.4, 1.8, 0.05),
    num('eye', 'Eye size', 'Shape', 1, 0.3, 2.5, 0.05),
    num('turns', 'Turns per loop (minus = clockwise)', 'Motion', 1, -3, 3),
    num('boil', 'Cloud edge churn', 'Motion', 3, 0, 8),
    num('inflow', 'Clouds pulled inward per loop', 'Motion', 2, 0, 6),
    num('puffs', 'Cloud puffs', 'Detail', 80, 0, 240),
    num('streaks', 'Wind streaks', 'Detail', 40, 0, 140),
    num('bolts', 'Lightning bolts', 'Detail', 4, 0, 14),
    flag('land', 'Show coastlines', 'Detail', true),
    color('ocean', 'Ocean', '#1d5f94'),
    color('oceanLight', 'Ocean currents', '#2a76ad'),
    color('landColor', 'Land', '#6f9a5b'),
    color('sand', 'Coast', '#d8c98e'),
    color('cloud', 'Cloud tops', '#f7fafc'),
    color('cloudMid', 'Cloud body', '#c5d3df'),
    color('cloudDeep', 'Cloud depth', '#8499ad'),
    color('eyeWall', 'Eye wall', '#6d8297'),
    color('flash', 'Lightning', '#fff3a8'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.58 * p.size;
    const eyeR = R * 0.075 * p.eye;
    const coreR = Math.max(R * 0.23, eyeR * 1.9);
    const arms = Math.round(p.arms);
    const spin = -TAU * Math.round(p.turns) * t;

    if (background) {
      ctx.fillStyle = p.ocean;
      ctx.fillRect(0, 0, w, h);
      const r = rand(1);
      ctx.fillStyle = p.oceanLight;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) puff(ctx, r() * w, r() * h, 18 + r() * 42, r() * TAU, 9);
      ctx.fill();
      ctx.strokeStyle = fade('#ffffff', 0.13);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = r() * w;
        const y = r() * h;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 6, y - 3, x + 13, y);
      }
      ctx.stroke();
      if (p.land) {
        const coast = (points: Pt[]) => {
          ctx.beginPath();
          trace(ctx, points, true);
          ctx.fillStyle = p.sand;
          ctx.strokeStyle = p.sand;
          ctx.lineWidth = 6;
          ctx.stroke();
          ctx.fillStyle = p.landColor;
          ctx.fill();
        };
        coast([[-60, h * 0.1], [w * 0.13, h * 0.03], [w * 0.2, h * 0.22], [w * 0.1, h * 0.36], [w * 0.14, h * 0.55], [-60, h * 0.7]]);
        coast([[w * 0.74, h + 60], [w * 0.76, h * 0.86], [w * 0.88, h * 0.74], [w * 0.95, h * 0.82], [w + 60, h * 0.66], [w + 60, h + 60]]);
      }
    }

    // Spiral radius and direction for a point partway out along an arm (s from 0 to 1).
    const radiusAt = (s: number) => lerp(coreR * 0.75, R, Math.pow(s, 1.08));
    const baseOf = (k: number) => spin + (k / arms) * TAU;
    const edge = Array.from({ length: arms }, (_, k) => {
      const r = rand(100 + k);
      return { a: makeWaves(r, 4, 11, p.boil), b: makeWaves(r, 4, 11, p.boil), reach: 0.86 + r() * 0.2 };
    });
    const armWidth = R * 0.27 * p.armWidth;

    const armPath = (k: number, widen: number, trim: number, dx = 0, dy = 0) => {
      const e = edge[k]!;
      const outer: Pt[] = [];
      const inner: Pt[] = [];
      const steps = 54;
      for (let i = 0; i <= steps; i++) {
        const along = i / steps;
        const s = along * e.reach * trim;
        const a = baseOf(k) + s * p.winding * TAU;
        const rad = radiusAt(s);
        const body = armWidth * widen * Math.pow(Math.sin(Math.PI * (0.06 + along * 0.94)), 0.8) * (1 - 0.45 * s);
        const o = 0.5 + 0.12 * waves(e.a, along, t);
        const q = 0.5 + 0.12 * waves(e.b, along, t);
        outer.push([cx + dx + Math.cos(a) * (rad + body * o), cy + dy + Math.sin(a) * (rad + body * o)]);
        inner.unshift([cx + dx + Math.cos(a) * (rad - body * q), cy + dy + Math.sin(a) * (rad - body * q)]);
      }
      ctx.beginPath();
      trace(ctx, [...outer, ...inner], true);
      ctx.fill();
    };

    const coreEdge = makeWaves(rand(50), 3, 13, p.boil);
    const corePath = (grow: number, dx = 0, dy = 0) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU;
        const rad = coreR * grow * (1 + 0.05 * waves(coreEdge, i / 72, t));
        pts.push([cx + dx + Math.cos(a + spin) * rad, cy + dy + Math.sin(a + spin) * rad]);
      }
      ctx.beginPath();
      trace(ctx, pts, true);
      ctx.moveTo(cx + dx + eyeR, cy + dy);
      ctx.arc(cx + dx, cy + dy, eyeR, 0, TAU, true);
      ctx.fill('evenodd');
    };

    // Shadow cast on the sea, then stacked cloud layers from deep to bright.
    ctx.fillStyle = fade('#0a2238', background ? 0.34 : 0);
    if (background) {
      for (let k = 0; k < arms; k++) armPath(k, 1.08, 1, 9, 11);
      corePath(1.15, 9, 11);
    }
    const layers: [string, number, number][] = [
      [p.cloudDeep, 1.12, 1],
      [p.cloudMid, 0.9, 0.97],
      [p.cloud, 0.56, 0.9],
    ];
    layers.forEach(([fill, widen, trim], layer) => {
      ctx.fillStyle = fill;
      for (let k = 0; k < arms; k++) armPath(k, widen, trim);
      corePath(1.32 - layer * 0.14);
    });

    // Puffs drifting in along the arms.
    const r = rand(2);
    for (let i = 0; i < p.puffs; i++) {
      const k = i % arms;
      const offset = r();
      const side = r() - 0.5;
      const size = 3 + r() * 8;
      const shade = r();
      const turn = r() * TAU;
      const s = 1 - wrap(offset + Math.round(p.inflow) * t);
      const a = baseOf(k) + s * p.winding * TAU;
      const rad = radiusAt(s) + side * armWidth * 0.8 * (1 - 0.4 * s);
      const scale = Math.sin(Math.PI * s);
      ctx.fillStyle = shade < 0.4 ? p.cloudMid : p.cloud;
      ctx.beginPath();
      puff(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, size * scale, turn + spin, 6);
      ctx.fill();
    }

    // Thin high cloud circling the storm.
    const sr = rand(3);
    ctx.lineCap = 'round';
    for (let i = 0; i < p.streaks; i++) {
      const rad = lerp(coreR * 1.1, R * 1.2, sr());
      const start = sr() * TAU + spin;
      const len = 0.15 + sr() * 0.5;
      ctx.strokeStyle = fade(p.cloud, 0.22 + sr() * 0.34);
      ctx.lineWidth = 0.7 + sr() * 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, start, start + len);
      ctx.stroke();
    }

    // The steep inner wall of the eye.
    const wall = (grow: number, fill: string) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const rad = eyeR * (grow + (grow - 1) * 0.3 * waves(coreEdge, i / 40, t));
        pts.push([cx + Math.cos(a + spin) * rad, cy + Math.sin(a + spin) * rad]);
      }
      ctx.fillStyle = fill;
      ctx.beginPath();
      trace(ctx, pts, true);
      ctx.moveTo(cx + eyeR, cy);
      ctx.arc(cx, cy, eyeR, 0, TAU, true);
      ctx.fill('evenodd');
    };
    wall(1.9, p.cloudMid);
    wall(1.5, p.cloudDeep);
    wall(1.2, p.eyeWall);

    const lr = rand(4);
    for (let i = 0; i < p.bolts; i++) {
      const when = lr();
      const s = 0.15 + lr() * 0.65;
      const k = Math.floor(lr() * arms);
      const angle = lr() * TAU;
      const seed = lr();
      const age = wrap(t - when);
      if (age > 0.05) continue;
      const a = baseOf(k) + s * p.winding * TAU;
      const rad = radiusAt(s);
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      ctx.fillStyle = fade(p.flash, 0.22);
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, TAU);
      ctx.fill();
      bolt(ctx, rand(1000 + Math.floor(seed * 999)), x, y, angle, 26, p.flash);
    }
  },
});
