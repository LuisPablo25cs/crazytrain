import { useEffect, useState } from 'react';
import { longestTrailRoutes, ticketCities, type GameView, type MapIndex, type RoomView, type Theme } from '@rails/shared';
import { leaveRoom, sendOrToast } from '../../net/socket.js';
import { playerHex } from '../../theme/themes.js';
import { S, T } from '../strings.js';
import { SignIcon } from './classic/SignIcon.js';
import { TicketArt } from './TicketArt.js';

/**
 * End of the line (R13), in the Night Express style: the winner on a brass header, every player as a
 * plaque with their score broken down, and the open player's tickets as ticket art, stamped COMPLETE
 * or MISSED. The open player's longest route lights up on the board. "See the board" folds it away.
 */
export function EndScreen({
  view,
  map,
  room,
  theme,
  onHighlight,
  onLeave,
}: {
  view: GameView;
  map: MapIndex;
  room: RoomView;
  theme: Theme;
  onHighlight: (routes: string[]) => void;
  onLeave: () => void;
}) {
  const results = view.results;
  const mine = view.me?.index ?? null;
  const [open, setOpen] = useState<number | null>(mine ?? results?.ranking[0] ?? null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    onHighlight(open !== null && results ? longestTrailRoutes(view, map, open) : []);
    // Only when the open player changes.
  }, [open, results]);
  if (!results) return null;
  const E = T.end;
  const name = (i: number) => view.players[i]?.name ?? '?';
  const sign = (i: number) => room.seats.find((s) => s.playerIndex === i)?.sign ?? i;
  const isHost = room.hostSeatId === room.you;
  const host = room.seats.find((s) => s.id === room.hostSeatId);
  const winners = results.winners.map(name).join(' & ');
  const headline = E.wins(winners, results.winners.length);
  const stations = view.rules.expansions.stations;

  if (folded) {
    return (
      <div className="classic-ui nx-end-layer">
        <button className="nx-end-tab" onClick={() => setFolded(false)}>
          <span className="nx-caps">{E.results}</span>
          <span>{headline}</span>
        </button>
      </div>
    );
  }

  const openResult = open !== null ? results.players[open] : undefined;
  return (
    <div className="classic-ui nx-end-layer">
      <section className="nx-end" role="dialog" aria-labelledby="nx-end-title">
        <header className="nx-end-head">
          <span className="nx-caps">{E.title}</span>
          <h2 id="nx-end-title">{headline}</h2>
          <button className="nx-btn outline light nx-end-fold" onClick={() => setFolded(true)}>
            {E.seeBoard}
          </button>
        </header>

        <div className="nx-end-body">
          <ol className="nx-end-ranks">
            {results.ranking.map((i, place) => {
              const r = results.players[i]!;
              const hex = playerHex(theme, view.players[i]!.color);
              const won = results.winners.includes(i);
              return (
                <li key={i}>
                  <button
                    className={`nx-end-row ${won ? 'won' : ''} ${open === i ? 'open' : ''}`}
                    aria-expanded={open === i}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    <span className="nx-end-place">{place + 1}</span>
                    <span className="nx-end-chip" style={{ background: hex }}>
                      <SignIcon sign={sign(i)} hex={hex} size={18} />
                    </span>
                    <span className="nx-end-who">
                      <span className="nx-end-name">
                        {name(i)}
                        {i === mine && <span className="nx-end-you">{T.S.you}</span>}
                      </span>
                      <span className="nx-end-parts">
                        <span>
                          {S.routePoints} <b>{r.routePoints}</b>
                        </span>
                        <span>
                          {S.ticketPoints} <b>{r.ticketPoints}</b> ({r.completedTickets}/{r.tickets.length})
                        </span>
                        {stations && (
                          <span>
                            {S.stationPoints} <b>{r.stationPoints}</b>
                          </span>
                        )}
                        <span>
                          {S.longestBonus} <b>{r.longestTrailBonus}</b> ({r.longestTrail})
                        </span>
                      </span>
                    </span>
                    <span className="nx-end-total">{r.total}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="nx-end-tickets" aria-live="polite">
            {openResult ? (
              <>
                <span className="nx-caps">{E.ticketsOf(name(openResult.player))}</span>
                <ul>
                  {openResult.tickets.map((t) => {
                    const ticket = map.tickets.get(t.id);
                    if (!ticket) return null;
                    const names = ticketCities(ticket).map((c) => map.cities.get(c)?.name ?? c);
                    return (
                      <li key={t.id} className={t.completed ? 'done' : 'missed'}>
                        <TicketArt ticketId={t.id} names={names} points={ticket.points} long={ticket.deck === 'long'} />
                        <span className={`nx-end-stamp ${t.completed ? 'done' : 'missed'}`}>
                          {t.completed ? T.NX.complete : E.missed} · {t.completed ? '+' : '−'}
                          {Math.abs(t.points)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="nx-end-hint">{E.tapPlayer}</p>
            )}
          </div>
        </div>

        <footer className="nx-end-foot">
          {isHost ? (
            <button className="nx-btn primary" onClick={() => void sendOrToast({ type: 'backToLobby' })}>
              {S.backToLobby}
            </button>
          ) : (
            <span className="nx-end-wait">{E.waitHost(host?.name ?? '?')}</span>
          )}
          <button className="nx-btn outline light" onClick={() => void leaveRoom().then(onLeave)}>
            {S.leave}
          </button>
        </footer>
      </section>
    </div>
  );
}
