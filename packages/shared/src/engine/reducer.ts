import type { MapIndex } from '../map/graph.js';
import { LOCOMOTIVE, type Card, type Route } from '../map/schema.js';
import { routePoints } from '../rules/resolve.js';
import { addCards, drawCard, mergeCounts, refillMarket, removeCards, toCardList } from './cards.js';
import { boardOf, canDrawSecondCard, hasLegalNonPassAction, nextStationCost } from './legal.js';
import {
  isTunnelActive,
  paymentShape,
  repairPaymentError,
  routePaymentError,
  stationPaymentError,
  tunnelExtraError,
} from './payments.js';
import { advanceMonth } from './disasters.js';
import { routeClaimError, routeStatus } from './routes.js';
import { effectiveRoute, excavatorsNeeded, isSeasons, repairCost, repairError } from './seasons.js';
import { computeResults } from './scoring.js';
import type { Action, ApplyResult, CardCounts, GameEvent, GameState, PlayerState } from './types.js';

class RuleViolation extends Error {}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleViolation(message);
}

interface Ctx {
  s: GameState;
  map: MapIndex;
  events: GameEvent[];
}

/**
 * Apply one action for one player (KTD2). Pure: the input state is never changed. Illegal actions
 * return an error and no new state.
 */
export function applyAction(state: GameState, map: MapIndex, player: number, action: Action): ApplyResult {
  if (state.phase === 'finished') return { ok: false, error: 'the game is over' };
  if (!Number.isInteger(player) || player < 0 || player >= state.players.length) {
    return { ok: false, error: 'unknown player' };
  }
  const ctx: Ctx = { s: structuredClone(state), map, events: [] };
  try {
    dispatch(ctx, player, action);
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, state: ctx.s, events: ctx.events };
}

function dispatch(ctx: Ctx, player: number, action: Action): void {
  switch (action.type) {
    case 'keepInitialTickets':
      return keepInitialTickets(ctx, player, action.ticketIds);
    case 'drawBlind':
      return drawBlind(ctx, player);
    case 'drawFaceUp':
      return drawFaceUp(ctx, player, action.slot);
    case 'claimRoute':
      return claimRoute(ctx, player, action.routeId, action.payment);
    case 'resolveTunnel':
      return resolveTunnel(ctx, player, action.extra);
    case 'withdrawTunnel':
      return withdrawTunnel(ctx, player);
    case 'drawTickets':
      return drawTickets(ctx, player);
    case 'keepTickets':
      return keepTickets(ctx, player, action.ticketIds);
    case 'buildStation':
      return buildStation(ctx, player, action.cityId, action.payment, action.borrowRouteId);
    case 'pass':
      return pass(ctx, player);
    case 'repairRoute':
      return repairRoute(ctx, player, action.routeId, action.payment);
    case 'skip':
      return skip(ctx, player);
    default:
      throw new RuleViolation('unknown action');
  }
}

function requireTurn(ctx: Ctx, player: number, ...kinds: GameState['turn']['kind'][]): PlayerState {
  check(ctx.s.phase === 'playing', 'the game has not started yet');
  check(ctx.s.currentPlayer === player, 'it is not your turn');
  check(kinds.includes(ctx.s.turn.kind), turnMessage(ctx.s.turn.kind));
  return ctx.s.players[player]!;
}

function turnMessage(kind: GameState['turn']['kind']): string {
  switch (kind) {
    case 'secondDraw':
      return 'draw your second card first';
    case 'choosingTickets':
      return 'choose which tickets to keep first';
    case 'tunnel':
      return 'pay for the tunnel or withdraw first';
    default:
      return 'you cannot do that now';
  }
}

function chosenTickets(offered: string[], ids: string[], minKeep: number): string[] {
  check(Array.isArray(ids), 'choose tickets to keep');
  check(new Set(ids).size === ids.length, 'a ticket is chosen twice');
  check(ids.every((id) => offered.includes(id)), 'you can only keep tickets you were offered');
  const needed = Math.min(minKeep, offered.length);
  check(ids.length >= needed, `keep at least ${needed} ticket(s)`);
  return offered.filter((id) => !ids.includes(id));
}

