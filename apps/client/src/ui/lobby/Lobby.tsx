import { useState } from 'react';
import { leaveRoom, sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { useTheme } from '../../theme/ThemeProvider.js';
import { playerHex } from '../../theme/themes.js';
import { S, colorName } from '../strings.js';
import { MapPicker } from './MapPicker.js';
import { RulesPanel } from './RulesPanel.js';
import { ThemePicker } from './ThemePicker.js';
import { LanguagePicker } from './LanguagePicker.js';

export function Lobby({ onLeave }: { onLeave: () => void }) {
  const room = useClient((s) => s.room)!;
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const me = room.seats.find((s) => s.id === room.you);
  const isHost = room.hostSeatId === room.you;
  const link = `${location.origin}/r/${room.code}`;
  const count = room.seats.length;
  const canStart = isHost && count >= room.limits.minPlayers && count <= room.limits.maxPlayers;
  const takenColors = new Set(room.seats.filter((s) => s.id !== room.you).map((s) => s.color));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the link stays visible to copy by hand.
    }
  };

  return (
    <main className="lobby">
      <header className="lobby-header">
        <h1>
          {S.lobby} <span className="code">{room.code}</span>
        </h1>
        <div className="share">
          <span className="muted">{S.shareLink}</span>
          <code>{link}</code>
          <button className="secondary small" onClick={() => void copy()}>
            {copied ? S.copied : S.copy}
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>
          {S.players} <span className="muted">({count} · {S.needPlayers(room.limits.minPlayers, room.limits.maxPlayers)})</span>
        </h2>
        <ul className="seats">
          {room.seats.map((s) => (
            <li key={s.id} className={s.connected ? '' : 'away'}>
              <span className="dot" style={{ background: playerHex(theme, s.color) }} />
              <span className="seat-name">{s.name}</span>
              {s.isHost && <span className="badge">{S.host}</span>}
              {s.id === room.you && <span className="badge you">{S.you}</span>}
              {!s.connected && <span className="badge">{S.away}</span>}
              {isHost && s.id !== room.you && (
                <button className="link" onClick={() => void sendOrToast({ type: 'kick', seatId: s.id })}>
                  {S.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
        {me && (
          <div className="color-picker" role="radiogroup" aria-label={S.color}>
            <span>{S.color}</span>
            {room.limits.playerColors.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={me.color === c}
                aria-label={colorName(c)}
                title={colorName(c)}
                disabled={takenColors.has(c)}
                className={`swatch ${me.color === c ? 'selected' : ''}`}
                style={{ background: playerHex(theme, c) }}
                onClick={() => void sendOrToast({ type: 'setColor', color: c })}
              />
            ))}
          </div>
        )}
      </section>

      <RulesPanel isHost={isHost} />
      <MapPicker isHost={isHost} />

      <footer className="lobby-footer">
        {isHost ? (
          <button className="primary big" disabled={!canStart} onClick={() => void sendOrToast({ type: 'startGame' })}>
            {S.start}
          </button>
        ) : (
          <p className="muted">{S.waitingForHost}</p>
        )}
        <ThemePicker />
        <LanguagePicker />
        <button
          className="secondary"
          onClick={() => {
            void leaveRoom().then(onLeave);
          }}
        >
          {S.leave}
        </button>
      </footer>
    </main>
  );
}
