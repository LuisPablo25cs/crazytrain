import { useState } from 'react';
import { leaveRoom, sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { useTheme } from '../../theme/ThemeProvider.js';
import { playerHex } from '../../theme/themes.js';
import { T } from '../strings.js';
import { Station } from './Home.js';
import { MapPicker } from './MapPicker.js';
import { RulesPanel } from './RulesPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { PlayerLook } from './PlayerLook.js';
import { PastMatches } from './PastMatches.js';
import { SignIcon } from '../hud/classic/SignIcon.js';


/**
 * The lobby as a departure platform: the room code as a ticket stub, passengers on the left
 * (with their color and roof mark), the journey settings on the right, and one big action below.
 */
export function Lobby({ onLeave }: { onLeave: () => void }) {
  const room = useClient((s) => s.room)!;
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const L = T.lobby;
  const me = room.seats.find((s) => s.id === room.you);
  const isHost = room.hostSeatId === room.you;
  const host = room.seats.find((s) => s.id === room.hostSeatId);
  const link = `${location.origin}/r/${room.code}`;
  const { minPlayers, maxPlayers } = room.limits;
  const count = room.seats.length;
  const missing = Math.max(0, minPlayers - count);
  const canStart = isHost && missing === 0 && count <= maxPlayers;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the link stays visible to copy by hand.
    }
  };

  const modeName = room.mode === 'seasons' ? `${T.modes.seasons} · ${L.year(room.years)}` : T.modes.classic;

  return (
    <Station className="lobby-nx">
      <header className="lobby-top">
        <div className="lobby-brand">
          <h1>{T.NX.title}</h1>
          <p>{L.station}</p>
        </div>
        <div className="room-stub">
          <span className="room-stub-code">
            <span className="nx-caps">{L.roomCode}</span>
            <span className="room-code">{room.code}</span>
          </span>
          <span className="room-stub-link">
            <code>{link}</code>
            <button className="nx-btn dark" onClick={() => void copy()} aria-live="polite">
              {copied ? L.copied : L.copyLink}
            </button>
          </span>
        </div>
        <button className="nx-btn outline light lobby-leave" onClick={() => void leaveRoom().then(onLeave)}>
          {L.leave}
        </button>
      </header>

      <div className="lobby-main">
        <section className="lobby-col" aria-labelledby="lobby-passengers">
          <div className="lobby-heading">
            <h2 id="lobby-passengers">{L.passengers}</h2>
            <span>{L.seatCount(count, minPlayers, maxPlayers)}</span>
          </div>
          <ol className="lobby-seats">
            {Array.from({ length: maxPlayers }, (_, i) => {
              const s = room.seats[i];
              if (!s) {
                return (
                  <li key={`free-${i}`} className="lobby-seat free">
                    <span className="lobby-seat-strip" />
                    <span className="lobby-seat-name">{L.emptySeat}</span>
                  </li>
                );
              }
              const hex = playerHex(theme, s.color);
              const mine = s.id === room.you;
              return (
                <li key={s.id} className={`lobby-seat ${mine ? 'mine' : ''} ${s.connected ? '' : 'away'}`}>
                  <span className="lobby-seat-strip" style={{ background: hex }}>
                    <SignIcon sign={s.sign} hex={hex} />
                  </span>
                  <span className="lobby-seat-name">{s.name}</span>
                  {s.isHost && <span className="lobby-badge host">{T.S.host}</span>}
                  {mine && <span className="lobby-badge you">{T.S.you}</span>}
                  {!s.connected && <span className="lobby-badge away">{T.S.away}</span>}
                  {isHost && !mine && (
                    <button
                      className="nx-square lobby-kick"
                      aria-label={L.remove(s.name)}
                      title={L.remove(s.name)}
                      onClick={() => void sendOrToast({ type: 'kick', seatId: s.id })}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {me && <PlayerLook room={room} me={me} />}
          <PastMatches history={room.history} />
        </section>

        <section className="lobby-col" aria-labelledby="lobby-journey">
          <div className="lobby-heading">
            <h2 id="lobby-journey">{L.journey}</h2>
            {!isHost && <span>{L.hostChooses}</span>}
          </div>
          <RulesPanel isHost={isHost} />
          <SettingsPanel isHost={isHost} />
          <MapPicker isHost={isHost} />
        </section>
      </div>

      <footer className="lobby-foot">
        <p>
          {L.summary(count, modeName, room.doubleRoutes === 'both' ? L.bothLanes : L.oneLane)} ·{' '}
          {L.trainsEach(room.trainsPerPlayer)}
        </p>
        {isHost ? (
          <button
            className={`nx-btn primary big lobby-go ${canStart ? 'ready' : ''}`}
            disabled={!canStart}
            onClick={() => void sendOrToast({ type: 'startGame' })}
          >
            {missing > 0 ? L.needMore(missing) : L.allAboard}
          </button>
        ) : (
          <span className="lobby-wait">{L.waitingFor(host?.name ?? '?')}</span>
        )}
      </footer>
    </Station>
  );
}