function keepInitialTickets(ctx: Ctx, player: number, ids: string[]): void {
  const { s } = ctx;
  check(s.phase === 'initialTickets', 'initial tickets were already chosen');
  const p = s.players[player]!;
  check(!p.keptInitial, 'you already chose your tickets');
  const returned = chosenTickets(p.offeredTickets, ids, s.rules.tickets.initialKeepMin);
  keepInitial(ctx, player, ids, returned);
}

function keepInitial(ctx: Ctx, player: number, kept: string[], returned: string[]): void {
  const { s } = ctx;
  const p = s.players[player]!;
  // Returned tickets, triples too, go to the bottom of the one ticket deck.
  s.regularTickets.push(...returned);
  p.tickets.push(...kept);
  p.offeredTickets = [];
  p.keptInitial = true;
  ctx.events.push({ type: 'keptTickets', player, count: kept.length, initial: true, secret: { ticketIds: kept } });
  if (s.players.every((q) => q.keptInitial)) {
    s.phase = 'playing';
    s.turn = { kind: 'await' };
    ctx.events.push({ type: 'turnStarted', player: s.currentPlayer });
  }
}

function drawBlind(ctx: Ctx, player: number): void {
  const p = requireTurn(ctx, player, 'await', 'secondDraw');
  const first = ctx.s.turn.kind === 'await';
  const card = drawCard(ctx.s, ctx.events);
  check(card !== null, 'there are no cards left to draw');
  p.hand[card] += 1;
  ctx.s.consecutivePasses = 0;
  ctx.events.push({ type: 'drewBlind', player, secret: { card } });
  afterDraw(ctx, first);
}

function drawFaceUp(ctx: Ctx, player: number, slot: number): void {
  const p = requireTurn(ctx, player, 'await', 'secondDraw');
  const { s } = ctx;
  const first = s.turn.kind === 'await';
  check(Number.isInteger(slot) && slot >= 0 && slot < s.market.length, 'unknown market slot');
  const card = s.market[slot];
  check(card !== null && card !== undefined, 'that market slot is empty');
  check(first || card !== LOCOMOTIVE, 'a face-up locomotive cannot be your second card');
  p.hand[card] += 1;
  s.market[slot] = null;
  s.consecutivePasses = 0;
  ctx.events.push({ type: 'drewFaceUp', player, card, slot });
  refillMarket(s, ctx.events);
  if (first && card === LOCOMOTIVE) return endTurn(ctx);
  afterDraw(ctx, first);
}

function afterDraw(ctx: Ctx, first: boolean): void {
  if (first && canDrawSecondCard(ctx.s)) {
    ctx.s.turn = { kind: 'secondDraw' };
    return;
  }
  endTurn(ctx);
}

function getRoute(ctx: Ctx, routeId: string): Route {
  const route = ctx.map.routes.get(routeId);
  check(route, `unknown route "${routeId}"`);
  return route;
}

function claimRoute(ctx: Ctx, player: number, routeId: string, payment: CardCounts): void {
  const p = requireTurn(ctx, player, 'await');
  const { s } = ctx;
  getRoute(ctx, routeId);
  const board = boardOf(s);
  const route = effectiveRoute(board, ctx.map, routeId)!;
  const blocked = routeClaimError(board, ctx.map, routeId, player, p.trains);
  check(blocked === null, blocked ?? '');
  const payError = routePaymentError(route, payment, p.hand, s.rules, excavatorsNeeded(board, ctx.map, route));
  check(payError === null, payError ?? '');
  s.consecutivePasses = 0;
  removeCards(p.hand, payment);

  if (isTunnelActive(route, s.rules)) {
    const color = paymentShape(payment)!.color;
    const revealed: Card[] = [];
    for (let i = 0; i < s.rules.tunnelRevealCount; i++) {
      const card = drawCard(s, ctx.events);
      if (card) revealed.push(card);
    }
    const extra = revealed.filter((c) => c === LOCOMOTIVE || (color !== null && c === color)).length;
    ctx.events.push({ type: 'tunnelRevealed', player, routeId, revealed, extra });
    if (extra > 0) {
      s.turn = { kind: 'tunnel', routeId, payment, color, revealed, extra };
      return;
    }
    s.discard.push(...revealed);
  }
  completeClaim(ctx, player, route, payment);
}

