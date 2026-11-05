import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/index.js';
import { act, playingGame, reject, setHand, stackDeck, tinyVariant } from './helpers.js';

/** Tiny map where bravo-charlie (gray, length 3) is a tunnel. */
const grayTunnelMap = () =>
  tinyVariant((m) => {
    m.routes.find((r) => r.id === 'bravo-charlie')!.kind = 'tunnel';
  });

describe('tunnels', () => {
  it('Covers AE3. charges 2 extra for a red-locomotive-blue reveal, and withdraw returns the cards', () => {
    const game = playingGame(3, undefined, { map: grayTunnelMap() });
    setHand(game, 0, { red: 5 });
    stackDeck(game, ['red', 'locomotive', 'blue']);
    const events = act(game, 0, { type: 'claimRoute', routeId: 'bravo-charlie', payment: { red: 3 } });
    expect(events).toContainEqual({ type: 'tunnelRevealed', player: 0, routeId: 'bravo-charlie', revealed: ['red', 'locomotive', 'blue'], extra: 2 });
    expect(game.state.turn).toMatchObject({ kind: 'tunnel', extra: 2, color: 'red' });
    expect(game.state.players[0]!.hand.red).toBe(2);
    const discardBefore = game.state.discard.length;
    act(game, 0, { type: 'withdrawTunnel' });
    expect(game.state.players[0]!.hand.red).toBe(5);
    expect(game.state.routeOwners['bravo-charlie']).toBeUndefined();
    expect(game.state.discard.length).toBe(discardBefore + 3);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('claims the tunnel when the player pays the extra cards', () => {
    const game = playingGame(3, undefined, { map: grayTunnelMap() });
    setHand(game, 0, { red: 4, locomotive: 1 });
    stackDeck(game, ['red', 'locomotive', 'blue']);
    act(game, 0, { type: 'claimRoute', routeId: 'bravo-charlie', payment: { red: 3 } });
    expect(reject(game, 0, { type: 'resolveTunnel', extra: { blue: 2 } })).toMatch(/red or locomotives/);
    act(game, 0, { type: 'resolveTunnel', extra: { red: 1, locomotive: 1 } });
    expect(game.state.routeOwners['bravo-charlie']).toBe(0);
    expect(game.state.players[0]!.trains).toBe(42);
    expect(game.state.players[0]!.routePoints).toBe(4);
  });

  it('Covers AE4. counts only revealed locomotives when the payment was all locomotives', () => {
    const game = playingGame(3, undefined, { map: grayTunnelMap() });
    setHand(game, 0, { locomotive: 4 });
    stackDeck(game, ['locomotive', 'red', 'blue']);
    act(game, 0, { type: 'claimRoute', routeId: 'bravo-charlie', payment: { locomotive: 3 } });
    expect(game.state.turn).toMatchObject({ kind: 'tunnel', extra: 1, color: null });
    expect(reject(game, 0, { type: 'resolveTunnel', extra: { red: 1 } })).toMatch(/locomotives/);
    act(game, 0, { type: 'resolveTunnel', extra: { locomotive: 1 } });
    expect(game.state.routeOwners['bravo-charlie']).toBe(0);
  });

  it('claims at once when the reveal costs nothing', () => {
    const game = playingGame(3);
    setHand(game, 0, { white: 4 });
    stackDeck(game, ['red', 'blue', 'green']);
    act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    expect(game.state.routeOwners['charlie-foxtrot']).toBe(0);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('reveals only 1 card when 1 card is left in deck and discard', () => {
    const game = playingGame(3);
    setHand(game, 0, { white: 4 });
    game.state.drawPile = ['white'];
    game.state.discard = [];
    const events = act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'tunnelRevealed', revealed: ['white'], extra: 1 }));
  });

  it('only accepts withdraw when the player cannot afford the extra cost', () => {
    const game = playingGame(3);
    setHand(game, 0, { white: 4 });
    stackDeck(game, ['white', 'white', 'red']);
    act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    expect(reject(game, 0, { type: 'resolveTunnel', extra: { white: 2 } })).toMatch(/do not have/);
    expect(reject(game, 0, { type: 'drawBlind' })).toMatch(/tunnel/);
    act(game, 0, { type: 'withdrawTunnel' });
    expect(game.state.players[0]!.hand.white).toBe(4);
  });

  it('shows the reveal and the held payment to everyone but keeps the hand private', () => {
    const game = playingGame(3);
    setHand(game, 0, { white: 4, blue: 2 });
    stackDeck(game, ['white', 'red', 'red']);
    act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    const view = viewFor(game.state, 1);
    expect(view.turn).toMatchObject({ kind: 'tunnel', revealed: ['white', 'red', 'red'], payment: { white: 4 }, extra: 1 });
    expect(view.me?.index).toBe(1);
    expect(view.players[0]!.handCount).toBe(2);
    expect(JSON.stringify(view.players)).not.toContain('"hand"');
  });

  it('treats tunnels as normal routes when tunnels are off', () => {
    const game = playingGame(3, { expansions: { tunnels: false } });
    setHand(game, 0, { white: 4 });
    stackDeck(game, ['white', 'white', 'white']);
    const events = act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    expect(events.some((e) => e.type === 'tunnelRevealed')).toBe(false);
    expect(game.state.routeOwners['charlie-foxtrot']).toBe(0);
  });
});
