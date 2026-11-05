import { afterEach, describe, expect, it } from 'vitest';
import {
  indexMap,
  routeClaimError,
  routePaymentOptions,
  tunnelExtraOptions,
  type ClientAction,
  type GameView,
  type MapDefinition,
} from '@rails/shared';
import { roomWith, startServer, tinyMap, type TestClient, type TestServer } from './harness.js';

let t: TestServer;
afterEach(async () => {
  await t?.stop();
});

async function startGame(players: TestClient[]): Promise<void> {
  const r = await players[0]!.send({ type: 'startGame' });
  expect(r).toEqual({ ok: true });
  await Promise.all(players.map((p) => p.waitFor(() => p.game !== null, 'game start')));
}

async function keepAllInitial(players: TestClient[]): Promise<void> {
  for (const p of players) {
    const r = await p.send({
      type: 'gameAction',
      action: { type: 'keepInitialTickets', ticketIds: p.game!.view.me!.offeredTickets },
      expectedVersion: p.game!.version,
    });
    expect(r).toEqual({ ok: true });
  }
  await Promise.all(players.map((p) => p.waitFor(() => p.game!.view.phase === 'playing', 'playing')));
}

describe('rooms over sockets', () => {
  it('creates a room with a 5-character code; two guests join and see three seats', async () => {
    t = await startServer();
    const players = await roomWith(t, 2);
    expect(players[0]!.code).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    for (const p of players) {
      expect(p.room!.seats.map((s) => s.name)).toEqual(['Host', 'Guest1', 'Guest2']);
      expect(p.map?.id).toBe('tiny');
    }
    expect(players[1]!.room!.seats[0]!.isHost).toBe(true);
  });

  it('rejects an eighth player in a full 7-seat room', async () => {
    t = await startServer();
    const players = await roomWith(t, 6);
    const extra = await t.client();
    const r = await extra.join(players[0]!.code!, 'Late');
    expect(r).toMatchObject({ ok: false, reason: 'full' });
    expect(r.ok ? '' : r.error).toMatch(/full/);
  });

  it('rejects an unknown room code', async () => {
    t = await startServer();
    const c = await t.client();
    expect(await c.join('ZZZZZ', 'Ana')).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('renames duplicate nicknames', async () => {
    t = await startServer();
    const host = await t.client();
    await host.create('Ana');
    const other = await t.client();
    await other.join(host.code!, 'ana');
    await host.waitFor(() => host.room?.seats.length === 2);
    expect(host.room!.seats.map((s) => s.name)).toEqual(['Ana', 'ana 2']);
  });

  it('lets only the host start, and only with at least 2 players', async () => {
    t = await startServer();
    const host = await t.client();
    await host.create('Solo');
    expect(await host.send({ type: 'startGame' })).toMatchObject({ ok: false, error: expect.stringMatching(/2 to 7/) });
    const guest = await t.client();
    await guest.join(host.code!, 'Guest');
    expect(await guest.send({ type: 'startGame' })).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('rejects malformed messages without crashing', async () => {
    t = await startServer();
    const c = await t.client();
    expect(await c.send({ type: 'nonsense' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await c.send({ type: 'createRoom', name: '' })).toMatchObject({ ok: false, reason: 'invalid' });
    const missingFields: Record<string, unknown> = { type: 'gameAction', action: { type: 'claimRoute' }, expectedVersion: 1 };
    expect(await c.send(missingFields)).toMatchObject({ ok: false });
    expect(await c.create('Still fine')).toMatchObject({ ok: true });
  });

  it('applies host toggles and broadcasts them', async () => {
    t = await startServer();
    const [host, guest] = await roomWith(t, 1);
    expect(await guest!.send({ type: 'setToggles', toggles: { stations: false } })).toMatchObject({ reason: 'forbidden' });
    expect(await host!.send({ type: 'setToggles', toggles: { stations: false } })).toEqual({ ok: true });
    await guest!.waitFor(() => guest!.room?.toggles.stations === false, 'toggle');
    expect(guest!.room!.toggles).toEqual({ tunnels: true, ferries: true, stations: false, longTickets: true });
  });
});

describe('maps', () => {
  function customMap(edit?: (m: MapDefinition) => void): MapDefinition {
    const m = tinyMap();
    m.id = 'custom';
    m.name = 'Custom';
    edit?.(m);
    return m;
  }

  it('replaces the map for every client when the host uploads a valid map', async () => {
    t = await startServer();
    const [host, guest] = await roomWith(t, 1);
    expect(await host!.send({ type: 'setMap', map: customMap() })).toEqual({ ok: true });
    await guest!.waitFor(() => guest!.map?.id === 'custom' && guest!.room?.map.custom === true, 'custom map');
    expect(await host!.send({ type: 'setMap', map: null })).toEqual({ ok: true });
    await guest!.waitFor(() => guest!.map?.id === 'tiny', 'starter map back');
  });

  it('returns validator errors to the host only for an invalid map', async () => {
    t = await startServer();
    const [host, guest] = await roomWith(t, 1);
    const mapsSeen = guest!.map;
    const bad = customMap((m) => (m.routes[0]!.to = 'nowhere'));
    const r = await host!.send({ type: 'setMap', map: bad });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).toMatch(/missing city "nowhere"/);
    expect(guest!.map).toBe(mapsSeen);
  });

  it('accepts a 1.5 MB map upload', async () => {
    t = await startServer();
    const [host, guest] = await roomWith(t, 1);
    const big = customMap((m) => (m.description = 'x'.repeat(1_500_000)));
    expect(await host!.send({ type: 'setMap', map: big })).toEqual({ ok: true });
    await guest!.waitFor(() => guest!.map?.id === 'custom', 'big map', 5000);
  });

  it('sends the uploaded map to a player who reconnects mid-game', async () => {
    t = await startServer();
    const players = await roomWith(t, 1);
    await players[0]!.send({ type: 'setMap', map: customMap() });
    await startGame(players);
    const guest = players[1]!;
    guest.socket.disconnect();
    const back = await t.client();
    await back.join(guest.code!, 'ignored', guest.token);
    await back.waitFor(() => back.map !== null && back.game !== null, 'map and game');
    expect(back.map!.id).toBe('custom');
  });
});

describe('playing over sockets', () => {
  it('sends every client a snapshot after an action, with only their own hand', async () => {
    t = await startServer();
    const players = await roomWith(t, 2);
    await startGame(players);
    await keepAllInitial(players);
    const view = players[0]!.game!.view;
    const current = players.find((p) => p.game!.view.me!.index === view.currentPlayer)!;
    const before = current.game!.version;
    expect(await current.send({ type: 'gameAction', action: { type: 'drawBlind' }, expectedVersion: before })).toEqual({ ok: true });
    await Promise.all(players.map((p) => p.waitFor(() => p.game!.version === before + 1, 'next version')));
    players.forEach((p, i) => {
      const g = p.game!;
      expect(g.view.me!.index).toBe(i);
      for (const pub of g.view.players) expect(pub).not.toHaveProperty('hand');
      const drew = g.events.find((e) => e.type === 'drewBlind');
      expect(drew).toBeDefined();
      if (p === current) expect(drew).toHaveProperty('secret');
      else expect(drew).not.toHaveProperty('secret');
    });
  });

  it('accepts initial ticket choices sent at the same version by different players', async () => {
    t = await startServer();
    const players = await roomWith(t, 1);
    await startGame(players);
    const version = players[0]!.game!.version;
    const replies = await Promise.all(
      players.map((p) =>
        p.send({ type: 'gameAction', action: { type: 'keepInitialTickets', ticketIds: p.game!.view.me!.offeredTickets }, expectedVersion: version }),
      ),
    );
    expect(replies).toEqual([{ ok: true }, { ok: true }]);
  });

  it('rejects a stale turn action and resends the current snapshot', async () => {
    t = await startServer();
    const players = await roomWith(t, 1);
    await startGame(players);
    await keepAllInitial(players);
    const current = players.find((p) => p.game!.view.me!.index === p.game!.view.currentPlayer)!;
    const sent = current.games.length;
    const r = await current.send({ type: 'gameAction', action: { type: 'drawBlind' }, expectedVersion: 1 });
    expect(r).toMatchObject({ ok: false, reason: 'stale' });
    await current.waitFor(() => current.games.length > sent, 'resent snapshot');
  });

  it('Covers AE7. a player who reconnects with their token gets the same seat and their own hand', async () => {
    t = await startServer();
    const players = await roomWith(t, 2);
    await startGame(players);
    await keepAllInitial(players);
    const c = players[2]!;
    const hand = c.game!.view.me!.hand;
    const seatId = c.room!.you;
    c.socket.disconnect();
    await players[0]!.waitFor(() => players[0]!.room!.seats.some((s) => s.id === seatId && !s.connected), 'disconnect seen');
    const back = await t.client();
    const r = await back.join(c.code!, 'whatever', c.token);
    expect(r).toMatchObject({ ok: true, seatId });
    await back.waitFor(() => back.game !== null && back.room !== null, 'snapshot');
    expect(back.room!.you).toBe(seatId);
    expect(back.game!.view.me).toMatchObject({ index: 2, hand });
    await players[0]!.waitFor(() => players[0]!.room!.seats.every((s) => s.connected), 'reconnect seen');
  });

  it('lets the newest window win when the same token connects twice', async () => {
    t = await startServer();
    const [host, guest] = await roomWith(t, 1);
    const second = await t.client();
    await second.join(guest!.code!, 'Guest1', guest!.token);
    await guest!.waitFor(() => guest!.kicked !== null, 'old window told');
    expect(await guest!.send({ type: 'setColor', color: 'green' })).toMatchObject({ ok: false });
    expect(await second.send({ type: 'setColor', color: 'green' })).toEqual({ ok: true });
    await host!.waitFor(() => host!.room!.seats[1]!.color === 'green', 'color change');
  });

  it("lets the host skip a disconnected player's turn", async () => {
    t = await startServer();
    const players = await roomWith(t, 2);
    await startGame(players);
    await keepAllInitial(players);
    const view = players[0]!.game!.view;
    let currentIdx = view.currentPlayer;
    if (currentIdx === 0) {
      // Make it a guest's turn first.
      const v = players[0]!.game!.version;
      await players[0]!.send({ type: 'gameAction', action: { type: 'drawBlind' }, expectedVersion: v });
      await players[0]!.waitFor(() => players[0]!.game!.version > v);
      await players[0]!.send({ type: 'gameAction', action: { type: 'drawBlind' }, expectedVersion: v + 1 });
      await players[0]!.waitFor(() => players[0]!.game!.view.currentPlayer !== 0);
      currentIdx = players[0]!.game!.view.currentPlayer;
    }
    const absent = players[currentIdx]!;
    const absentSeat = absent.room!.you;
    expect(await players[0]!.send({ type: 'skipPlayer', seatId: absentSeat })).toMatchObject({ ok: false, error: /connected/ });
    absent.socket.disconnect();
    await players[0]!.waitFor(() => players[0]!.room!.seats.some((s) => s.id === absentSeat && !s.connected));
    expect(await players[0]!.send({ type: 'skipPlayer', seatId: absentSeat })).toEqual({ ok: true });
    await players[0]!.waitFor(() => players[0]!.game!.view.currentPlayer === (currentIdx + 1) % 3, 'next player');
  });

  it('hands the host role to the next connected player when the host drops mid-game', async () => {
    t = await startServer({ rooms: { seed: () => 5, hostGraceMs: 50 } });
    const players = await roomWith(t, 2);
    await startGame(players);
    const guestSeat = players[1]!.room!.you;
    players[0]!.socket.disconnect();
    await players[1]!.waitFor(() => players[1]!.room!.hostSeatId === guestSeat, 'host handover', 2000);
    const hostSeat = players[1]!.room!.seats[0]!.id;
    // The new host can skip the old host's pending ticket choice.
    expect(await players[1]!.send({ type: 'skipPlayer', seatId: hostSeat })).toEqual({ ok: true });
  });

  it('plays a 3-client game to Finished with scripted actions', async () => {
    t = await startServer();
    const players = await roomWith(t, 2);
    const small = tinyMap();
    small.id = 'short';
    small.rules = { trainsPerPlayer: 10, expansions: { stations: false } };
    expect(await players[0]!.send({ type: 'setMap', map: small })).toEqual({ ok: true });
    await Promise.all(players.map((p) => p.waitFor(() => p.map?.id === 'short')));
    await startGame(players);
    await keepAllInitial(players);
    const index = indexMap(small);

    const choose = (view: GameView): ClientAction => {
      const me = view.me!;
      const turn = view.turn;
      if (turn.kind === 'tunnel') {
        const extra = tunnelExtraOptions(turn.color, turn.extra, me.hand)[0];
        return extra ? { type: 'resolveTunnel', extra } : { type: 'withdrawTunnel' };
      }
      if (turn.kind === 'choosingTickets') return { type: 'keepTickets', ticketIds: [me.offeredTickets[0]!] };
      const canBlind = view.drawPileCount + view.discardCount > 0;
      if (turn.kind === 'secondDraw') {
        if (canBlind) return { type: 'drawBlind' };
        return { type: 'drawFaceUp', slot: view.market.findIndex((c) => c !== null && c !== 'locomotive') };
      }
      const board = { rules: view.rules, routeOwners: view.routeOwners, playerCount: view.players.length };
      const trains = view.players[me.index]!.trains;
      for (const r of [...small.routes].sort((a, b) => b.length - a.length)) {
        if (routeClaimError(board, index, r.id, me.index, trains) !== null) continue;
        const pay = routePaymentOptions(r, me.hand, view.rules)[0];
        if (pay) return { type: 'claimRoute', routeId: r.id, payment: pay };
      }
      if (canBlind) return { type: 'drawBlind' };
      const slot = view.market.findIndex((c) => c !== null);
      if (slot >= 0) return { type: 'drawFaceUp', slot };
      if (view.ticketDeckCount > 0) return { type: 'drawTickets' };
      return { type: 'pass' };
    };

    for (let step = 0; step < 1500; step++) {
      const view = players[0]!.game!.view;
      if (view.phase === 'finished') break;
      const actor = players[view.currentPlayer]!;
      const version = actor.game!.version;
      const action = choose(actor.game!.view);
      const r = await actor.send({ type: 'gameAction', action, expectedVersion: version });
      if (!r.ok) throw new Error(`step ${step}: ${action.type}: ${r.error}`);
      await Promise.all(players.map((p) => p.waitFor(() => p.game!.version > version, 'broadcast')));
    }
    for (const p of players) {
      expect(p.game!.view.phase).toBe('finished');
      expect(p.game!.view.results!.players).toHaveLength(3);
    }
    await players[0]!.waitFor(() => players[0]!.room!.phase === 'finished');
    expect(await players[0]!.send({ type: 'backToLobby' })).toEqual({ ok: true });
    await players[2]!.waitFor(() => players[2]!.room!.phase === 'lobby', 'back to lobby');
  }, 30_000);
});