/** Cards are already out of the hand. */
function completeClaim(ctx: Ctx, player: number, route: Route, payment: CardCounts): void {
  const { s } = ctx;
  const p = s.players[player]!;
  s.discard.push(...toCardList(payment));
  p.trains -= route.length;
  p.routePoints += routePoints(s.rules, route.length);
  s.routeOwners[route.id] = player;
  ctx.events.push({ type: 'claimedRoute', player, routeId: route.id, payment });
  endTurn(ctx);
}

function resolveTunnel(ctx: Ctx, player: number, extra: CardCounts): void {
  const p = requireTurn(ctx, player, 'tunnel');
  const turn = ctx.s.turn;
  check(turn.kind === 'tunnel', 'there is no tunnel to pay for');
  const error = tunnelExtraError(turn.color, turn.extra, extra, p.hand);
  check(error === null, error ?? '');
  removeCards(p.hand, extra);
  ctx.s.discard.push(...turn.revealed);
  completeClaim(ctx, player, getRoute(ctx, turn.routeId), mergeCounts(turn.payment, extra));
}

function withdrawTunnel(ctx: Ctx, player: number): void {
  requireTurn(ctx, player, 'tunnel');
  withdraw(ctx, player);
  endTurn(ctx);
}

function withdraw(ctx: Ctx, player: number): void {
  const turn = ctx.s.turn;
  if (turn.kind !== 'tunnel') return;
  addCards(ctx.s.players[player]!.hand, turn.payment);
  ctx.s.discard.push(...turn.revealed);
  ctx.events.push({ type: 'tunnelWithdrawn', player, routeId: turn.routeId });
}

function drawTickets(ctx: Ctx, player: number): void {
  const p = requireTurn(ctx, player, 'await');
  const { s } = ctx;
  check(s.regularTickets.length > 0, 'the ticket deck is empty');
  const offered = s.regularTickets.splice(0, s.rules.tickets.drawCount);
  p.offeredTickets = offered;
  s.turn = { kind: 'choosingTickets' };
  s.consecutivePasses = 0;
  ctx.events.push({ type: 'drewTickets', player, count: offered.length, secret: { ticketIds: offered } });
}

function keepTickets(ctx: Ctx, player: number, ids: string[]): void {
  const p = requireTurn(ctx, player, 'choosingTickets');
  const returned = chosenTickets(p.offeredTickets, ids, ctx.s.rules.tickets.drawKeepMin);
  keepDrawn(ctx, player, ids, returned);
  endTurn(ctx);
}

function keepDrawn(ctx: Ctx, player: number, kept: string[], returned: string[]): void {
  const p = ctx.s.players[player]!;
  ctx.s.regularTickets.push(...returned);
  p.tickets.push(...kept);
  p.offeredTickets = [];
  ctx.events.push({ type: 'keptTickets', player, count: kept.length, initial: false, secret: { ticketIds: kept } });
}

function buildStation(ctx: Ctx, player: number, cityId: string, payment: CardCounts, borrowRouteId: string): void {
  const p = requireTurn(ctx, player, 'await');
  const { s, map } = ctx;
  check(s.rules.expansions.stations, 'stations are switched off in this game');
  const cost = nextStationCost(s, p);
  check(cost !== null, 'you have no stations left');
  check(map.cities.has(cityId), `unknown city "${cityId}"`);
  check(!s.stations.some((st) => st.cityId === cityId), 'that city already has a station');
  const borrow = map.routes.get(borrowRouteId);
  check(borrow && (borrow.from === cityId || borrow.to === cityId), 'choose a route that touches this city');
  check(s.routeOwners[borrowRouteId] !== player, 'choose a route you do not own');
  const error = stationPaymentError(cost, payment, p.hand);
  check(error === null, error ?? '');
  removeCards(p.hand, payment);
  s.discard.push(...toCardList(payment));
  p.stationsLeft -= 1;
  s.stations.push({ player, cityId, borrowRouteId });
  s.consecutivePasses = 0;
  ctx.events.push({ type: 'builtStation', player, cityId, borrowRouteId, payment });
  endTurn(ctx);
}

