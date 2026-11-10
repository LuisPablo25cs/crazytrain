import { color, defineEffect, flag, num } from './model.js';
import { clamp, fade, lerp, makeWaves, mix, polygon, puff, skyBands, smooth, TAU, trace, waves, wrap, type Pt } from './vector.js';

/** A towering wave rolling in from the sea and over a coastal city. */
export const tsunami = defineEffect({
  id: 'tsunami',
  name: 'Tsunami',
  params: [
    num('height', 'Wave height', 'Wave', 0.56, 0.15, 0.8, 0.01),
    num('length', 'Wave length', 'Wave', 0.9, 0.4, 1.6, 0.01),
    num('curl', 'Curl of the crest', 'Wave', 0.42, 0, 0.8, 0.01),
    num('seaLevel', 'Sea level', 'Wave', 0.76, 0.55, 0.9, 0.01),
    num('crests', 'Waves per loop', 'Motion', 1, 1, 4),
    num('chop', 'Surface chop', 'Motion', 1, 0, 3, 0.05),
    num('foam', 'Foam', 'Detail', 1, 0, 2.5, 0.05),
    num('spray', 'Spray drops', 'Detail', 70, 0, 220),
    num('streaks', 'Water lines on the wave', 'Detail', 12, 0, 30),
    flag('city', 'Show city', 'Scene', true),
    num('buildings', 'Buildings', 'Scene', 11, 3, 20),
    flag('boat', 'Show boat', 'Scene', true),
    color('skyTop', 'Sky top', '#5c7f9f'),
    color('skyBottom', 'Sky bottom', '#efd9b4'),
    color('cloud', 'Clouds', '#f5e9d6'),
    color('cityColor', 'City', '#6a7588'),
    color('windowColor', 'City windows', '#f2d68b'),
    color('seaLight', 'Water light', '#4fc0cf'),
    color('seaMid', 'Water', '#1f8fb0'),
    color('seaDeep', 'Water deep', '#135f86'),
    color('seaDeepest', 'Water deepest', '#0c3f62'),
    color('foamColor', 'Foam color', '#fbffff'),
  ],
  draw({ ctx, w, h, t, p, background, rand }) {
    const sea = h * p.seaLevel;
    const L = w * p.length;
    const travel = wrap(t * Math.round(p.crests));
    const crestX = lerp(w + L * 0.32, -L * 1.6, travel);
    // The wave rises out of a flat sea and dies away, so the loop point has nothing on screen.
    const env = smooth(0, 0.14, travel) * (1 - smooth(0.84, 1, travel));
    const amp = h * p.height * env;
    const chop = makeWaves(rand(1), 5, 7, 3);

    const rise = (x: number) => {
      const u = (x - crestX) / L;
      return amp * (u < 0 ? Math.exp(-Math.pow(-u / 0.19, 1.7)) : Math.exp(-Math.pow(u / 0.82, 2)));
    };
    const ripple = (x: number) => waves(chop, x / w, t) * 2.6 * p.chop;
    const surface = (x: number) => sea + ripple(x) - rise(x);
    const near = clamp(env);

    if (background) {
      skyBands(ctx, w, h, p.skyTop, p.skyBottom, 12);
      const cr = rand(2);
      ctx.fillStyle = fade(p.cloud, 0.85);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const x = wrap(cr() + t) * (w + 160) - 80;
        const y = 24 + cr() * h * 0.26;
        for (let j = 0; j < 4; j++) puff(ctx, x + j * 21, y + Math.sin(j * 2.1) * 4, 13 + cr() * 9, cr() * TAU, 6);
      }
      ctx.fill();

      if (p.city) {
        // Headland, then buildings that tremble as the water reaches them.
        ctx.fillStyle = mix(p.cityColor, p.skyBottom, 0.45);
        ctx.beginPath();
        trace(ctx, [[-30, sea + 6], [w * 0.12, sea - 34], [w * 0.3, sea - 18], [w * 0.5, sea - 22], [w * 0.72, sea + 8]]);
        ctx.fill();
        const br = rand(3);
        const count = Math.round(p.buildings);
        for (let i = 0; i < count; i++) {
          const x = (i / count) * w * 0.62 + br() * 5;
          const bw = 18 + br() * 16;
          const bh = 28 + br() * 72;
          const tone = br() * 0.28;
          const antenna = br() < 0.3;
          const stagger = br();
          const hit = clamp(1 - Math.abs(x - crestX + 40) / 95) * near;
          ctx.save();
          ctx.translate(x + bw / 2, sea + 6);
          ctx.rotate(-hit * 0.17 + hit * 0.02 * Math.sin(TAU * 18 * t));
          const fill = mix(p.cityColor, p.skyBottom, tone);
          ctx.fillStyle = fill;
          ctx.fillRect(-bw / 2, -bh, bw, bh);
          ctx.fillStyle = mix(fill, '#000000', 0.22);
          ctx.fillRect(bw * 0.2, -bh, bw * 0.3, bh);
          if (antenna) ctx.fillRect(-0.7, -bh - 15, 1.4, 15);
          ctx.fillStyle = p.windowColor;
          for (let row = 0; row * 8.5 < bh - 10; row++) {
            for (let col = 0; col < 3; col++) {
              if (Math.sin(i * 7.3 + row * 3.1 + col * 5.7 + stagger) > 0.1) ctx.fillRect(-bw / 2 + 2.5 + col * ((bw - 5) / 3), -bh + 5 + row * 8.5, 3, 4);
            }
          }
          ctx.restore();
        }
      }
    }

    // The sea behind the wave.
    const backChop = makeWaves(rand(4), 3, 6, 2);
    ctx.fillStyle = mix(p.seaMid, p.seaLight, 0.45);
    ctx.beginPath();
    {
      const pts: Pt[] = [];
      for (let x = -10; x <= w + 10; x += 12) pts.push([x, sea - 7 + waves(backChop, x / w, t) * 2.5 * p.chop]);
      trace(ctx, pts);
      ctx.lineTo(w + 10, h + 10);
      ctx.lineTo(-10, h + 10);
      ctx.closePath();
      ctx.fill();
    }

    // The curling lip. It is drawn before the wave's body, so only the part leaning out shows.
    const top = surface(crestX);
    const cl = amp * p.curl;
    const reach = 1 + 0.08 * Math.sin(TAU * 3 * t);
    const tip: Pt = [crestX - cl * 1.2 * reach, top + cl * 0.62];
    const back: Pt = [crestX + amp * 0.55, surface(crestX + amp * 0.55)];
    const bezier = (k: number): Pt => {
      const cx = crestX - cl * 0.25;
      const cy = top - cl * 0.5;
      return [(1 - k) ** 2 * back[0] + 2 * (1 - k) * k * cx + k * k * tip[0], (1 - k) ** 2 * back[1] + 2 * (1 - k) * k * cy + k * k * tip[1]];
    };
    if (cl > 1) {
      const lip = (inset: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(back[0], back[1] + inset);
        ctx.quadraticCurveTo(crestX - cl * 0.25, top - cl * 0.5 + inset, tip[0] + inset * 1.5, tip[1] + inset * 0.15);
        ctx.quadraticCurveTo(crestX - cl * 0.72, top + cl * 0.26 + inset * 0.3, crestX + cl * 0.05, top + cl * 1.1);
        ctx.lineTo(back[0], top + cl * 1.4);
        ctx.closePath();
        ctx.fill();
      };
      lip(0, p.seaLight);
      lip(5, p.seaMid);
      lip(14, p.seaDeep);
    }

    // Colored contours of the wave: each one follows the surface, set further in.
    const body = (depth: number, stretch: number, fill: string) => {
      const pts: Pt[] = [];
      for (let x = -12; x <= w + 12; x += 3) pts.push([x, surface(x) + depth + rise(x) * stretch]);
      ctx.fillStyle = fill;
      ctx.beginPath();
      trace(ctx, pts);
      ctx.lineTo(w + 12, h + 12);
      ctx.lineTo(-12, h + 12);
      ctx.closePath();
      ctx.fill();
    };
    body(0, 0, p.seaLight);
    body(5, 0.1, p.seaMid);
    body(13, 0.32, p.seaDeep);
    body(24, 0.62, p.seaDeepest);

    // Currents streaking up the wave's face and back.
    ctx.lineCap = 'round';
    const lr = rand(5);
    for (let i = 0; i < p.streaks; i++) {
      const depth = 8 + lr() * 60;
      const stretch = lr() * 0.55;
      const start = -0.35 + lr() * 0.9;
      const span = 0.25 + lr() * 0.55;
      const dash = 18 + lr() * 34;
      const pts: Pt[] = [];
      for (let k = 0; k <= 22; k++) {
        const x = crestX + (start + (k / 22) * span) * L;
        pts.push([x, surface(x) + depth + rise(x) * stretch]);
      }
      ctx.strokeStyle = fade(p.seaLight, 0.55 * near);
      ctx.lineWidth = 1 + (i % 3) * 0.5;
      ctx.setLineDash([dash, dash * 0.8]);
      ctx.lineDashOffset = dash * 1.8 * Math.round(2 + (i % 3)) * t;
      ctx.beginPath();
      trace(ctx, pts);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Foam: along the top of the lip, hanging from its tip, and boiling along the foot.
    const foamR = rand(6);
    const count = Math.round(34 * p.foam);
    ctx.fillStyle = p.foamColor;
    ctx.beginPath();
    for (let i = 0; i < count && amp > 4; i++) {
      const k = 0.15 + (i / count) * 0.85;
      const [x, y] = cl > 1 ? bezier(k) : [crestX + (0.5 - k) * 40, top];
      const phase = foamR() * TAU;
      const churn = Math.sin(TAU * 4 * t + phase);
      puff(ctx, x + churn * 2, y + foamR() * 3, (3 + k * 7 + churn * 1.4) * Math.min(1, amp / 60), phase, 6);
    }
    for (let i = 0; i < count * 1.3 && amp > 4; i++) {
      const k = i / (count * 1.3);
      const x = crestX - (0.2 + k * 0.62) * L;
      const phase = foamR() * TAU;
      const churn = Math.sin(TAU * 5 * t + phase);
      const size = (3 + foamR() * 12 + churn * 1.5) * (1 - k * 0.8) * Math.min(1, amp / 70);
      puff(ctx, x, surface(x) + (foamR() - 0.3) * 10, size, phase, 6);
    }
    ctx.fill();

    // Flecks sliding down the steep face.
    ctx.strokeStyle = fade(p.foamColor, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 26 * p.foam && amp > 12; i++) {
      const u = foamR();
      const life = wrap(foamR() + t * 4);
      const x = crestX - (0.02 + (0.05 + u * 0.13) * life * 1.4) * L;
      const y = surface(x) + 5 + foamR() * 14;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 6);
    }
    ctx.stroke();

    // Spray thrown forward off the lip.
    const sr = rand(7);
    ctx.fillStyle = p.foamColor;
    ctx.beginPath();
    for (let i = 0; i < p.spray && amp > 12; i++) {
      const life = wrap(sr() + t * 5);
      const vx = 30 + sr() * 90;
      const vy = 10 + sr() * 60;
      const from = bezier(0.55 + sr() * 0.45);
      const x = from[0] - vx * life;
      const y = from[1] - vy * life + 150 * life * life;
      const size = (0.8 + sr() * 2.2) * (1 - life * 0.6);
      ctx.moveTo(x + size, y);
      ctx.arc(x, y, size, 0, TAU);
    }
    ctx.fill();

    if (p.boat) {
      const x = w * 0.27;
      const y = surface(x);
      const slope = Math.atan2(surface(x + 8) - surface(x - 8), 16);
      ctx.save();
      ctx.translate(x, y + 1);
      ctx.rotate(slope);
      polygon(ctx, [[-16, -6], [16, -6], [11, 3], [-12, 3]], '#c8452f');
      polygon(ctx, [[-16, -6], [16, -6], [15, -4], [-15, -4]], '#f3ece0');
      ctx.fillStyle = '#f3ece0';
      ctx.fillRect(-7, -14, 11, 8);
      ctx.fillStyle = '#35566f';
      ctx.fillRect(-5, -12, 7, 3.4);
      ctx.fillStyle = '#4b3a2d';
      ctx.fillRect(7, -24, 1.4, 18);
      ctx.restore();
    }

    // Near water passing in front of everything.
    const nearChop = makeWaves(rand(8), 3, 5, 3);
    const pts: Pt[] = [];
    for (let x = -10; x <= w + 10; x += 10) pts.push([x, h - 13 + waves(nearChop, x / w, t) * 3 * p.chop]);
    ctx.fillStyle = mix(p.seaDeepest, '#000000', 0.2);
    ctx.beginPath();
    trace(ctx, pts);
    ctx.lineTo(w + 10, h + 10);
    ctx.lineTo(-10, h + 10);
    ctx.closePath();
    ctx.fill();
  },
});
