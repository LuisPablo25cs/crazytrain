import type { GameView, MapIndex } from '@rails/shared';
import { setUi, store } from '../../state/store.js';
import { S } from '../strings.js';
import { ticketProgress } from './affordances.js';

export function TicketLine({ id, map, done }: { id: string; map: MapIndex; done?: boolean }) {
  const t = map.tickets.get(id);
  if (!t) return <span>{id}</span>;
  return (
    <span className={`ticket ${t.deck === 'long' ? 'long' : ''} ${done ? 'done' : ''}`}>
      <span className="ticket-cities">
        {map.cities.get(t.from)?.name} – {map.cities.get(t.to)?.name}
      </span>
      <span className="ticket-points">{t.points}</span>
      {done && <span className="ticket-check" aria-label={S.completed}>✓</span>}
    </span>
  );
}

/** My tickets. Hover highlights the two cities; click moves the camera there. */
export function Tickets({ view, map }: { view: GameView; map: MapIndex }) {
  const me = view.me;
  if (!me) return null;
  const progress = ticketProgress(view, map);
  const focusTicket = (id: string) => {
    const t = map.tickets.get(id);
    const a = t && map.cities.get(t.from);
    const b = t && map.cities.get(t.to);
    if (!a || !b) return;
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    const nonce = (store.getState().ui.focus?.nonce ?? 0) + 1;
    setUi({ focus: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, zoom: Math.max(220, span * 1.6), nonce }, highlightCities: [a.id, b.id] });
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
              onMouseEnter={() => t && setUi({ highlightCities: [t.from, t.to] })}
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
