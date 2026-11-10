import { useState } from 'react';
import { ticketCities, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { setUi } from '../../state/store.js';
import { S } from '../strings.js';
import { TicketLine } from './Tickets.js';

/** Choose which offered tickets to keep (initial or drawn). */
export function TicketChoice({ view, map }: { view: GameView; map: MapIndex }) {
  const offered = view.me?.offeredTickets ?? [];
  const initial = view.phase === 'initialTickets';
  const minKeep = Math.min(initial ? view.rules.tickets.initialKeepMin : view.rules.tickets.drawKeepMin, offered.length);
  const [kept, setKept] = useState<Set<string>>(() => new Set(offered));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(kept);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setKept(next);
  };

  const confirm = async () => {
    setBusy(true);
    const ticketIds = offered.filter((id) => kept.has(id));
    await sendAction(initial ? { type: 'keepInitialTickets', ticketIds } : { type: 'keepTickets', ticketIds });
    setBusy(false);
    setUi({ highlightCities: [] });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ticket-choice-title">
        <h2 id="ticket-choice-title">{S.chooseTickets(minKeep)}</h2>
        <ul className="ticket-choices">
          {offered.map((id) => {
            const t = map.tickets.get(id);
            return (
              <li
                key={id}
                onMouseEnter={() => t && setUi({ highlightCities: ticketCities(t) })}
                onMouseLeave={() => setUi({ highlightCities: [] })}
              >
                <label>
                  <input type="checkbox" checked={kept.has(id)} onChange={() => toggle(id)} />
                  <TicketLine id={id} map={map} />
                </label>
              </li>
            );
          })}
        </ul>
        <button className="primary" disabled={busy || kept.size < minKeep} onClick={() => void confirm()}>
          {S.keepTickets} ({kept.size})
        </button>
      </div>
    </div>
  );
}
