import { describe, expect, it } from 'vitest';
import {
  advanceMonth,
  applyAction,
  applyDisaster,
  boardOf,
  effectiveRoute,
  excavatorsNeeded,
  inWinter,
  ownedEdges,
  piecePositions,
  repairCost,
  repairPaymentOptions,
  rollDisaster,
  routeClaimError,
  routePaymentOptions,
  routePoints,
  routeStatus,
  tunnelExtraOptions,
  nextStationCost,
  stationCities,
  stationPaymentOptions,
  type Action,
  type GameEvent,
  type MapIndex,
  type RulesOverride,
  type Strike,
} from '../../src/index.js';
import { act, newGame, playingGame, reject, setHand, tinyVariant, type TestGame } from './helpers.js';

const QUIET: RulesOverride = { mode: 'seasons', seasons: { disasterChance: 0 } };

function seasonsGame(players = 3, override: RulesOverride = QUIET, map?: MapIndex): TestGame {
  const game = playingGame(players, override, map ? { map } : {});
  game.state.firstPlayer = 0;
  return game;
}

/** Give a route to a player as if they had claimed it. */
function own(game: TestGame, routeId: string, player: number): void {
  const route = game.map.routes.get(routeId)!;
  game.state.routeOwners[routeId] = player;
  game.state.players[player]!.trains -= route.length;
  game.state.players[player]!.routePoints += routePoints(game.state.rules, route.length);
}

function strike(game: TestGame, kind: Strike['kind'], cityId: string, at?: { x: number; y: number }): GameEvent {
  const city = game.map.cities.get(cityId)!;
  const events: GameEvent[] = [];
  applyDisaster(game.state, game.map, { kind, cityId, x: at?.x ?? city.x, y: at?.y ?? city.y }, events);
  return events.find((e) => e.type === 'disaster')!;
}

function months(game: TestGame, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) advanceMonth(game.state, game.map, events);
  return events;
}

const status = (game: TestGame, routeId: string, viewer: number | null = 0) => routeStatus(boardOf(game.state), game.map, routeId, viewer);

describe('calendar', () => {
  it('starts a new month each time play returns to the first player', () => {
    const game = seasonsGame(3);
    for (const p of [0, 1]) act(game, p, { type: 'skip' });
    expect(game.state.month).toBe(0);
    const events = act(game, 2, { type: 'skip' });
    expect(game.state.month).toBe(1);
    expect(events).toContainEqual({ type: 'monthStarted', month: 1 });
  });

  it('ends after the December round of the last year', () => {
    const game = seasonsGame(2, { ...QUIET, seasons: { disasterChance: 0, years: 1 } });
    for (let round = 0; round < 12; round++) for (const p of [0, 1]) act(game, p, { type: 'skip' });
    expect(game.state.phase).toBe('finished');
    expect(game.state.month).toBe(12);
  });

  it('leaves classic games without months', () => {
    const game = playingGame(2);
    game.state.firstPlayer = 0;
    act(game, 0, { type: 'skip' });
    act(game, 1, { type: 'skip' });
    expect(game.state.month).toBe(0);
  });

  it('only rolls disasters that are in season', () => {
    const map = tinyVariant((m) => (m.cities[1]!.hazards = { hurricane: 'high' }));
    const game = seasonsGame(2, { mode: 'seasons', seasons: { disasterChance: 1 } }, map);
    game.state.month = 0; // January: no hurricanes
    expect(rollDisaster(game.state, game.map)).toBeNull();
    game.state.month = 8; // September
    expect(rollDisaster(game.state, game.map)).toMatchObject({ kind: 'hurricane', cityId: 'bravo' });
  });
});

