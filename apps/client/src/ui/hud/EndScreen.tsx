import { useState } from 'react';
import { longestTrailRoutes, type GameView, type MapIndex, type RoomView, type Theme } from '@rails/shared';
import { leaveRoom, sendOrToast } from '../../net/socket.js';
import { playerHex } from '../../theme/themes.js';
import { S } from '../strings.js';
import { TicketLine } from './Tickets.js';

/** Final score breakdown (R13). Hovering a player shows their longest trail on the board. */
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
  const [open, setOpen] = useState<number | null>(null);
  if (!results) return null;
  const name = (i: number) => view.players[i]?.name ?? '?';
  const isHost = room.hostSeatId === room.you;

  return (
    <div className="end-screen panel" role="dialog" aria-label={S.finished}>
      <h2>{S.finished}</h2>
      <p className="winner">{S.winner(results.winners.map(name).join(', '))}</p>
      <table>
        <thead>
          <tr>
            <th />
            <th>{S.routePoints}</th>
            <th>{S.ticketPoints}</th>
            {view.rules.expansions.stations && <th>{S.stationPoints}</th>}
            <th>{S.longestBonus}</th>
            <th>{S.total}</th>
          </tr>
        </thead>
        <tbody>
          {results.ranking.map((i) => {
            const r = results.players[i]!;
            return (
              <tr
                key={i}
                onMouseEnter={() => onHighlight(longestTrailRoutes(view, map, i))}
                onMouseLeave={() => onHighlight([])}
                onClick={() => setOpen(open === i ? null : i)}
                className={open === i ? 'open' : ''}
              >
                <td>
                  <span className="dot" style={{ background: playerHex(theme, view.players[i]!.color) }} /> {name(i)}
                </td>
                <td>{r.routePoints}</td>
                <td>
                  {r.ticketPoints} <span className="muted">({r.completedTickets}/{r.tickets.length})</span>
                </td>
                {view.rules.expansions.stations && <td>{r.stationPoints}</td>}
                <td>
                  {r.longestTrailBonus} <span className="muted">({r.longestTrail})</span>
                </td>
                <td className="total">{r.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open !== null && (
        <ul className="end-tickets">
          {results.players[open]!.tickets.map((t) => (
            <li key={t.id} className={t.completed ? 'done' : 'failed'}>
              <TicketLine id={t.id} map={map} done={t.completed} /> {t.completed ? S.completed : S.failed}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {isHost && (
          <button className="primary" onClick={() => void sendOrToast({ type: 'backToLobby' })}>
            {S.backToLobby}
          </button>
        )}
        <button className="secondary" onClick={() => void leaveRoom().then(onLeave)}>
          {S.leave}
        </button>
      </div>
    </div>
  );
}
