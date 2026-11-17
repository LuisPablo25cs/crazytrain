import { useRef, useState, type WheelEvent } from 'react';
import { ticketCities, type GameView, type MapIndex } from '@rails/shared';
import { setUi } from '../../../state/store.js';
import { NX, S } from '../../strings.js';
import { ticketProgress } from '../affordances.js';
import { TicketArt } from '../TicketArt.js';
import { focusCities } from '../Tickets.js';

/** Front spots of the fan: left, top offset, rotation (deg), front ticket first. */
const SPOTS: [number, number, number][] = [
  [58, 74, 3],
  [34, 36, -1],
  [10, 0, -5],
];
const TICKET_H = 138;
const CONTROLS_H = 44;
const FAN_H = 300;
const BASE_TOP = FAN_H - CONTROLS_H - 12 - TICKET_H - 74;

/**
 * My tickets as a rolling fan: three in front, the rest squeezed behind as dimmed edges.
 * Scroll, the arrows, or tapping a ticket rolls it to the front; tapping the front ticket shows its cities.
 */
export function TicketFan({ view, map }: { view: GameView; map: MapIndex }) {
  const [front, setFront] = useState(0);
  const lastWheel = useRef(0);
  const me = view.me;
  if (!me) return null;
  const ids = me.tickets;
  const n = ids.length;
  const progress = ticketProgress(view, map);
  const done = ids.filter((id) => progress.get(id)).length;
  if (n === 0) {
    return (
      <div className="nx-fan empty">
        <span className="nx-plate nx-caps">{NX.noTickets}</span>
      </div>
    );
  }
  const at = ((front % n) + n) % n;
  const step = (d: number) => setFront((f) => (((f + d) % n) + n) % n);
  const onWheel = (e: WheelEvent) => {
    if (n < 2) return;
    const now = Date.now();
    if (now - lastWheel.current < 220) return;
    lastWheel.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };
  return (
    <div className="nx-fan" aria-label={S.tickets} onWheel={onWheel}>
      <div className="nx-fan-stack">
        {ids.map((id, i) => {
          const t = map.tickets.get(id);
          if (!t) return null;
          const r = (i - at + n) % n;
          const sp =
            r < 3 ? SPOTS[r]! : ([10 + (r - 2) * 3, -(r - 2) * 10, -5 - (r - 2) * 1.3] as const);
          const names = ticketCities(t).map((c) => map.cities.get(c)?.name ?? c);
          return (
            <button
              key={id}
              className={`nx-fan-ticket ${r >= 3 ? 'behind' : ''} ${r === 0 ? 'front' : ''}`}
              style={{
                left: sp[0],
                top: BASE_TOP + sp[1],
                transform: `rotate(${sp[2]}deg)`,
                zIndex: n - r,
              }}
              aria-label={`${names.join(' to ')}, ${t.points} points${progress.get(id) ? ', complete' : ''}`}
              aria-current={r === 0}
              onMouseEnter={() => setUi({ highlightCities: ticketCities(t) })}
              onMouseLeave={() => setUi({ highlightCities: [] })}
              onClick={() => (r === 0 ? focusCities(id, map) : setFront(i))}
            >
              <TicketArt
                ticketId={t.id}
                names={names}
                points={t.points}
                long={t.deck === 'long'}
                done={progress.get(id)}
              />
            </button>
          );
        })}
      </div>
      <div className="nx-fan-controls">
        <span className="nx-plate nx-caps">
          {n > 1 ? NX.ticketCounter(at + 1, n, done) : NX.ticketCount(n, done)}
        </span>
        {n > 1 && (
          <>
            <button className="nx-square" aria-label={NX.prevTicket} onClick={() => step(-1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 10l5-5 5 5" />
              </svg>
            </button>
            <button className="nx-square" aria-label={NX.nextTicket} onClick={() => step(1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 6l5 5 5-5" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