describe('earthquakes', () => {
  it('break built routes touching nearby cities, which stop connecting until repaired', () => {
    const game = seasonsGame();
    own(game, 'alpha-bravo-1', 0);
    const event = strike(game, 'earthquake', 'bravo');
    expect(event).toMatchObject({ type: 'disaster', kind: 'earthquake', damaged: ['alpha-bravo-1'] });
    expect(status(game, 'alpha-bravo-1')).toMatchObject({ kind: 'owned', damaged: true });
    expect(ownedEdges(game.state, game.map, 0)).toEqual([]);
    // Unbuilt routes nearby are not affected.
    expect(game.state.damage['bravo-charlie']).toBeUndefined();
  });

  it('cost 1/2/3 cards by length, half again for tunnels, paid in the route color', () => {
    const game = seasonsGame();
    own(game, 'alpha-bravo-1', 0); // length 2, red
    own(game, 'charlie-foxtrot', 1); // length 4 tunnel, white
    strike(game, 'earthquake', 'bravo');
    strike(game, 'earthquake', 'charlie');
    const board = boardOf(game.state);
    expect(repairCost(board, game.map, 'alpha-bravo-1')).toEqual({ cards: 1, excavators: 0 });
    expect(repairCost(board, game.map, 'charlie-foxtrot')).toEqual({ cards: 3, excavators: 0 });

    setHand(game, 0, { blue: 3, red: 1 });
    expect(reject(game, 0, { type: 'repairRoute', routeId: 'alpha-bravo-1', payment: { blue: 1 } })).toMatch(/red cards or locomotives/);
    act(game, 0, { type: 'repairRoute', routeId: 'alpha-bravo-1', payment: { red: 1 } });
    expect(game.state.damage['alpha-bravo-1']).toBeUndefined();
    expect(game.state.currentPlayer).toBe(1);
  });

  it('after a year unrepaired, the owner loses it and anyone may claim it by paying the repair', () => {
    const game = seasonsGame();
    own(game, 'alpha-bravo-1', 0);
    strike(game, 'earthquake', 'bravo');
    const events = months(game, 12);
    expect(events).toContainEqual({ type: 'routeLost', player: 0, routeId: 'alpha-bravo-1', reason: 'deadline', claimable: true });
    expect(game.state.players[0]!.trains).toBe(45);
    expect(game.state.players[0]!.routePoints).toBe(0);
    expect(status(game, 'alpha-bravo-1', 1)).toEqual({ kind: 'abandoned', cost: 1 });

    game.state.currentPlayer = 1;
    setHand(game, 1, { red: 2 });
    expect(reject(game, 1, { type: 'claimRoute', routeId: 'alpha-bravo-1', payment: { red: 2 } })).toMatch(/repair it to claim/);
    act(game, 1, { type: 'repairRoute', routeId: 'alpha-bravo-1', payment: { red: 1 } });
    expect(game.state.routeOwners['alpha-bravo-1']).toBe(1);
    expect(game.state.players[1]!.trains).toBe(43);
    expect(game.state.players[1]!.routePoints).toBe(2);
  });
});

describe('hurricanes', () => {
  it('break one piece, one more every 3 months, and the route is lost when all are broken', () => {
    const game = seasonsGame();
    own(game, 'charlie-foxtrot', 0); // length 4, near nothing else at foxtrot? use a point on it
    const [a, , , d] = piecePositions(game.map, game.map.routes.get('charlie-foxtrot')!);
    strike(game, 'hurricane', 'charlie', { x: (a!.x + d!.x) / 2, y: (a!.y + d!.y) / 2 });
    expect(game.state.damage['charlie-foxtrot']!.broken).toHaveLength(1);
    expect(repairCost(boardOf(game.state), game.map, 'charlie-foxtrot')).toEqual({ cards: 1, excavators: 0 });
    months(game, 2);
    expect(game.state.damage['charlie-foxtrot']!.broken).toHaveLength(1);
    months(game, 1);
    expect(game.state.damage['charlie-foxtrot']!.broken).toHaveLength(2);
    const events = months(game, 6);
    expect(events).toContainEqual(expect.objectContaining({ type: 'routeLost', routeId: 'charlie-foxtrot', reason: 'destroyed', claimable: false }));
    expect(game.state.routeOwners['charlie-foxtrot']).toBeUndefined();
    expect(status(game, 'charlie-foxtrot')).toEqual({ kind: 'free' });
  });

  it('make building inside their circle need an excavator for a year', () => {
    const game = seasonsGame();
    strike(game, 'hurricane', 'alpha');
    const route = game.map.routes.get('alpha-delta')!; // green, length 2
    expect(excavatorsNeeded(boardOf(game.state), game.map, route)).toBe(1);
    setHand(game, 0, { green: 2, excavator: 1 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'alpha-delta', payment: { green: 2 } })).toMatch(/1 excavator/);
    expect(routePaymentOptions(route, game.state.players[0]!.hand, game.state.rules, 1)).toEqual([{ green: 2, excavator: 1 }]);
    act(game, 0, { type: 'claimRoute', routeId: 'alpha-delta', payment: { green: 2, excavator: 1 } });
    months(game, 12);
    expect(excavatorsNeeded(boardOf(game.state), game.map, game.map.routes.get('alpha-bravo-2')!)).toBe(0);
  });
});

describe('volcanoes', () => {
  it('make nearby routes unusable for a year, then gray and free', () => {
    const game = seasonsGame();
    own(game, 'alpha-bravo-1', 0); // red
    strike(game, 'volcano', 'alpha');
    expect(status(game, 'alpha-bravo-1')).toMatchObject({ kind: 'owned', blocked: true });
    expect(status(game, 'alpha-delta')).toEqual({ kind: 'ash', until: 12 });
    expect(ownedEdges(game.state, game.map, 0)).toEqual([]);
    setHand(game, 0, { green: 2 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'alpha-delta', payment: { green: 2 } })).toMatch(/volcanic ash/);

    const events = months(game, 12);
    expect(events).toContainEqual({ type: 'routeLost', player: 0, routeId: 'alpha-bravo-1', reason: 'volcano', claimable: false });
    expect(events).toContainEqual({ type: 'routeGrayed', routeId: 'alpha-bravo-1' });
    expect(game.state.players[0]!.trains).toBe(45);
    expect(effectiveRoute(boardOf(game.state), game.map, 'alpha-bravo-1')!.color).toBe('gray');
    // A red route that turned gray now takes any color.
    setHand(game, 0, { yellow: 2 });
    act(game, 0, { type: 'claimRoute', routeId: 'alpha-bravo-1', payment: { yellow: 2 } });
  });
});

