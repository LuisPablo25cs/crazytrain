import type { GameView, RoomView, Theme } from '@rails/shared';
import { sendOrToast } from '../../net/socket.js';
import { playerHex } from '../../theme/themes.js';
import { S } from '../strings.js';

/** Public player info; a disconnected player is marked and the host can skip them (R5). */
export function Scoreboard({ view, room, theme }: { view: GameView; room: RoomView; theme: Theme }) {
  const isHost = room.hostSeatId === room.you;
  return (
    <section className="scoreboard panel" aria-label={S.scores}>
      <h2>{S.scores}</h2>
      <ol>
        {view.players.map((p) => {
          const seat = room.seats.find((s) => s.playerIndex === p.index);
          const connected = seat?.connected ?? false;
          const isCurrent = view.phase === 'playing' && view.currentPlayer === p.index;
          const waitingOnThem = (isCurrent || (view.phase === 'initialTickets' && !p.keptInitial)) && !connected;
          return (
            <li key={p.index} className={`${isCurrent ? 'current' : ''} ${connected ? '' : 'away'}`}>
              <span className="dot" style={{ background: playerHex(theme, p.color) }} />
              <span className="player-name">
                {p.name}
                {seat?.id === room.you && <span className="badge you">{S.you}</span>}
                {seat?.isHost && <span className="badge">{S.host}</span>}
                {!connected && <span className="badge warn">{S.away}</span>}
              </span>
              <span className="points">
                {p.routePoints} {S.points}
              </span>
              <span className="stats muted">
                {p.trains} {S.trains} · {p.handCount} {S.cards} · {p.ticketCount} {S.tickets.toLowerCase()}
                {view.rules.expansions.stations && ` · ${p.stationsLeft} ${S.stations}`}
              </span>
              {isHost && waitingOnThem && seat && (
                <button className="small danger" onClick={() => void sendOrToast({ type: 'skipPlayer', seatId: seat.id })}>
                  {S.skip}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
