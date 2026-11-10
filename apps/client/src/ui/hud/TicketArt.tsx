import { useEffect, useId, useState } from 'react';
import { resolveTicketStyle, type ResolvedTicketStyle, type TicketStyle } from '@rails/shared';
import '@fontsource/cardo/400.css';
import '@fontsource/cardo/700.css';

/** Blank ticket artwork (assets/ticket_template, made web-sized by tools/assets/prepare-art.py). */
export const TICKET_TEMPLATE_URL = '/art/ui/ticket.webp';

/** The drawing space is 1000 wide; its height follows the template's shape. */
const W = 1000;
const INK = '#3e4654';
const NUMBER_FONT = "'Rosella Engraved', Cardo, serif";

type Template = { kind: 'checking' } | { kind: 'image'; height: number } | { kind: 'drawn'; height: number };
const DRAWN_HEIGHT = 461;

interface ArtInfo {
  ticketTemplate?: boolean;
  numberFont?: string | null;
}

// One probe per page: which optional art exists, and what shape the template is.
let probe: Promise<Template> | null = null;
function loadTemplate(): Promise<Template> {
  probe ??= fetch('/api/art')
    .then((res) => (res.ok ? (res.json() as Promise<ArtInfo>) : ({} as ArtInfo)))
    .catch(() => ({}) as ArtInfo)
    .then((art) => {
      if (art.numberFont) {
        // The number font (Rosella Engraved) is a file the game owner drops into assets/fonts.
        const style = document.createElement('style');
        style.textContent = `@font-face { font-family: 'Rosella Engraved'; src: url('${art.numberFont}'); font-display: swap; }`;
        document.head.appendChild(style);
      }
      return new Promise<Template>((resolve) => {
        if (!art.ticketTemplate) return resolve({ kind: 'drawn', height: DRAWN_HEIGHT });
        const img = new Image();
        img.onload = () => resolve({ kind: 'image', height: (W * img.naturalHeight) / img.naturalWidth });
        img.onerror = () => resolve({ kind: 'drawn', height: DRAWN_HEIGHT });
        img.src = TICKET_TEMPLATE_URL;
      });
    });
  return probe;
}

function useTemplate(): Template {
  const [tpl, setTpl] = useState<Template>({ kind: 'checking' });
  useEffect(() => {
    let alive = true;
    void loadTemplate().then((t) => alive && setTpl(t));
    return () => {
      alive = false;
    };
  }, []);
  return tpl;
}

/** City line text: names in capitals joined by a dot. */
export function cityText(names: string[]): string {
  return names.map((n) => n.toUpperCase()).join(' · ');
}

/** Largest size at most `style.citySize` that keeps the text within `cityMaxWidth`. */
export function fittedCitySize(text: string, style: ResolvedTicketStyle): number {
  // Cardo capitals run about 0.74 of the font size wide, plus the letter spacing.
  const fit = (style.cityMaxWidth / Math.max(1, text.length) - style.citySpacing) / 0.74;
  return Math.max(6, Math.min(style.citySize, fit));
}

/**
 * Path the city line follows: an arc whose top is at (cityX, cityY), as wide as the text, bent by
 * `cityCurve` degrees. Zero degrees is a straight line.
 */
export function cityPath(style: ResolvedTicketStyle, textWidth: number): string {
  const { cityX: x, cityY: y, cityCurve: curve } = style;
  if (curve < 0.5) return `M ${(x - textWidth / 2).toFixed(2)} ${y} H ${(x + textWidth / 2).toFixed(2)}`;
  const span = (curve * Math.PI) / 180;
  const r = textWidth / span;
  const half = span / 2;
  const x1 = x - r * Math.sin(half);
  const x2 = x + r * Math.sin(half);
  const yEnd = y + r - r * Math.cos(half);
  return `M ${x1.toFixed(2)} ${yEnd.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${yEnd.toFixed(2)}`;
}

/** A simple stand-in for the template, used only if assets/web/ui/ticket.webp does not exist. */
function DrawnTicket({ height }: { height: number }) {
  const id = useId();
  const h = height;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c99a55" />
          <stop offset="0.5" stopColor="#d4ad6c" />
          <stop offset="1" stopColor="#b98c4a" />
        </linearGradient>
      </defs>
      <path
        d={`M 4 4 H 840 a 24 24 0 0 0 48 0 H 996 V ${h - 4} H 888 a 24 24 0 0 0 -48 0 H 4 Z`}
        fill={`url(#${id}-g)`}
        stroke="#a37a3c"
        strokeWidth="3"
      />
      <line x1="864" y1="30" x2="864" y2={h - 30} stroke="#f4e4c0" strokeWidth="5" strokeDasharray="3 10" strokeLinecap="round" />
      <text x="935" y={h / 2} transform={`rotate(90 935 ${h / 2})`} textAnchor="middle" fontFamily="Cardo, serif" fontWeight="700" fontSize="30" letterSpacing="5" fill={INK}>
        ADMIT ONE
      </text>
      <text x="443" y="170" textAnchor="middle" fontFamily="Cardo, serif" fontWeight="700" fontSize="90" letterSpacing="3" fill={INK}>
        TICKET
      </text>
    </g>
  );
}

export interface TicketArtProps {
  /** City names in order: two for a normal ticket, three for a triple ticket. */
  names: string[];
  points: number;
  long?: boolean;
  done?: boolean;
  /** Where the text sits; the map's `ticketStyle`. Missing values use the defaults. */
  style?: TicketStyle;
  className?: string;
}

/**
 * A train ticket: the blank template, with the cities written along a curve in Cardo and the
 * points as a large slanted number in the corner (Rosella Engraved when its font file is present).
 */
export function TicketArt({ names, points, long, done, style, className }: TicketArtProps) {
  const tpl = useTemplate();
  const pathId = useId();
  const s = resolveTicketStyle(style);
  const height = tpl.kind === 'checking' ? DRAWN_HEIGHT : tpl.height;
  const text = cityText(names);
  const size = fittedCitySize(text, s);
  const width = text.length * (0.74 * size + s.citySpacing);
  const pointsSize = String(points).length > 2 ? s.numberSize * 0.78 : s.numberSize;
  return (
    <svg
      className={`ticket-art ${long ? 'long' : ''} ${done ? 'done' : ''} ${className ?? ''}`}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={`${names.join(' to ')}, ${points} points`}
    >
      {tpl.kind === 'image' && <image href={TICKET_TEMPLATE_URL} x="0" y="0" width={W} height={height} />}
      {tpl.kind === 'drawn' && <DrawnTicket height={height} />}
      <defs>
        <path id={pathId} d={cityPath(s, width)} />
      </defs>
      <text fontFamily="Cardo, serif" fontWeight="700" fontSize={size} letterSpacing={s.citySpacing} fill={INK}>
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
      <text
        x={s.numberX}
        y={s.numberY}
        transform={`rotate(${s.numberAngle} ${s.numberX} ${s.numberY})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={NUMBER_FONT}
        fontSize={pointsSize}
        fill={long ? '#8a2b22' : INK}
      >
        {points}
      </text>
      {done && (
        <text x={443} y={height - 60} textAnchor="middle" fontFamily="Cardo, serif" fontWeight="700" fontSize="48" fill="#2e7d32">
          ✓ DONE
        </text>
      )}
    </svg>
  );
}
