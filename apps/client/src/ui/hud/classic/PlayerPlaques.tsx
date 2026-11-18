import type { GameView, RoomView, Theme } from '@rails/shared';
import { sendOrToast } from '../../../net/socket.js';
import { playerHex } from '../../../theme/themes.js';
import { NX, S, T } from '../../strings.js';
import { markInk, markPath } from '../../../board/playerMarks.js';
import { setUi, useClient } from '../../../state/store.js';

/** At this many trains or fewer the last round is near, so the count turns coral. */
const LOW_TRAINS = 2;

/**
 * One plaque per seat: color strip, name, trains left, score. The active player gets a brass-light frame.
 * 5 to 7 players use the compact size. A disconnected player is dimmed and the host can skip them (R5).
 */
export function PlayerPlaques({
  view,
  room,
  theme,
}: {
  view: GameView;
  room: RoomView;
  theme: Theme;
}) {
  const isHost = room.hostSeatId === room.you;
  const activity = useClient((s) => s.ui.activity);
  const compact = view.players.length > 4;
  const round = Math.floor(view.turnNumber / Math.max(1, view.players.length)) + 1;
  return (
    <section className="nx-players" aria-label={S.scores}>
      <ol className={compact ? 'compact' : ''}>
        {view.players.map((p) => {
          const seat = room.seats.find((s) => s.playerIndex === p.index);
          const connected = seat?.connected ?? false;
          const isCurrent = view.phase === 'playing' && view.currentPlayer === p.index;
          const waitingOnThem =
            (isCurrent || (view.phase === 'initialTickets' && !p.keptInitial)) && !connected;
          const low = p.trains <= LOW_TRAINS;
          const hex = playerHex(theme, p.color);
          const acting = activity?.player === p.index;
          const stats = `${p.trains} ${S.trains} · ${p.handCount} ${S.cards} · ${p.ticketCount} ${S.tickets.toLowerCase()}${
            view.rules.expansions.stations ? ` · ${p.stationsLeft} ${S.stations}` : ''
          }`;
          return (
            <li
              key={p.index}
              className={`nx-plaque ${isCurrent ? 'active' : ''} ${connected ? '' : 'away'} ${acting ? 'acting' : ''}`}
              title={stats}
              onMouseEnter={() => setUi({ focusPlayer: p.index })}
              onMouseLeave={() => setUi({ focusPlayer: null })}
            >
              <span className="nx-plaque-color" style={{ background: hex }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d={markPath(p.index, 16)} fill={markInk(hex)} fillRule="evenodd" />
                </svg>
              </span>
              <span className="nx-plaque-name">
                {p.name}
                {seat?.id === room.you && <span className="nx-you">{S.you}</span>}
              </span>
              <span
                className={`nx-plaque-trains ${!connected || low ? 'nx-caps' : ''} ${low ? 'low' : ''}`}
              >
                {!connected ? S.away : low ? NX.lastTrains(p.trains) : NX.trainsLeft(p.trains)}
              </span>
              {acting && activity && <span className="nx-badge-act nx-caps">{T.activity.badge[activity.kind]}</span>}
              <span className="nx-plaque-score" aria-label={`${p.routePoints} ${S.points}`}>
                {p.routePoints}
              </span>
              {isHost && waitingOnThem && seat && (
                <button
                  className="nx-skip"
                  onClick={() => void sendOrToast({ type: 'skipPlayer', seatId: seat.id })}
                >
                  {S.skip}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {view.phase === 'playing' && (
        <span className="nx-plate nx-caps nx-round">{NX.round(round, view.drawPileCount)}</span>
      )}
    </section>
  );
}