/** Seasons mode: repair a damaged route you own, or claim an earthquake-abandoned one by repairing it. */
function repairRoute(ctx: Ctx, player: number, routeId: string, payment: CardCounts): void {
  const p = requireTurn(ctx, player, 'await');
  const { s, map } = ctx;
  getRoute(ctx, routeId);
  const board = boardOf(s);
  const route = effectiveRoute(board, map, routeId)!;
  const error = repairError(board, map, routeId, player, p.trains);
  check(error === null, error ?? '');
  const claiming = s.abandoned[routeId] !== undefined;
  if (claiming) {
    const status = routeStatus(board, map, routeId, player);
    check(status.kind === 'abandoned', status.kind === 'blockedForYou' ? 'you already own a lane of this route' : 'this route cannot be claimed now');
  }
  const cost = repairCost(board, map, routeId)!;
  const payError = repairPaymentError(route, cost, payment, p.hand);
  check(payError === null, payError ?? '');
  removeCards(p.hand, payment);
  s.discard.push(...toCardList(payment));
  s.consecutivePasses = 0;
  if (claiming) {
    delete s.abandoned[routeId];
    s.routeOwners[routeId] = player;
    p.trains -= route.length;
    p.routePoints += routePoints(s.rules, route.length);
  } else {
    delete s.damage[routeId];
  }
  ctx.events.push({ type: 'routeRepaired', player, routeId, payment, claimed: claiming });
  endTurn(ctx);
}

function pass(ctx: Ctx, player: number): void {
  requireTurn(ctx, player, 'await');
  check(!hasLegalNonPassAction(ctx.s, ctx.map, player), 'you can still take an action');
  ctx.s.consecutivePasses += 1;
  ctx.events.push({ type: 'passed', player });
  // A full round where nobody can act would never end otherwise.
  if (ctx.s.consecutivePasses >= ctx.s.players.length) return finish(ctx);
  endTurn(ctx);
}

function skip(ctx: Ctx, player: number): void {
  const { s } = ctx;
  if (s.phase === 'initialTickets') {
    const p = s.players[player]!;
    check(!p.keptInitial, 'that player already chose their tickets');
    ctx.events.push({ type: 'skipped', player });
    keepInitial(ctx, player, [...p.offeredTickets], []);
    return;
  }
  check(s.phase === 'playing' && s.currentPlayer === player, 'it is not that player\'s turn');
  ctx.events.push({ type: 'skipped', player });
  switch (s.turn.kind) {
    case 'tunnel':
      withdraw(ctx, player);
      break;
    case 'choosingTickets': {
      const p = s.players[player]!;
      keepDrawn(ctx, player, [...p.offeredTickets], []);
      break;
    }
    default:
      break;
  }
  endTurn(ctx);
}

function endTurn(ctx: Ctx): void {
  const { s } = ctx;
  const current = s.currentPlayer;
  if (s.lastRound) {
    s.lastRound.turnsLeft -= 1;
    if (s.lastRound.turnsLeft <= 0) return finish(ctx);
  } else if (s.players[current]!.trains <= s.rules.lastRoundTrainThreshold) {
    // Every player, including this one, gets exactly one more turn (R6).
    s.lastRound = { triggeredBy: current, turnsLeft: s.players.length };
    ctx.events.push({ type: 'lastRoundStarted', player: current });
  }
  s.currentPlayer = (current + 1) % s.players.length;
  // Seasons: a new month begins each time play comes back to the first player.
  if (isSeasons(s.rules) && s.phase === 'playing' && s.currentPlayer === s.firstPlayer) {
    if (advanceMonth(s, ctx.map, ctx.events)) return finish(ctx);
  }
  s.turn = { kind: 'await' };
  s.turnNumber += 1;
  ctx.events.push({ type: 'turnStarted', player: s.currentPlayer });
}

function finish(ctx: Ctx): void {
  const { s } = ctx;
  s.phase = 'finished';
  s.turn = { kind: 'await' };
  s.results = computeResults(s, ctx.map);
  ctx.events.push({ type: 'gameFinished', winners: s.results.winners });
}