describe('tornados', () => {
  it('throw pieces off built routes and make building inside need an excavator per 3 length', () => {
    const game = seasonsGame(3, { mode: 'seasons', seasons: { disasterChance: 0, tornado: { pieceChance: 1 } } });
    own(game, 'delta-hotel', 1); // length 6, gray
    const pieces = piecePositions(game.map, game.map.routes.get('delta-hotel')!);
    const mid = pieces[2]!;
    strike(game, 'tornado', 'delta', mid);
    const broken = game.state.damage['delta-hotel']!.broken;
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.length).toBeLessThan(6);
    expect(repairCost(boardOf(game.state), game.map, 'delta-hotel')).toEqual({ cards: broken.length, excavators: 0 });

    const near = game.map.routes.get('delta-echo')!; // length 3
    const needs = piecePositions(game.map, near).some((p) => Math.hypot(p.x - mid.x, p.y - mid.y) <= 45);
    expect(excavatorsNeeded(boardOf(game.state), game.map, near)).toBe(needs ? 1 : 0);
    months(game, 1);
    expect(excavatorsNeeded(boardOf(game.state), game.map, near)).toBe(0);
  });
});

describe('tsunamis', () => {
  it('wash whole lines away inside the zone, and partly washed lines need excavators to repair', () => {
    const game = seasonsGame();
    own(game, 'charlie-echo', 0); // length 1, close to charlie
    own(game, 'delta-hotel', 1); // length 6, long
    const pieces = piecePositions(game.map, game.map.routes.get('delta-hotel')!);
    const event = strike(game, 'tsunami', 'charlie', { x: pieces[0]!.x, y: pieces[0]!.y });
    expect(event).toMatchObject({ kind: 'tsunami' });
    const damage = game.state.damage['delta-hotel']!;
    expect(damage.cause).toBe('tsunami');
    const cost = repairCost(boardOf(game.state), game.map, 'delta-hotel')!;
    expect(cost).toEqual({ cards: 0, excavators: Math.ceil(damage.broken.length / 2) });

    game.state.currentPlayer = 1;
    setHand(game, 1, { excavator: cost.excavators, red: 5 });
    expect(reject(game, 1, { type: 'repairRoute', routeId: 'delta-hotel', payment: { red: cost.excavators } })).toMatch(/excavator/);
    act(game, 1, { type: 'repairRoute', routeId: 'delta-hotel', payment: { excavator: cost.excavators } });
    expect(game.state.damage['delta-hotel']).toBeUndefined();

    // Right on top of a short line: all of it is washed away at once.
    const short = piecePositions(game.map, game.map.routes.get('charlie-echo')!)[0]!;
    const hit = strike(game, 'tsunami', 'charlie', short);
    expect(hit).toMatchObject({ lost: expect.arrayContaining(['charlie-echo']) });
    expect(game.state.routeOwners['charlie-echo']).toBeUndefined();
    expect(game.state.players[0]!.trains).toBe(45);
  });
});

describe('snow storms', () => {
  const snowy = () =>
    tinyVariant((m) => {
      m.cities[0]!.hazards = { snow: 'high' }; // alpha
      m.cities[0]!.geo = { lat: 58, lon: -100 };
      m.cities[3]!.hazards = { snow: 'medium' }; // delta
      m.cities[3]!.geo = { lat: 40, lon: -100 };
    });

  it('stop building in winter; the far north has the longest winter', () => {
    const map = snowy();
    const game = seasonsGame(2, QUIET, map);
    const rules = game.state.rules;
    expect([10, 11, 0, 1, 2].map((m) => inWinter(map, rules, 'alpha', m))).toEqual([true, true, true, true, true]);
    expect(inWinter(map, rules, 'alpha', 3)).toBe(false);
    expect(inWinter(map, rules, 'delta', 0)).toBe(true);
    expect(inWinter(map, rules, 'delta', 1)).toBe(false);

    setHand(game, 0, { green: 2 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'alpha-delta', payment: { green: 2 } })).toMatch(/snow/);
    game.state.month = 4;
    act(game, 0, { type: 'claimRoute', routeId: 'alpha-delta', payment: { green: 2 } });
  });
});

