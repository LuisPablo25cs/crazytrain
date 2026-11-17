import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import {
  indexMap,
  type CardColor,
  type CardCounts,
  type GameEvent,
  type GameMessage,
  type GameView,
  type MapDefinition,
  type MapIndex,
  type RoomView,
} from '@rails/shared';

export type Connection = 'connecting' | 'connected' | 'disconnected';

export interface LogEntry {
  id: number;
  event: GameEvent;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

export type BoardMode = { kind: 'normal' } | { kind: 'station' };

export interface UiState {
  hoveredRoute: string | null;
  selectedRoute: string | null;
  selectedCity: string | null;
  highlightCities: string[];
  /** Classic HUD: the hand color the player picked; the claim popover pays with it first. */
  handColor: CardColor | 'locomotive' | null;
  /** Classic HUD: my latest claim, shown with the CLAIMED stamp while the train rolls in. */
  claimed: { routeId: string; payment: CardCounts; at: number } | null;
  mode: BoardMode;
  /** Ask the board camera to look at a map-space point. `nonce` makes repeats re-trigger. */
  focus: { x: number; y: number; zoom: number; nonce: number } | null;
}

export interface ClientState {
  connection: Connection;
  room: RoomView | null;
  map: { doc: MapDefinition; index: MapIndex } | null;
  game: { version: number; view: GameView } | null;
  /** Events from the latest snapshot, for animations. */
  lastEvents: GameEvent[];
  log: LogEntry[];
  toast: Toast | null;
  kicked: string | null;
  ui: UiState;
}

export const initialUi: UiState = {
  hoveredRoute: null,
  selectedRoute: null,
  selectedCity: null,
  highlightCities: [],
  handColor: null,
  claimed: null,
  mode: { kind: 'normal' },
  focus: null,
};

export function initialState(): ClientState {
  return {
    connection: 'connecting',
    room: null,
    map: null,
    game: null,
    lastEvents: [],
    log: [],
    toast: null,
    kicked: null,
    ui: initialUi,
  };
}

const LOG_LIMIT = 80;
let nextId = 1;

/** Apply a game snapshot. Older versions are ignored; the same version replaces (a resend after a stale action). */
export function reduceGame(state: ClientState, message: GameMessage): Partial<ClientState> | null {
  if (state.game && message.version < state.game.version) return null;
  const fresh = !state.game || message.version > state.game.version;
  const entries = fresh ? message.events.map((event) => ({ id: nextId++, event })) : [];
  const ui = state.ui;
  const turnChanged = state.game?.view.currentPlayer !== message.view.currentPlayer;
  return {
    game: { version: message.version, view: message.view },
    lastEvents: fresh ? message.events : state.lastEvents,
    log: entries.length ? [...state.log, ...entries].slice(-LOG_LIMIT) : state.log,
    // A new turn closes any half-finished interaction.
    ui: turnChanged ? { ...ui, selectedRoute: null, mode: { kind: 'normal' } } : ui,
  };
}

export function reduceRoom(state: ClientState, room: RoomView): Partial<ClientState> {
  // Leaving a finished game for the lobby clears the old game.
  if (room.phase === 'lobby' && state.game) return { room, game: null, lastEvents: [], log: [], ui: initialUi };
  return { room };
}

export function reduceMap(map: MapDefinition): Partial<ClientState> {
  return { map: { doc: map, index: indexMap(map) } };
}

export const store = createStore<ClientState>(() => initialState());

export function useClient<T>(selector: (s: ClientState) => T): T {
  return useStore(store, selector);
}

export function setUi(patch: Partial<UiState>): void {
  store.setState((s) => ({ ui: { ...s.ui, ...patch } }));
}

export function showToast(text: string, kind: Toast['kind'] = 'error'): void {
  const id = nextId++;
  store.setState({ toast: { id, text, kind } });
  setTimeout(() => {
    if (store.getState().toast?.id === id) store.setState({ toast: null });
  }, kind === 'error' ? 5000 : 3000);
}
