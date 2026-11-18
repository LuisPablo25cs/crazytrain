import { useState } from 'react';
import { createRoom, session } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { S, T, tr } from '../strings.js';
import { LanguagePicker } from './LanguagePicker.js';
import { ThemePicker } from './ThemePicker.js';

export function Home({ onEnter }: { onEnter: (code: string) => void }) {
  const connection = useClient((s) => s.connection);
  const [name, setName] = useState(session.name());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = connection === 'connected' && name.trim().length > 0 && !busy;

  const create = async () => {
    setBusy(true);
    const reply = await createRoom(name.trim());
    setBusy(false);
    if (reply.ok && reply.code) onEnter(reply.code);
    else setError(reply.ok ? T.misc.noRoomCode : tr(reply.error));
  };

  return (
    <main className="center-screen home">
      <div className="panel narrow">
        <h1 className="logo">{S.appName}</h1>
        <p className="muted">{S.tagline}</p>
        <label>
          {S.yourName}
          <input value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <button disabled={!ready} onClick={() => void create()}>
          {connection === 'connected' ? S.createRoom : S.connecting}
        </button>
        <form
          className="row join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) {
              session.saveName(name.trim());
              onEnter(code.trim().toUpperCase());
            }
          }}
        >
          <input
            aria-label={S.roomCode}
            placeholder={S.roomCode}
            value={code}
            maxLength={10}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="secondary" disabled={!code.trim()}>
            {S.joinRoom}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <ThemePicker />
        <LanguagePicker />
      </div>
    </main>
  );
}
