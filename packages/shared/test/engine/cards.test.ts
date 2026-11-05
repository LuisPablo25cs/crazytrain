import { describe, expect, it } from 'vitest';
import { refillMarket, type GameEvent } from '../../src/index.js';
import { act, playingGame, reject, setHand, stackDeck } from './helpers.js';

describe('drawing train cards', () => {
  it('ends the turn after a blind card and a face-up color card', () => {
    const game = playingGame(3);
    game.state.market[0] = 'red';
    act(game, 0, { type: 'drawBlind' });
    expect(game.state.turn.kind).toBe('secondDraw');
    expect(game.state.currentPlayer).toBe(0);
    act(game, 0, { type: 'drawFaceUp', slot: 0 });
    expect(game.state.currentPlayer).toBe(1);
    expect(game.state.turn.kind).toBe('await');
  });

  it('ends the turn when a face-up locomotive is the first draw', () => {
    const game = playingGame(3);
    setHand(game, 0, {});
    game.state.market[1] = 'locomotive';
    act(game, 0, { type: 'drawFaceUp', slot: 1 });
    expect(game.state.players[0]!.hand.locomotive).toBe(1);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('rejects a face-up locomotive as the second draw', () => {
    const game = playingGame(3);
    act(game, 0, { type: 'drawBlind' });
    game.state.market[2] = 'locomotive';
    expect(reject(game, 0, { type: 'drawFaceUp', slot: 2 })).toMatch(/second card/);
  });

  it('discards and redeals the market when 3 locomotives show after a refill', () => {
    const game = playingGame(3);
    game.state.market = ['locomotive', 'locomotive', 'red', 'blue', 'green'];
    stackDeck(game, ['locomotive', 'white', 'white', 'white', 'white', 'white']);
    const events = act(game, 0, { type: 'drawFaceUp', slot: 2 });
    expect(events.some((e) => e.type === 'marketReset')).toBe(true);
    expect(game.state.market).toEqual(['white', 'white', 'white', 'white', 'white']);
  });

  it('stops redealing after the reset cap when the pool is mostly locomotives', () => {
    const game = playingGame(3);
    game.state.drawPile = ['red', 'blue', 'locomotive', 'locomotive', 'locomotive'];
    game.state.discard = [];
    game.state.market = [null, null, null, null, null];
    const events: GameEvent[] = [];
    refillMarket(game.state, events);
    expect(events.filter((e) => e.type === 'marketReset')).toHaveLength(game.state.rules.market.maxResets);
    expect(game.state.market.filter((c) => c !== null)).toHaveLength(5);
  });

  it('shows what remains when deck and discard hold fewer than 5 cards', () => {
    const game = playingGame(3);
    game.state.drawPile = ['red', 'blue'];
    game.state.discard = ['green'];
    game.state.market = [null, null, null, null, null];
    refillMarket(game.state, []);
    expect(game.state.market.filter((c) => c !== null).sort()).toEqual(['blue', 'green', 'red']);
    expect(game.state.drawPile).toHaveLength(0);
  });

  it('reshuffles the discard pile when the draw pile empties mid-turn', () => {
    const game = playingGame(3);
    game.state.drawPile = ['red'];
    game.state.discard = ['blue', 'blue'];
    setHand(game, 0, {});
    act(game, 0, { type: 'drawBlind' });
    const events = act(game, 0, { type: 'drawBlind' });
    expect(events.some((e) => e.type === 'deckReshuffled')).toBe(true);
    expect(game.state.players[0]!.hand.red).toBe(1);
    expect(game.state.players[0]!.hand.blue).toBe(1);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('ends the turn after one card when nothing is left for a second draw', () => {
    const game = playingGame(3);
    game.state.drawPile = ['red'];
    game.state.discard = [];
    game.state.market = [null, null, null, null, 'locomotive'];
    act(game, 0, { type: 'drawBlind' });
    expect(game.state.currentPlayer).toBe(1);
  });

  it('rejects drawing from an empty market slot', () => {
    const game = playingGame(3);
    game.state.market[0] = null;
    expect(reject(game, 0, { type: 'drawFaceUp', slot: 0 })).toMatch(/empty/);
  });
});
