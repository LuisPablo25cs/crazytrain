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
