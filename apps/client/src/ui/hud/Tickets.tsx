import { ticketCities, type GameView, type MapIndex } from '@rails/shared';
import { setUi, store } from '../../state/store.js';
import { S } from '../strings.js';
import { ticketProgress } from './affordances.js';
import { TicketArt } from './TicketArt.js';

/** Move the camera to show every city of a ticket and ring them. */
function focusCities(ticketId: string, map: MapIndex): void {
  const t = map.tickets.get(ticketId);
  const cities = t ? ticketCities(t).map((c) => map.cities.get(c)) : [];
  if (!t || cities.some((c) => !c)) return;
  const xs = cities.map((c) => c!.x);
  const ys = cities.map((c) => c!.y);
  const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const nonce = (store.getState().ui.focus?.nonce ?? 0) + 1;
  setUi({
    focus: { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, zoom: Math.max(220, span * 1.6), nonce },
    highlightCities: ticketCities(t),
  });
}

export function TicketLine({ id, map, done }: { id: string; map: MapIndex; done?: boolean }) {
  const t = map.tickets.get(id);
  if (!t) return <span>{id}</span>;
  return (
    <span className={`ticket ${t.deck === 'long' ? 'long' : ''} ${done ? 'done' : ''}`}>
      <span className="ticket-cities">
        {ticketCities(t).map((c) => map.cities.get(c)?.name).join(' – ')}
      </span>
      <span className="ticket-points">{t.points}</span>
      {done && <span className="ticket-check" aria-label={S.completed}>✓</span>}
    </span>
  );
}

/** My tickets as cards in the bottom dock (placeholders until the ticket art arrives). */
export function TicketCards({ view, map }: { view: GameView; map: MapIndex }) {
  const me = view.me;
  if (!me) return null;
  const progress = ticketProgress(view, map);
  const focusTicket = (id: string) => {
    focusCities(id, map);
  };
  return (
    <div className="ticket-dock" aria-label={S.tickets}>
      <div className="dock-title">
        {S.tickets} <span className="muted">({[...progress.values()].filter(Boolean).length}/{me.tickets.length})</span>
      </div>
      <div className="ticket-cards">
        {me.tickets.map((id) => {
          const t = map.tickets.get(id);
          const done = progress.get(id);
          return (
            <button
              key={id}
              className={`ticket-card ${t?.deck === 'long' ? 'long' : ''} ${done ? 'done' : ''}`}
              onMouseEnter={() => t && setUi({ highlightCities: ticketCities(t) })}
              onMouseLeave={() => setUi({ highlightCities: [] })}
              onClick={() => focusTicket(id)}
              title={S.tickets}
            >
              {t && (
                <TicketArt
                  names={ticketCities(t).map((c) => map.cities.get(c)?.name ?? c)}
                  points={t.points}
                  long={t.deck === 'long'}
                  done={done}
                  style={map.map.ticketStyle}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** My tickets. Hover highlights the two cities; click moves the camera there. */
export function Tickets({ view, map }: { view: GameView; map: MapIndex }) {
  const me = view.me;
  if (!me) return null;
  const progress = ticketProgress(view, map);
  const focusTicket = (id: string) => {
    focusCities(id, map);
  };
  return (
    <section className="tickets panel" aria-label={S.tickets}>
      <h2>
        {S.tickets} <span className="muted">({[...progress.values()].filter(Boolean).length}/{me.tickets.length})</span>
      </h2>
      <ul>
        {me.tickets.map((id) => {
          const t = map.tickets.get(id);
          return (
            <li
              key={id}
              onMouseEnter={() => t && setUi({ highlightCities: ticketCities(t) })}
              onMouseLeave={() => setUi({ highlightCities: [] })}
            >
              <button className="link ticket-button" onClick={() => focusTicket(id)}>
                <TicketLine id={id} map={map} done={progress.get(id)} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
