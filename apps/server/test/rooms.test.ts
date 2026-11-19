import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../src/rooms/RoomManager.js';
import { CODE_ALPHABET, newRoomCode } from '../src/rooms/codes.js';
import { tinyMap } from './harness.js';

function setup() {
  let now = 1_000_000;
  const sent: { socketId: string; event: string }[] = [];
  const manager = new RoomManager(
    tinyMap(),
    { send: (socketId, event) => sent.push({ socketId, event }), detach: () => {} },
    { now: () => now, hostGraceMs: 1000, seed: () => 1 },
  );
  return { manager, sent, advance: (ms: number) => (now += ms) };
}

describe('room codes', () => {
  it('uses 5 characters without look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRoomCode(() => false);
      expect(code).toHaveLength(5);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('never reuses a taken code', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 100; i++) taken.add(newRoomCode((c) => taken.has(c)));
    expect(taken.size).toBe(100);
  });
});

describe('RoomManager cleanup (KTD13)', () => {
  it('deletes an empty lobby after 10 minutes, not before', () => {
    const { manager, advance } = setup();
    const r = manager.handle('s1', { type: 'createRoom', name: 'Ana' });
    expect(r.ok).toBe(true);
    manager.disconnect('s1');
    advance(9 * 60_000);
    expect(manager.sweep()).toEqual([]);
    advance(60_000);
    expect(manager.sweep()).toHaveLength(1);
    expect(manager.rooms.size).toBe(0);
  });

  it('keeps a lobby while someone is connected', () => {
    const { manager, advance } = setup();
    manager.handle('s1', { type: 'createRoom', name: 'Ana' });
    advance(60 * 60_000);
    expect(manager.sweep()).toEqual([]);
  });

  it('keeps a game during a short break and deletes it after an hour with nobody connected', () => {
    const { manager, advance } = setup();
    const created = manager.handle('s1', { type: 'createRoom', name: 'Ana' });
    const code = created.ok ? created.code! : '';
    manager.handle('s2', { type: 'joinRoom', code, name: 'Beto' });
    expect(manager.handle('s1', { type: 'startGame' })).toEqual({ ok: true });
    manager.disconnect('s1');
    manager.disconnect('s2');
    advance(20 * 60_000);
    expect(manager.sweep()).toEqual([]);
    advance(41 * 60_000);
    expect(manager.sweep()).toEqual([code]);
  });

  it('deletes a lobby at once when its last player leaves', () => {
    const { manager } = setup();
    manager.handle('s1', { type: 'createRoom', name: 'Ana' });
    manager.handle('s1', { type: 'leaveRoom' });
    expect(manager.rooms.size).toBe(0);
  });
});

