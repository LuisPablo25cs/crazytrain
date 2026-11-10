import { useEffect, useRef, useState } from 'react';
import {
  applyAction,
  applyDisaster,
  DISASTER_KINDS,
  createGame,
  eventsFor,
  indexMap,
  resolveRules,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type Intent,
  type IntentReply,
  type MapDefinition,
  type DisasterKind,
  type GameMode,
  type MapIndex,
  type RoomView,
} from '@rails/shared';
import { setLocalMode } from '../net/socket.js';
import { initialState, reduceGame, store, type ClientState } from '../state/store.js';
import { GameScreen } from '../ui/hud/GameScreen.js';
import { HAZARD_NAMES } from '../ui/strings.js';

const NAMES = ['Ana', 'Beto', 'Carla', 'Dani', 'Eli', 'Fran', 'Gus'];

/** Whose screen to show: someone still choosing starting tickets, otherwise whoever's turn it is. */
function viewerOf(state: GameState): number {
  if (state.phase === 'initialTickets') {
    const pending = state.players.findIndex((p) => !p.keptInitial);
    if (pending >= 0) return pending;
  }
  return state.currentPlayer;
}

function roomFor(state: GameState, doc: MapDefinition, viewer: number): RoomView {
  const seats = state.players.map((p, i) => ({
    id: `seat-${i}`,
    name: p.name,
    color: p.color,
    connected: true,
    isHost: i === 0,
    playerIndex: i,
  }));
  return {
    code: 'EDITOR',
    phase: state.phase === 'finished' ? 'finished' : 'playing',
    you: `seat-${viewer}`,
    hostSeatId: 'seat-0',
    seats,
    toggles: state.rules.expansions,
    mode: state.rules.mode,
    years: state.rules.seasons.years,
    map: { id: doc.id, name: doc.name, cityCount: doc.cities.length, routeCount: doc.routes.length, custom: true },
    limits: { minPlayers: state.rules.players.min, maxPlayers: state.rules.players.max, playerColors: state.rules.playerColors },
  };
}

/**
 * The real game screen, running a throwaway game on the map as it is in the editor (unsaved edits
 * included). It is hot-seat: the screen always shows the player whose move it is.
 */
export function PlayerPreview({ doc, onClose }: { doc: MapDefinition; onClose: () => void }) {
  const [deal, setDeal] = useState(1);
  const [players, setPlayers] = useState(3);
  const [mode, setMode] = useState<GameMode>('seasons');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dealRef = useRef<() => void>(() => {});
  // Test tool: strike a disaster now (Seasons mode).
  const strikeRef = useRef<(kind: DisasterKind, cityId: string) => void>(() => {});
  const [strikeKind, setStrikeKind] = useState<DisasterKind>('earthquake');
  const [strikeCity, setStrikeCity] = useState('');
  dealRef.current = () => setDeal((d) => d + 1);

  useEffect(() => {
    const before = store.getState();
    const snapshot: Partial<ClientState> = {
      connection: before.connection,
      room: before.room,
      map: before.map,
      game: before.game,
      lastEvents: before.lastEvents,
      log: before.log,
      ui: before.ui,
    };
    let index: MapIndex;
    let state: GameState;
    let version = 1;
    try {
      index = indexMap(doc);
      const rules = resolveRules(doc.rules, undefined, undefined, { mode });
      const count = Math.max(rules.players.min, Math.min(players, rules.players.max));
      state = createGame({
        map: index,
        rules,
        players: Array.from({ length: count }, (_, i) => ({ name: NAMES[i]!, color: rules.playerColors[i]! })),
        seed: 1000 + deal,
      }).state;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setError(null);

    const publish = (events: GameEvent[]) => {
      const viewer = viewerOf(state);
      store.setState({
        connection: 'connected',
        room: roomFor(state, doc, viewer),
        map: { doc, index },
        ...(reduceGame(store.getState(), { version, view: viewFor(state, viewer), events: eventsFor(events, viewer) }) ?? {}),
      });
    };

    store.setState({ ...initialState(), connection: 'connected', map: { doc, index } });
    setLocalMode({
      intent(intent: Intent): IntentReply {
        if (intent.type === 'leaveRoom') {
          closeRef.current();
          return { ok: true };
        }
        if (intent.type === 'backToLobby') {
          dealRef.current();
          return { ok: true };
        }
        if (intent.type !== 'gameAction') return { ok: false, error: 'not available in the player view', reason: 'invalid' };
        const result = applyAction(state, index, viewerOf(state), intent.action as Action);
        if (!result.ok) return { ok: false, error: result.error, reason: 'invalid' };
        state = result.state;
        version += 1;
        publish(result.events);
        return { ok: true };
      },
    });
    strikeRef.current = (kind, cityId) => {
      const city = index.cities.get(cityId);
      if (!city || state.phase === 'finished') return;
      const draft = structuredClone(state);
      const events: GameEvent[] = [];
      applyDisaster(draft, index, { kind, cityId, x: city.x, y: city.y }, events);
      state = draft;
      version += 1;
      publish(events);
    };
    publish([]);
    setReady(true);

    return () => {
      setLocalMode(null);
      store.setState(snapshot);
    };
  }, [doc, deal, players, mode]);

  return (
    <div className="player-preview">
      <div className="player-preview-bar">
        <strong>Player view</strong>
        <span className="muted">Your unsaved map, played as a hot-seat game. Nothing here is saved.</span>
        <label>
          Players{' '}
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
            <option value="seasons">Seasons</option>
            <option value="classic">Classic</option>
          </select>
        </label>
        {mode === 'seasons' && (
          <span className="preview-strike" title="Test tool: make a disaster happen now">
            <select value={strikeKind} onChange={(e) => setStrikeKind(e.target.value as DisasterKind)}>
              {DISASTER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {HAZARD_NAMES[k]}
                </option>
              ))}
            </select>
            <select value={strikeCity} onChange={(e) => setStrikeCity(e.target.value)} aria-label="Disaster city">
              <option value="">Most likely city</option>
              {[...doc.cities]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.hazards?.[strikeKind] ? ` (${c.hazards[strikeKind]})` : ''}
                  </option>
                ))}
            </select>
            <button
              className="secondary small"
              onClick={() => {
                const rated = doc.cities.filter((c) => c.hazards?.[strikeKind] === 'high');
                const pick = strikeCity || (rated[Math.floor(Math.random() * rated.length)] ?? doc.cities[0]!).id;
                strikeRef.current(strikeKind, pick);
              }}
            >
              Strike
            </button>
          </span>
        )}
        <button className="secondary small" onClick={() => setDeal((d) => d + 1)}>
          New deal
        </button>
        <button className="primary small" onClick={onClose}>
          Back to the editor
        </button>
      </div>
      {error ? (
        <main className="center-screen">
          <div className="panel narrow">
            <h1>Cannot start a preview game</h1>
            <p>{error}</p>
          </div>
        </main>
      ) : (
        ready && <GameScreen onLeave={onClose} />
      )}
    </div>
  );
}
