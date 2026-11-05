import { describe, expect, it, vi } from 'vitest';
import type { GameMessage, GameView, RoomView } from '@rails/shared';
import { Session, roomCodeFromPath, type SafeStorage } from '../net/session.js';
import { loadTheme, DEFAULT_THEME } from '../theme/themes.js';
import { initialState, reduceGame, reduceRoom, type ClientState } from './store.js';

function message(version: number, currentPlayer = 0): GameMessage {
  return {
    version,
    view: { currentPlayer, phase: 'playing' } as GameView,
    events: [{ type: 'passed', player: currentPlayer }],
  };
}

function apply(state: ClientState, m: GameMessage): ClientState {
  const patch = reduceGame(state, m);
  return patch ? { ...state, ...patch } : state;
}

describe('reduceGame', () => {
  it('replaces the game on a newer version and logs its events', () => {
    let s = apply(initialState(), message(3));
    s = apply(s, message(4, 1));
    expect(s.game?.version).toBe(4);
    expect(s.log.map((l) => l.event)).toEqual([
      { type: 'passed', player: 0 },
      { type: 'passed', player: 1 },
    ]);
  });

  it('ignores an older snapshot that arrives late', () => {
    let s = apply(initialState(), message(5));
    const before = s;
    s = apply(s, message(4, 2));
    expect(s).toBe(before);
    expect(s.game?.version).toBe(5);
  });

  it('accepts a resend of the same version without logging it twice', () => {
    let s = apply(initialState(), message(2));
    s = apply(s, message(2));
    expect(s.log).toHaveLength(1);
  });

  it('closes a half-finished selection when the turn changes', () => {
    let s = apply(initialState(), message(1, 0));
    s = { ...s, ui: { ...s.ui, selectedRoute: 'some-route', mode: { kind: 'station' } } };
    s = apply(s, message(2, 1));
    expect(s.ui.selectedRoute).toBeNull();
    expect(s.ui.mode).toEqual({ kind: 'normal' });
  });
});

describe('reduceRoom', () => {
  it('clears the old game when the room goes back to the lobby', () => {
    const s = apply(initialState(), message(9));
    const next = { ...s, ...reduceRoom(s, { phase: 'lobby' } as RoomView) };
    expect(next.game).toBeNull();
    expect(next.log).toEqual([]);
  });
});

function memoryStorage(): SafeStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('Session', () => {
  it('sends a reconnect when a token is stored for the room', () => {
    const session = new Session(memoryStorage(), null);
    session.saveToken('ABCDE', 'secret');
    expect(session.joinIntent('ABCDE', 'Ana')).toEqual({ type: 'joinRoom', code: 'ABCDE', name: 'Ana', token: 'secret' });
    expect(session.joinIntent('ZZZZZ', 'Ana')).toEqual({ type: 'joinRoom', code: 'ZZZZZ', name: 'Ana' });
  });

  it('keeps separate tokens per dev seat label, so windows of one browser are separate players', () => {
    const storage = memoryStorage();
    const a = new Session(storage, 'a');
    const b = new Session(storage, 'b');
    a.saveToken('ABCDE', 'token-a');
    expect(b.token('ABCDE')).toBeNull();
    expect(a.token('ABCDE')).toBe('token-a');
  });

  it('works when storage throws', () => {
    const broken: SafeStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const session = new Session(broken, null);
    expect(() => session.saveToken('ABCDE', 'x')).not.toThrow();
    expect(session.token('ABCDE')).toBeNull();
  });

  it('reads room codes from paths', () => {
    expect(roomCodeFromPath('/r/abcde')).toBe('ABCDE');
    expect(roomCodeFromPath('/')).toBeNull();
    expect(roomCodeFromPath('/r/')).toBeNull();
  });
});

describe('themes', () => {
  it('falls back to the default theme when a theme file is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadTheme({ id: 'broken' }, DEFAULT_THEME)).toBe(DEFAULT_THEME);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