describe('host handover', () => {
  it('passes the host role to the next connected seat after the grace period', () => {
    vi.useFakeTimers();
    try {
      const { manager } = setup();
      const created = manager.handle('s1', { type: 'createRoom', name: 'Ana' });
      const code = created.ok ? created.code! : '';
      manager.handle('s2', { type: 'joinRoom', code, name: 'Beto' });
      const room = manager.rooms.get(code)!;
      const [ana, beto] = room.seats;
      manager.disconnect('s1');
      expect(room.hostSeatId).toBe(ana!.id);
      vi.advanceTimersByTime(1000);
      expect(room.hostSeatId).toBe(beto!.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the host when they come back within the grace period', () => {
    vi.useFakeTimers();
    try {
      const { manager } = setup();
      const created = manager.handle('s1', { type: 'createRoom', name: 'Ana' });
      const code = created.ok ? created.code! : '';
      const token = created.ok ? created.token! : '';
      manager.handle('s2', { type: 'joinRoom', code, name: 'Beto' });
      const room = manager.rooms.get(code)!;
      manager.disconnect('s1');
      manager.handle('s3', { type: 'joinRoom', code, name: 'Ana', token });
      vi.advanceTimersByTime(5000);
      expect(room.hostSeatId).toBe(room.seats[0]!.id);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('map images', () => {
  it('serves files from the map images folder under /maps and nothing else', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createHttpApp } = await import('../src/http.js');
    const dir = mkdtempSync(join(tmpdir(), 'rails-maps-'));
    writeFileSync(join(dir, 'board.jpg'), 'fake image');
    const server = createHttpApp({ mapImagesDir: dir }).listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const ok = await fetch(`http://localhost:${port}/maps/board.jpg`);
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe('fake image');
      expect((await fetch(`http://localhost:${port}/maps/missing.jpg`)).status).toBe(404);
      expect((await fetch(`http://localhost:${port}/maps/..%2Fpackage.json`)).status).not.toBe(200);
    } finally {
      server.close();
    }
  });
});

describe('lobby settings and removing players', () => {
  function room3() {
    const ctx = setup();
    const created = ctx.manager.handle('s1', { type: 'createRoom', name: 'Ana' });
    const code = created.ok ? created.code! : '';
    const b = ctx.manager.handle('s2', { type: 'joinRoom', code, name: 'Beto' });
    ctx.manager.handle('s3', { type: 'joinRoom', code, name: 'Carla' });
    const room = ctx.manager.rooms.get(code)!;
    return { ...ctx, room, betoId: b.ok ? b.seatId! : '', betoToken: b.ok ? b.token! : '', code };
  }

  it('lets the host set trains per player before the start, and the game uses it', () => {
    const { manager, room } = room3();
    expect(manager.handle('s2', { type: 'setSettings', trainsPerPlayer: 20 }).ok).toBe(false);
    expect(manager.handle('s1', { type: 'setSettings', trainsPerPlayer: 20 })).toEqual({ ok: true });
    expect(room.roomView(room.seats[0]!).trainsPerPlayer).toBe(20);
    manager.handle('s1', { type: 'startGame' });
    expect(room.game!.state.players.every((p) => p.trains === 20)).toBe(true);
    expect(manager.handle('s1', { type: 'setSettings', trainsPerPlayer: 30 }).ok).toBe(false);
  });

  it('returns to the default trains with null', () => {
    const { manager, room } = room3();
    manager.handle('s1', { type: 'setSettings', trainsPerPlayer: 20 });
    manager.handle('s1', { type: 'setSettings', trainsPerPlayer: null });
    const view = room.roomView(room.seats[0]!);
    expect(view.trainsPerPlayer).toBe(view.defaultTrains);
  });

  it('removes a player during a game: they cannot rejoin and their turns are skipped', () => {
    const { manager, room, betoId, betoToken, code } = room3();
    manager.handle('s1', { type: 'startGame' });
    expect(manager.handle('s2', { type: 'kick', seatId: '' + room.seats[0]!.id }).ok).toBe(false);
    expect(manager.handle('s1', { type: 'kick', seatId: betoId })).toEqual({ ok: true });
    const beto = room.seatById(betoId)!;
    expect(beto.removed).toBe(true);
    expect(beto.socketId).toBeNull();
    // Beto's initial ticket choice was made for him.
    expect(room.game!.state.players[beto.playerIndex!]!.keptInitial).toBe(true);
    expect(manager.handle('s9', { type: 'joinRoom', code, name: 'Beto', token: betoToken }).ok).toBe(false);
    // Everyone else keeps their initial tickets; play never stops on Beto.
    for (const [socket, seat] of [
      ['s1', room.seats[0]!],
      ['s3', room.seats[2]!],
    ] as const) {
      const offered = room.game!.state.players[seat.playerIndex!]!.offeredTickets;
      manager.handle(socket, {
        type: 'gameAction',
        action: { type: 'keepInitialTickets', ticketIds: offered.slice(0, 2) },
        expectedVersion: room.game!.version,
      });
    }
    for (let turn = 0; turn < 6; turn++) {
      const st = room.game!.state;
      expect(st.currentPlayer).not.toBe(beto.playerIndex);
      const socket = st.currentPlayer === room.seats[0]!.playerIndex ? 's1' : 's3';
      for (let d = 0; d < 2 && room.game!.state.currentPlayer === st.currentPlayer; d++) {
        manager.handle(socket, { type: 'gameAction', action: { type: 'drawBlind' }, expectedVersion: room.game!.version });
      }
    }
  });
});
