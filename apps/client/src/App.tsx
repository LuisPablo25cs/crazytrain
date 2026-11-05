import { lazy, Suspense, useEffect, useState } from 'react';
import { connect, joinRoom, session } from './net/socket.js';
import { roomCodeFromPath } from './net/session.js';
import { store, useClient } from './state/store.js';
import { Home } from './ui/lobby/Home.js';
import { Lobby } from './ui/lobby/Lobby.js';
import { GameScreen } from './ui/hud/GameScreen.js';
import { S } from './ui/strings.js';
import { Overlays } from './ui/Overlays.js';

// Dev-only map editor, loaded only when someone opens /editor.
const EditorScreen = lazy(() => import('./editor/EditorScreen.js').then((m) => ({ default: m.EditorScreen })));

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = (next: string) => {
    // Keep `?seat=` so dev windows stay separate players.
    history.pushState(null, '', next + location.search);
    setPath(next);
  };
  return [path, navigate];
}

export function App() {
  const [path, navigate] = usePath();
  const code = roomCodeFromPath(path);
  const kicked = useClient((s) => s.kicked);

  useEffect(() => {
    connect();
  }, []);

  if (path === '/editor') {
    return (
      <Suspense fallback={<main className="center-screen">Loading the editor…</main>}>
        <EditorScreen />
      </Suspense>
    );
  }

  let screen;
  if (kicked) {
    screen = (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>{S.kickedTitle}</h1>
          <p>{kicked}</p>
          <button
            onClick={() => {
              store.setState({ kicked: null });
              navigate('/');
            }}
          >
            {S.backHome}
          </button>
        </div>
      </main>
    );
  } else if (!code) {
    screen = <Home onEnter={(c) => navigate(`/r/${c}`)} />;
  } else {
    screen = <RoomScreen code={code} onLeave={() => navigate('/')} />;
  }
  return (
    <>
      {screen}
      <Overlays />
    </>
  );
}

function RoomScreen({ code, onLeave }: { code: string; onLeave: () => void }) {
  const room = useClient((s) => s.room);
  const connection = useClient((s) => s.connection);
  const [name, setName] = useState(session.name());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inRoom = room?.code === code;

  const enter = async (nickname: string) => {
    setBusy(true);
    const reply = await joinRoom(code, nickname);
    setBusy(false);
    setError(reply.ok ? null : reply.error);
  };

  // A stored token means we were here before: rejoin the same seat without asking (R4).
  useEffect(() => {
    if (!inRoom && connection === 'connected' && session.token(code)) void enter(session.name());
  }, [code, connection]);

  if (!inRoom) {
    return (
      <main className="center-screen">
        <form
          className="panel narrow"
          onSubmit={(e) => {
            e.preventDefault();
            void enter(name.trim());
          }}
        >
          <h1>
            {S.joinTitle} <span className="code">{code}</span>
          </h1>
          <label>
            {S.yourName}
            <input value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit" disabled={busy || !name.trim() || connection !== 'connected'}>
              {connection === 'connected' ? S.joinRoom : S.connecting}
            </button>
            <button type="button" className="secondary" onClick={onLeave}>
              {S.backHome}
            </button>
          </div>
        </form>
      </main>
    );
  }
  if (room.phase === 'lobby') return <Lobby onLeave={onLeave} />;
  return <GameScreen onLeave={onLeave} />;
}
