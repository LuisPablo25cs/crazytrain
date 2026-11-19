import { useState, type ReactNode } from 'react';
import { createRoom, session } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { NX, T, tr } from '../strings.js';
import { cardArtUrl } from '../hud/CardChip.js';
import { LanguagePicker } from './LanguagePicker.js';
import { ThemePicker } from './ThemePicker.js';
import '../hud/classic/fonts.js';

/** The starter map, dimmed behind the start screen and the lobby. */
export const BACKDROP = '/maps/north-america.jpg';

/** The dark station backdrop with the language and theme pickers and the connection light. */
export function Station({ children, className = '' }: { children: ReactNode; className?: string }) {
  const connection = useClient((s) => s.connection);
  const L = T.lobby;
  return (
    <main className={`classic-ui station ${className}`}>
      <img className="station-backdrop" src={BACKDROP} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
      <div className="station-tools">
        <ThemePicker />
        <LanguagePicker />
      </div>
      {children}
      <p className={`station-status ${connection === 'connected' ? 'on' : ''}`} role="status">
        <span aria-hidden="true" />
        {connection === 'connected' ? L.online : L.offline}
      </p>
    </main>
  );
}

function Brand() {
  return (
    <div className="start-brand">
      <img src={cardArtUrl('locomotive')} alt="" />
      <h1>{NX.title}</h1>
      <p>{T.lobby.tagline}</p>
    </div>
  );
}

function NameField({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <label className="start-field">
      <span className="nx-caps">{T.lobby.nickname}</span>
      <input
        className="start-input"
        value={name}
        maxLength={20}
        autoFocus
        placeholder={T.lobby.namePlaceholder}
        onChange={(e) => setName(e.target.value)}
      />
    </label>
  );
}

/** Start: pick a nickname, then create a room or join one with its 5-letter code. */
export function Home({ onEnter }: { onEnter: (code: string) => void }) {
  const connection = useClient((s) => s.connection);
  const [name, setName] = useState(session.name());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = connection === 'connected';
  const hasName = name.trim().length > 0;
  const L = T.lobby;

  const create = async () => {
    setBusy(true);
    const reply = await createRoom(name.trim());
    setBusy(false);
    if (reply.ok && reply.code) onEnter(reply.code);
    else setError(reply.ok ? T.misc.noRoomCode : tr(reply.error));
  };

  return (
    <Station>
      <div className="start-card">
        <Brand />
        <NameField name={name} setName={setName} />
        <button className="nx-btn primary big" disabled={!online || !hasName || busy} onClick={() => void create()}>
          {L.create}
        </button>
        <div className="start-or">{L.or}</div>
        <form
          className="start-field"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim() || !hasName) return;
            session.saveName(name.trim());
            onEnter(code.trim().toUpperCase());
          }}
        >
          <label className="nx-caps" htmlFor="start-code">
            {L.code}
          </label>
          <div className="start-row">
            <input
              id="start-code"
              className="start-input code"
              value={code}
              maxLength={10}
              placeholder="M5QK2"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="submit" className="nx-btn outline light big" disabled={!hasName || code.trim().length < 5}>
              {L.join}
            </button>
          </div>
          <span className="start-help">{L.codeHelp}</span>
        </form>
        {error && <p className="start-error">{error}</p>}
      </div>
    </Station>
  );
}

/** Opening a shared link: the code is known, so only the nickname is asked. */
export function Invite({
  code,
  onJoin,
  onBack,
  error,
  busy,
}: {
  code: string;
  onJoin: (name: string) => void;
  onBack: () => void;
  error: string | null;
  busy: boolean;
}) {
  const connection = useClient((s) => s.connection);
  const [name, setName] = useState(session.name());
  const L = T.lobby;
  return (
    <Station>
      <form
        className="start-card"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(name.trim());
        }}
      >
        <Brand />
        <div className="start-invite">
          <span className="nx-caps">{L.joinTitle}</span>
          <span className="room-stub small">
            <span className="nx-caps">{L.roomCode}</span>
            <span className="room-code">{code}</span>
          </span>
        </div>
        <NameField name={name} setName={setName} />
        {error && <p className="start-error">{error}</p>}
        <div className="start-row">
          <button type="submit" className="nx-btn primary big grow" disabled={busy || !name.trim() || connection !== 'connected'}>
            {L.join}
          </button>
          <button type="button" className="nx-btn outline light big" onClick={onBack}>
            {T.S.backHome}
          </button>
        </div>
      </form>
    </Station>
  );
}
