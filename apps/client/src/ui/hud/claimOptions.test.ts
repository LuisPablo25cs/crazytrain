import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  emptyHand,
  indexMap,
  MapSchema,
  resolveRules,
  viewFor,
  type GameState,
  type Hand,
} from '@rails/shared';
import tiny from '../../../../../packages/shared/test/fixtures/tiny.map.json' with { type: 'json' };
import { affordances, claimInfo, stationCandidates, ticketProgress } from './affordances.js';

const map = indexMap(MapSchema.parse(structuredClone(tiny)));

function playing(players = 3): GameState {
  const rules = resolveRules();
  let { state } = createGame({ map, rules, players: ['A', 'B', 'C'].slice(0, players).map((name, i) => ({ name, color: rules.playerColors[i]! })), seed: 3 });
  state.players.forEach((p, i) => {
    const r = applyAction(state, map, i, { type: 'keepInitialTickets', ticketIds: [...p.offeredTickets] });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  });
  state.currentPlayer = 0;
  return state;
}

function withHand(state: GameState, hand: Partial<Hand>): GameState {
  state.players[0]!.hand = { ...emptyHand(), ...hand };
  return state;
}

describe('claimInfo', () => {
  it('offers blue x3, blue x2 + loco and blue x1 + loco x2 for 3 blue and 2 locomotives on a gray length-3 route', () => {
    const view = viewFor(withHand(playing(), { blue: 3, locomotive: 2 }), 0);
    const info = claimInfo(map.routes.get('bravo-charlie')!, view, map);
    expect(info.reason).toBeNull();
    expect(info.options).toEqual([{ blue: 3 }, { blue: 2, locomotive: 1 }, { blue: 1, locomotive: 2 }]);
    // Two locomotives alone are too short for a length-3 route.
    expect(info.options).not.toContainEqual({ locomotive: 2 });
  });

  it('explains a ferry that needs a locomotive the hand lacks', () => {
    const view = viewFor(withHand(playing(), { green: 5 }), 0);
    const info = claimInfo(map.routes.get('foxtrot-hotel')!, view, map);
    expect(info.options).toEqual([]);
    expect(info.reason).toMatch(/ferry needs 1 locomotive/);
  });

  it('gives a reason for every route when the hand is empty', () => {
    const view = viewFor(withHand(playing(), {}), 0);
    for (const r of map.map.routes) {
      const info = claimInfo(r, view, map);
      expect(info.options).toEqual([]);
      expect(info.reason).not.toBeNull();
    }
  });

  it('explains a closed lane', () => {
    const state = playing();
    state.routeOwners['alpha-bravo-1'] = 1;
    const view = viewFor(withHand(state, { blue: 4 }), 0);
    expect(claimInfo(map.routes.get('alpha-bravo-2')!, view, map).reason).toMatch(/lane/);
  });
});

describe('affordances', () => {
  it('blocks every action when it is not my turn', () => {
    const view = viewFor(playing(), 1);
    const a = affordances(view, map);
    expect(a.isMyTurn).toBe(false);
    expect(a.drawBlind).not.toBeNull();
    expect(a.faceUp(0)).not.toBeNull();
    expect(a.banner).toMatch(/A's turn/);
  });

  it('disables face-up locomotives and tickets on the second draw', () => {
    let state = playing();
    const r = applyAction(state, map, 0, { type: 'drawBlind' });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
    state.market[0] = 'locomotive';
    state.market[1] = 'red';
    const a = affordances(viewFor(state, 0), map);
    expect(a.faceUp(0)).toMatch(/locomotive/);
    expect(a.faceUp(1)).toBeNull();
    expect(a.drawTickets).not.toBeNull();
    expect(a.claim).not.toBeNull();
  });

  it('allows normal actions at the start of my turn, but not pass', () => {
    const a = affordances(viewFor(withHand(playing(), { red: 1 }), 0), map);
    expect(a.drawBlind).toBeNull();
    expect(a.drawTickets).toBeNull();
    expect(a.station).toBeNull();
    expect(a.pass).not.toBeNull();
  });
});

describe('ticketProgress and stationCandidates', () => {
  it('marks a ticket done once my own routes connect it', () => {
    const state = playing();
    state.players[0]!.tickets = ['alpha-bravo'];
    expect(ticketProgress(viewFor(state, 0), map).get('alpha-bravo')).toBe(false);
    state.routeOwners['alpha-bravo-1'] = 0;
    expect(ticketProgress(viewFor(state, 0), map).get('alpha-bravo')).toBe(true);
  });

  it('excludes cities that already have a station', () => {
    const state = playing();
    state.stations = [{ player: 1, cityId: 'echo', borrowRouteId: 'delta-echo' }];
    const cities = stationCandidates(viewFor(state, 0), map);
    expect(cities).not.toContain('echo');
    expect(cities).toContain('alpha');
  });
});
