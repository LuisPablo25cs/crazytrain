import { color, defineEffect, flag, num } from './model.js';
import { bolt, clamp, fade, lerp, mix, polygon, puff, skyBands, smooth, TAU, trace, wrap, type Pt } from './vector.js';

/** A volcano in full eruption: lava fountain, ash column, flying bombs and rivers of lava. */
export const volcano = defineEffect({
  id: 'volcano',
  name: 'Volcano',
  params: [
    num('plumeHeight', 'Ash column height', 'Eruption', 1, 0.3, 1.5, 0.01),
    num('plumeWidth', 'Ash column width', 'Eruption', 1, 0.4, 2, 0.05),
    num('puffs', 'Ash clouds', 'Eruption', 70, 10, 180),
    num('rise', 'Ash rising per loop', 'Eruption', 2, 1, 6),
    num('wind', 'Wind (minus = left)', 'Eruption', 0.35, -1, 1, 0.01),
    num('fountain', 'Lava fountain height', 'Lava', 1, 0, 2, 0.05),
    num('bombs', 'Lava bombs', 'Lava', 26, 0, 90),
    num('rivers', 'Lava rivers', 'Lava', 5, 0, 10),
    num('flow', 'Lava speed per loop', 'Lava', 3, 1, 8),
    num('ash', 'Falling ash', 'Detail', 90, 0, 300),
    num('bolts', 'Lightning in the ash', 'Detail', 3, 0, 12),
    flag('trees', 'Show foreground trees', 'Detail', true),
    color('skyTop', 'Sky top', '#2c2747'),
    color('skyBottom', 'Sky bottom', '#e0794e'),
    color('farHills', 'Far hills', '#553c58'),
    color('rock', 'Rock, lit side', '#5b4648'),
    color('rockDark', 'Rock, dark side', '#352a35'),
    color('ashDark', 'Ash dark', '#352f36'),
    color('ashLight', 'Ash light', '#8f8789'),
    color('lavaDeep', 'Lava deep', '#b81f12'),
    color('lava', 'Lava', '#f25c13'),
    color('lavaHot', 'Lava hot', '#ffd23e'),
    color('flash', 'Lightning', '#d6d9ff'),
    color('treeColor', 'Trees', '#1b1826'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const cx = w * 0.48;
    const craterY = h * 0.46;
    const craterHalf = 30;
    const baseY = h * 0.92;
    const baseHalf = w * 0.5;
    const flow = Math.round(p.flow);

    // A point on the mountain's flank: side is -1 or 1; s runs from the crater to the foot.
    const flank = (side: number, s: number): Pt => [cx + side * lerp(craterHalf, baseHalf, Math.pow(s, 1.55)), lerp(craterY, baseY, s)];
    const pulse = 0.82 + 0.18 * Math.sin(TAU * 3 * t) * Math.sin(TAU * 7 * t + 1);

    if (background) {
      skyBands(ctx, w, h, p.skyTop, p.skyBottom, 14);
      for (const [rad, opacity] of [[150, 0.1], [108, 0.13], [70, 0.17]] as const) {
        ctx.fillStyle = fade(p.lava, opacity * pulse);
        ctx.beginPath();
        ctx.arc(cx, craterY - 6, rad * pulse, 0, TAU);
        ctx.fill();
      }
      const r = rand(1);
      ctx.fillStyle = p.farHills;
      ctx.beginPath();
      const hills: Pt[] = [];
      for (let x = -20; x <= w + 20; x += 34) hills.push([x, h * 0.74 - r() * 42]);
      trace(ctx, hills);
      ctx.lineTo(w + 20, h + 10);
      ctx.lineTo(-20, h + 10);
      ctx.closePath();
      ctx.fill();
    }

    type Cloud = { life: number; x: number; y: number; size: number; turn: number; tone: number };
    const pr = rand(2);
    const rise = Math.round(p.rise);
    const clouds: Cloud[] = [];
    for (let i = 0; i < p.puffs; i++) {
      const life = wrap(pr() + rise * t);
      const side = pr() - 0.5;
      const big = 0.7 + pr() * 0.6;
      const turn = pr() * TAU;
      const tone = pr();
      const lift = Math.pow(life, 0.72);
      const spread = (12 + lift * 130) * p.plumeWidth;
      clouds.push({
        life,
        x: cx + side * spread + p.wind * life * life * w * 0.62,
        y: craterY - 8 - lift * h * 0.62 * p.plumeHeight,
        size: (9 + lift * 32) * big * Math.sqrt(p.plumeWidth) * smooth(0, 0.05, life),
        turn: turn + life * 2,
        tone,
      });
    }
    clouds.sort((a, b) => b.life - a.life);

    // The oldest clouds drift at the back; new ones glow from the fire beneath them.
    for (const c of clouds) {
      const body = mix(mix(p.ashDark, p.ashLight, c.tone * 0.55 + c.life * 0.25), p.lava, clamp(1 - c.life * 7) * 0.8);
      const fadeOut = 1 - smooth(0.82, 1, c.life);
      ctx.fillStyle = fade(body, fadeOut);
      ctx.beginPath();
      puff(ctx, c.x, c.y, c.size, c.turn, 8);
      ctx.fill();
      ctx.fillStyle = fade(mix(body, '#ffffff', 0.16), fadeOut);
      ctx.beginPath();
      puff(ctx, c.x - c.size * 0.2, c.y - c.size * 0.24, c.size * 0.58, c.turn + 1, 6);
      ctx.fill();
    }

    const lr = rand(3);
    for (let i = 0; i < p.bolts; i++) {
      const when = lr();
      const pick = lr();
      const dir = lr() * TAU;
      const seed = Math.floor(lr() * 999);
      if (wrap(t - when) > 0.05 || !clouds.length) continue;
      const c = clouds[Math.floor(pick * clouds.length * 0.7)]!;
      ctx.fillStyle = fade(p.flash, 0.2);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 20, 0, TAU);
      ctx.fill();
      bolt(ctx, rand(1000 + seed), c.x, c.y, Math.PI / 2 + Math.sin(dir) * 0.9, 58, p.flash, 1.8);
    }

    // The fountain, drawn as nested flames rising out of the crater.
    const fr = rand(4);
    const flames = Array.from({ length: 13 }, (_, i) => ({ x: lerp(-1, 1, i / 12), tall: 0.45 + fr() * 0.55, phase: fr() * TAU, c: 2 + Math.floor(fr() * 5) }));
    const fountain = (scale: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const f of flames) {
        const x = cx + f.x * craterHalf * 0.8;
        const top = (26 + 62 * f.tall * (0.72 + 0.28 * Math.sin(TAU * f.c * t + f.phase))) * p.fountain * scale * (1 - f.x * f.x * 0.55);
        ctx.moveTo(x - 7 * scale, craterY + 4);
        ctx.quadraticCurveTo(x - 4 * scale, craterY - top * 0.55, x + f.x * 6, craterY - top);
        ctx.quadraticCurveTo(x + 4 * scale, craterY - top * 0.55, x + 7 * scale, craterY + 4);
        ctx.closePath();
      }
      ctx.fill();
    };
    if (p.fountain > 0) {
      fountain(1, p.lavaDeep);
      fountain(0.74, p.lava);
      fountain(0.44, p.lavaHot);
    }

    // The mountain: a dark and a lit half, then rough facets and gullies.
    const outline: Pt[] = [];
    for (let i = 0; i <= 24; i++) outline.push(flank(-1, 1 - i / 24));
    outline.push([cx - craterHalf * 0.5, craterY + 6], [cx + craterHalf * 0.5, craterY + 6]);
    for (let i = 0; i <= 24; i++) outline.push(flank(1, i / 24));
    polygon(ctx, outline, p.rock);
    const shade: Pt[] = [[cx + 2, craterY + 6]];
    for (let i = 0; i <= 24; i++) shade.push(flank(1, i / 24));
    shade.push([cx + 10, baseY]);
    polygon(ctx, shade, p.rockDark);
    const mr = rand(5);
    for (let i = 0; i < 26; i++) {
      const side = mr() < 0.5 ? -1 : 1;
      const s0 = 0.08 + mr() * 0.62;
      const s1 = Math.min(1, s0 + 0.14 + mr() * 0.3);
      const k0 = mr();
      const k1 = clamp(k0 + (mr() - 0.5) * 0.25);
      const across = (s: number, k: number): Pt => {
        const [fx, fy] = flank(side, s);
        return [lerp(cx + side * 4, fx, k), fy];
      };
      const a = across(s0, k0);
      const b = across(s1, k1);
      const c = across(s1, k1 + 0.14);
      polygon(ctx, [a, b, c], side < 0 ? fade(p.rockDark, 0.6) : fade(p.rock, 0.6));
    }

    // Rivers of lava with bright pulses running down them.
    const vr = rand(6);
    for (let i = 0; i < p.rivers; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const k = 0.15 + vr() * 0.75;
      const reach = 0.55 + vr() * 0.42;
      const kink = vr() * TAU;
      const pts: Pt[] = [];
      for (let j = 0; j <= 18; j++) {
        const s = (j / 18) * reach;
        const [fx, fy] = flank(side, s);
        pts.push([lerp(cx + side * 3, fx, k) + Math.sin(s * 15 + kink) * 7 * s, fy + (j === 0 ? -4 : 0)]);
      }
      const stroke = (fill: string, width: number, dash?: number) => {
        ctx.strokeStyle = fill;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash ? [dash, dash * 1.3] : []);
        ctx.lineDashOffset = dash ? -dash * 2.3 * flow * t : 0;
        ctx.beginPath();
        trace(ctx, pts);
        ctx.stroke();
      };
      stroke(p.lavaDeep, 7.5);
      stroke(p.lava, 4.6);
      stroke(p.lavaHot, 2, 13);
      ctx.setLineDash([]);
      const end = pts[pts.length - 1]!;
      ctx.fillStyle = p.lavaDeep;
      ctx.beginPath();
      ctx.ellipse(end[0], end[1], 12, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.lava;
      ctx.beginPath();
      ctx.ellipse(end[0], end[1], 7.5, 2.6, 0, 0, TAU);
      ctx.fill();
    }

    // The crater's glowing mouth sits in front of the fountain's base.
    ctx.fillStyle = p.lavaDeep;
    ctx.beginPath();
    ctx.ellipse(cx, craterY + 2, craterHalf, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mix(p.lava, p.lavaHot, pulse - 0.7);
    ctx.beginPath();
    ctx.ellipse(cx, craterY + 2, craterHalf * 0.74, 4.4, 0, 0, TAU);
    ctx.fill();

    // Bombs fly on arcs, trailing hot sparks.
    const br = rand(7);
    for (let i = 0; i < p.bombs; i++) {
      const life = wrap(br() + t * 2);
      const vx = (br() - 0.5) * w * 0.86;
      const vy = 150 + br() * 150;
      const size = 1.6 + br() * 3.2;
      const at = (l: number): Pt => [cx + vx * l, craterY - vy * l + 260 * l * l];
      const [x, y] = at(life);
      if (y > baseY) continue;
      ctx.strokeStyle = fade(p.lava, 0.75);
      ctx.lineWidth = size * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const tail = at(Math.max(0, life - 0.07));
      ctx.moveTo(tail[0], tail[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = p.rockDark;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.lavaHot;
      ctx.beginPath();
      ctx.arc(x - size * 0.2, y - size * 0.2, size * 0.5, 0, TAU);
      ctx.fill();
    }

    if (background && p.trees) {
      const tr = rand(8);
      const pts: Pt[] = [];
      for (let x = -20; x <= w + 20; x += 24) pts.push([x, h - 16 - tr() * 14]);
      ctx.fillStyle = p.treeColor;
      ctx.beginPath();
      trace(ctx, pts);
      ctx.lineTo(w + 20, h + 10);
      ctx.lineTo(-20, h + 10);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 16; i++) {
        const x = (i < 8 ? tr() * w * 0.2 : w * 0.8 + tr() * w * 0.2) - 4;
        const tall = 26 + tr() * 36;
        const y = h - 12;
        for (let tier = 0; tier < 3; tier++) {
          const top = y - tall + (tier * tall) / 3.4;
          polygon(ctx, [[x, top], [x + 5 + tier * 3.4, top + tall * 0.46], [x - 5 - tier * 3.4, top + tall * 0.46]], p.treeColor);
        }
      }
    }

    // Ash drifting down over everything.
    const ar = rand(9);
    const drift = Math.round(p.wind * 2);
    ctx.fillStyle = fade(p.ashLight, 0.8);
    ctx.beginPath();
    for (let i = 0; i < p.ash; i++) {
      const x = wrap(ar() + drift * t) * (w + 8) - 4 + Math.sin(TAU * 3 * t + i) * 2.5;
      const y = wrap(ar() + (1 + (i % 2)) * t) * (h + 8) - 4;
      const size = 0.5 + ar() * 1.3;
      ctx.moveTo(x + size, y);
      ctx.arc(x, y, size, 0, TAU);
    }
    ctx.fill();
  },
});
