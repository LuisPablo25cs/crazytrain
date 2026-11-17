import { useState } from 'react';
import { ticketCities, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { setUi } from '../../state/store.js';
import { NX, S } from '../strings.js';
import { TicketArt } from './TicketArt.js';

/** Choose which offered tickets to keep (initial or drawn). `classic`: the Night Express dialog. */
export function TicketChoice({ view, map, classic = false }: { view: GameView; map: MapIndex; classic?: boolean }) {
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

  if (classic) {
    const keptPoints = offered.reduce((n, id) => n + (kept.has(id) ? (map.tickets.get(id)?.points ?? 0) : 0), 0);
    const blocked = kept.size < minKeep;
    return (
      <div className="nx-scrim">
        <div className="nx-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-choice-title">
          <header>
            <h2 id="ticket-choice-title">{NX.chooseTitle}</h2>
            <p>{NX.chooseHelp(minKeep)}</p>
          </header>
          <ul className="nx-offers">
            {offered.map((id) => {
              const t = map.tickets.get(id);
              if (!t) return null;
              const names = ticketCities(t).map((c) => map.cities.get(c)?.name ?? c);
              const keep = kept.has(id);
              return (
                <li key={id}>
                  <button
                    className={`nx-offer ${keep ? 'kept' : 'returning'}`}
                    aria-pressed={keep}
                    aria-label={`${names.join(' to ')}, ${t.points} points, ${keep ? NX.keeping : NX.returning}`}
                    onClick={() => toggle(id)}
                    onMouseEnter={() => setUi({ highlightCities: ticketCities(t) })}
                    onMouseLeave={() => setUi({ highlightCities: [] })}
                  >
                    <TicketArt ticketId={t.id} names={names} points={t.points} long={t.deck === 'long'} />
                    <span className="nx-check" aria-hidden="true">
                      {keep && (
                        <svg width="18" height="18" viewBox="0 0 18 18">
                          <path d="M3 9.5l4 4 8-9" />
                        </svg>
                      )}
                    </span>
                    {t.deck === 'long' && <span className="nx-triple nx-caps">{NX.triple}</span>}
                    <span className="nx-tag nx-caps">{keep ? NX.keeping : NX.returning}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <footer>
            <p>{blocked ? NX.keepAtLeast(minKeep) : NX.keepSummary(kept.size, offered.length, keptPoints)}</p>
            <button className="nx-btn primary big" disabled={busy || blocked} onClick={() => void confirm()}>
              {blocked ? NX.keepMinButton(minKeep) : NX.keepButton(kept.size)}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal ticket-choice" role="dialog" aria-modal="true" aria-labelledby="ticket-choice-title">
        <h2 id="ticket-choice-title">{S.chooseTickets(minKeep)}</h2>
        <ul className="ticket-choices">
          {offered.map((id) => {
            const t = map.tickets.get(id);
            if (!t) return null;
            const names = ticketCities(t).map((c) => map.cities.get(c)?.name ?? c);
            return (
              <li
                key={id}
                onMouseEnter={() => setUi({ highlightCities: ticketCities(t) })}
                onMouseLeave={() => setUi({ highlightCities: [] })}
              >
                <label className={`ticket-choice-card ${kept.has(id) ? '' : 'dropped'}`}>
                  <input type="checkbox" checked={kept.has(id)} onChange={() => toggle(id)} aria-label={`${names.join(' – ')}, ${t.points}`} />
                  <TicketArt ticketId={t.id} names={names} points={t.points} long={t.deck === 'long'} />
                  {t.deck === 'long' && <span className="ticket-choice-tag">{S.longTicket}</span>}
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
