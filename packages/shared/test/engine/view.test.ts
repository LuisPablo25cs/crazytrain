import { describe, expect, it } from 'vitest';
import { applyAction, eventsFor, viewFor, type Action } from '../../src/index.js';
import { act, newGame, playingGame, stackDeck } from './helpers.js';

describe('viewFor', () => {
  it("shows B their hand and tickets, other players' counts only, and no server-only fields", () => {
    const game = playingGame(4);
    const view = viewFor(game.state, 1);
    expect(view.me).toEqual({
      index: 1,
      hand: game.state.players[1]!.hand,
      tickets: game.state.players[1]!.tickets,
      offeredTickets: [],
    });
    for (const p of view.players) {
      expect(Object.keys(p).sort()).toEqual(
        ['color', 'handCount', 'index', 'keptInitial', 'name', 'offeredTicketCount', 'routePoints', 'stationsLeft', 'ticketCount', 'trains'].sort(),
      );
    }
    expect(view.players[0]!.handCount).toBe(4);
    const keys = Object.keys(view);
    for (const hidden of ['drawPile', 'discard', 'regularTickets', 'rng']) expect(keys).not.toContain(hidden);
    expect(view.drawPileCount).toBe(game.state.drawPile.length);
  });

  it("never contains other players' ticket ids before the end", () => {
    const game = newGame(4);
    const view = viewFor(game.state, 2);
    const text = JSON.stringify(view);
    game.state.players.forEach((p, i) => {
      if (i === 2) return;
      for (const id of p.offeredTickets) expect(text).not.toContain(`"${id}"`);
    });
    expect(view.me!.offeredTickets).toEqual(game.state.players[2]!.offeredTickets);
  });

  it('gives spectators (null viewer) no private section', () => {
    const game = playingGame(2);
    expect(viewFor(game.state, null).me).toBeNull();
  });
});

describe('eventsFor', () => {
  it('keeps a blind-drawn card for the drawer only', () => {
    const game = playingGame(3);
    stackDeck(game, ['purple']);
    const events = act(game, 0, { type: 'drawBlind' });
    expect(eventsFor(events, 0)).toContainEqual({ type: 'drewBlind', player: 0, secret: { card: 'purple' } });
    expect(eventsFor(events, 1)).toContainEqual({ type: 'drewBlind', player: 0 });
    expect(JSON.stringify(eventsFor(events, 2))).not.toContain('purple');
  });

  it('keeps drawn and kept ticket ids for the owner only', () => {
    const game = playingGame(3);
    const drawn = act(game, 0, { type: 'drawTickets' });
    const offered = game.state.players[0]!.offeredTickets;
    const kept = act(game, 0, { type: 'keepTickets', ticketIds: [offered[0]!] });
    for (const viewer of [1, 2]) {
      const text = JSON.stringify(eventsFor([...drawn, ...kept], viewer));
      for (const id of offered) expect(text).not.toContain(`"${id}"`);
    }
    expect(JSON.stringify(eventsFor(drawn, 0))).toContain(`"${offered[0]}"`);
  });
});

describe('determinism', () => {
  it('produces identical states from the same seed and actions', () => {
    const run = () => {
      const game = newGame(3, undefined, { seed: 99 });
      game.state.players.forEach((p, i) => act(game, i, { type: 'keepInitialTickets', ticketIds: [...p.offeredTickets] }));
      const actions: Action[] = [{ type: 'drawBlind' }, { type: 'drawBlind' }];
      for (let turn = 0; turn < 6; turn++) {
        for (const action of actions) {
          const result = applyAction(game.state, game.map, game.state.currentPlayer, action);
          if (result.ok) game.state = result.state;
        }
      }
      return game.state;
    };
    expect(run()).toEqual(run());
  });
});