// --- A whole Seasons game, played by a simple scripted player ------------------

function chooseAction(game: TestGame, tick: number): Action {
  const { state, map } = game;
  const me = state.currentPlayer;
  const p = state.players[me]!;
  const turn = state.turn;
  if (turn.kind === 'tunnel') {
    const options = tunnelExtraOptions(turn.color, turn.extra, p.hand);
    return options[0] ? { type: 'resolveTunnel', extra: options[0] } : { type: 'withdrawTunnel' };
  }
  if (turn.kind === 'choosingTickets') return { type: 'keepTickets', ticketIds: [p.offeredTickets[0]!] };
  if (turn.kind === 'secondDraw') {
    if (state.drawPile.length + state.discard.length > 0) return { type: 'drawBlind' };
    return { type: 'drawFaceUp', slot: state.market.findIndex((c) => c !== null && c !== 'locomotive') };
  }
  const board = boardOf(state);
  for (const r of map.map.routes) {
    const cost = repairCost(board, map, r.id);
    if (!cost || (state.damage[r.id] && state.routeOwners[r.id] !== me)) continue;
    const route = effectiveRoute(board, map, r.id)!;
    const pay = repairPaymentOptions(route, cost, p.hand, state.rules)[0];
    const probe = applyAction(state, map, me, { type: 'repairRoute', routeId: r.id, payment: pay ?? {} });
    if (pay && probe.ok) return { type: 'repairRoute', routeId: r.id, payment: pay };
  }
  const claimable = map.map.routes
    .map((r) => effectiveRoute(board, map, r.id)!)
    .filter((r) => routeClaimError(board, map, r.id, me, p.trains) === null)
    .map((r) => ({ r, options: routePaymentOptions(r, p.hand, state.rules, excavatorsNeeded(board, map, r)) }))
    .filter((x) => x.options.length > 0);
  const pick = claimable[tick % Math.max(1, claimable.length)];
  if (pick && tick % 3 !== 0) return { type: 'claimRoute', routeId: pick.r.id, payment: pick.options[0]! };
  if (state.drawPile.length + state.discard.length > 0) return { type: 'drawBlind' };
  const slot = state.market.findIndex((c) => c !== null);
  if (slot >= 0) return { type: 'drawFaceUp', slot };
  if (pick) return { type: 'claimRoute', routeId: pick.r.id, payment: pick.options[0]! };
  if (state.regularTickets.length > 0) return { type: 'drawTickets' };
  const stationCost = nextStationCost(state, p);
  const stationPay = stationCost !== null ? stationPaymentOptions(stationCost, p.hand)[0] : undefined;
  const city = stationCities(state, map, me)[0];
  if (stationPay && city) {
    const borrow = map.routesByCity.get(city)!.find((r) => state.routeOwners[r.id] !== me)!;
    return { type: 'buildStation', cityId: city, payment: stationPay, borrowRouteId: borrow.id };
  }
  return { type: 'pass' };
}

describe('a whole Seasons game', () => {
  const hazardous = () =>
    tinyVariant((m) => {
      const kinds = ['earthquake', 'volcano', 'tsunami', 'hurricane', 'tornado', 'snow'];
      m.cities.forEach((c, i) => (c.hazards = { [kinds[i % kinds.length]!]: 'high', [kinds[(i + 2) % kinds.length]!]: 'medium' }));
    });

  it.each([2, 3, 5, 7])('keeps trains and points consistent through disasters with %i players', (players) => {
    for (const seed of [1, 2, 3]) {
      const game = newGame(players, { mode: 'seasons', trainsPerPlayer: 20, seasons: { disasterChance: 0.9, years: 2 } }, { seed, map: hazardous() });
      game.state.players.forEach((p, i) => act(game, i, { type: 'keepInitialTickets', ticketIds: [...p.offeredTickets] }));
      const kinds = new Set<string>();
      for (let step = 0; step < 4000 && game.state.phase !== 'finished'; step++) {
        const action = chooseAction(game, step);
        const result = applyAction(game.state, game.map, game.state.currentPlayer, action);
        if (!result.ok) throw new Error(`seed ${seed} step ${step}: ${action.type} failed: ${result.error}`);
        game.state = result.state;
        for (const e of result.events) if (e.type === 'disaster') kinds.add(e.kind);
        game.state.players.forEach((pl, i) => {
          const owned = Object.entries(game.state.routeOwners).filter(([, o]) => o === i).map(([id]) => game.map.routes.get(id)!);
          expect(pl.trains + owned.reduce((n, r) => n + r.length, 0)).toBe(20);
          expect(pl.routePoints).toBe(owned.reduce((n, r) => n + routePoints(game.state.rules, r.length), 0));
        });
      }
      expect(game.state.phase).toBe('finished');
      expect(kinds.size).toBeGreaterThan(1);
    }
  });
});
