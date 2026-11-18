import {
  LOCOMOTIVE,
  nextStationCost,
  routeClaimError,
  routePaymentOptions,
  stationPaymentOptions,
  ticketDone,
  UnionFind,
  EXCAVATOR,
  effectiveRoute,
  excavatorsNeeded,
  repairCost,
  repairError,
  repairPaymentOptions,
  routeWorks,
  type RepairCost,
  type BoardShape,
  type CardCounts,
  type GameView,
  type MapIndex,
  type Route,
} from '@rails/shared';
import { S, T, tr } from '../strings.js';

export function boardOfView(view: GameView): BoardShape {
  return {
    rules: view.rules,
    routeOwners: view.routeOwners,
    playerCount: view.players.length,
    month: view.month,
    zones: view.zones,
    damage: view.damage,
    blocked: view.blocked,
    abandoned: view.abandoned,
    recolored: view.recolored,
  };
}

/** What the viewing player can do right now. A string means "disabled, because…". */
export interface Affordances {
  isMyTurn: boolean;
  banner: string;
  drawBlind: string | null;
  drawTickets: string | null;
  claim: string | null;
  station: string | null;
  pass: string | null;
  /** Whether the face-up card in a slot can be taken; null means yes. */
  faceUp: (slot: number) => string | null;
}

/** The state-to-UI table: what each turn state enables for the viewer and what the banner says. */
export function affordances(view: GameView, map: MapIndex): Affordances {
  const me = view.me;
  const current = view.players[view.currentPlayer];
  const isMyTurn = view.phase === 'playing' && me !== null && me.index === view.currentPlayer;
  const notYourTurn = view.phase === 'playing' ? S.turnOf(current?.name ?? '?') : T.misc.chooseTicketsFirst;
  const none = (reason: string): Affordances => ({
    isMyTurn,
    banner: reason,
    drawBlind: reason,
    drawTickets: reason,
    claim: reason,
    station: reason,
    pass: reason,
    faceUp: () => reason,
  });

  if (view.phase === 'finished') return none(S.finished);
  if (view.phase === 'initialTickets') {
    const waiting = view.players.filter((p) => !p.keptInitial).length;
    return none(me && view.players[me.index]?.keptInitial ? S.waitingTickets(waiting) : S.chooseTickets(view.rules.tickets.initialKeepMin));
  }
  if (!isMyTurn || !me) return none(notYourTurn);

  const turn = view.turn;
  const last = view.lastRound ? ` ${S.lastRound}` : '';
  if (turn.kind === 'secondDraw') {
    const reason = S.drawSecond;
    return {
      ...none(reason),
      banner: `${S.yourTurn}: ${S.drawSecond.toLowerCase()}.${last}`,
      drawBlind: view.drawPileCount + view.discardCount > 0 ? null : T.misc.drawPileEmpty,
      faceUp: (slot) => {
        const card = view.market[slot];
        if (!card) return T.misc.emptySlot;
        return card === LOCOMOTIVE ? T.misc.locoSecond : null;
      },
    };
  }
  if (turn.kind === 'choosingTickets') return { ...none(T.misc.chooseYourTickets), banner: S.chooseTickets(view.rules.tickets.drawKeepMin) };
  if (turn.kind === 'tunnel') return { ...none(T.misc.resolveTunnel), banner: S.tunnelExtra(turn.extra) };

  const stationCost = nextStationCost(view, view.players[me.index]!);
  const anyClaim = map.map.routes.some((r) => claimInfo(r, view, map).options.length > 0 || repairInfo(r.id, view, map)?.options.length);
  const anyAction =
    view.drawPileCount + view.discardCount > 0 || view.market.some((c) => c !== null) || view.ticketDeckCount > 0 || anyClaim;
  return {
    isMyTurn,
    banner: `${S.yourTurn}!${last}`,
    drawBlind: view.drawPileCount + view.discardCount > 0 ? null : T.misc.drawPileEmpty,
    drawTickets: view.ticketDeckCount > 0 ? null : T.misc.ticketDeckEmpty,
    claim: null,
    station: !view.rules.expansions.stations
      ? T.misc.stationsOff
      : stationCost === null
        ? S.noStations
        : stationPaymentOptions(stationCost, me.hand).length === 0
          ? T.misc.stationNeeds(stationCost)
          : null,
    pass: anyAction ? T.misc.canStillAct : null,
    faceUp: (slot) => (view.market[slot] ? null : T.misc.emptySlot),
  };
}

export interface ClaimInfo {
  options: CardCounts[];
  /** Why the route cannot be claimed by the viewer now, or null. */
  reason: string | null;
}

/** Payment options for a route and, when there are none, the reason in plain words. */
export function claimInfo(route: Route, view: GameView, map: MapIndex): ClaimInfo {
  const me = view.me;
  if (!me) return { options: [], reason: T.misc.notPlaying };
  const trains = view.players[me.index]!.trains;
  const board = boardOfView(view);
  const blocked = routeClaimError(board, map, route.id, me.index, trains);
  if (blocked) return { options: [], reason: tr(blocked) };
  const live = effectiveRoute(board, map, route.id) ?? route;
  const excavators = excavatorsNeeded(board, map, live);
  const options = routePaymentOptions(live, me.hand, view.rules, excavators);
  if (options.length > 0) return { options, reason: null };
  if (excavators > me.hand[EXCAVATOR]) return { options, reason: T.misc.needExcavators(excavators) };
  if (route.kind === 'ferry' && view.rules.expansions.ferries && me.hand[LOCOMOTIVE] < route.ferryLocomotives) {
    return { options, reason: T.misc.ferryNeedsLocos(route.ferryLocomotives) };
  }
  return { options, reason: S.noPayment };
}

/** Tickets the viewer has already connected with their own routes (stations count only at the end). */
export function ticketProgress(view: GameView, map: MapIndex): Map<string, boolean> {
  const me = view.me;
  const out = new Map<string, boolean>();
  if (!me) return out;
  const uf = new UnionFind();
  for (const [routeId, owner] of Object.entries(view.routeOwners)) {
    if (owner !== me.index || !routeWorks(view, routeId)) continue;
    const r = map.routes.get(routeId);
    if (r) uf.union(r.from, r.to);
  }
  for (const id of me.tickets) {
    const t = map.tickets.get(id);
    // Damaged or ash-covered routes do not connect (Seasons mode).
    out.set(id, !!t && ticketDone(uf, t));
  }
  return out;
}

/** Cities where the viewer could place a station: none there yet, and a route they do not own touches it. */
export function stationCandidates(view: GameView, map: MapIndex): string[] {
  const me = view.me;
  if (!me) return [];
  const taken = new Set(view.stations.map((s) => s.cityId));
  return map.map.cities
    .filter((c) => !taken.has(c.id))
    .filter((c) => (map.routesByCity.get(c.id) ?? []).some((r) => view.routeOwners[r.id] !== me.index))
    .map((c) => c.id);
}

export interface RepairInfo {
  cost: RepairCost;
  options: CardCounts[];
  /** Why the viewer cannot repair it now, or null. */
  reason: string | null;
  /** Claiming an earthquake-abandoned route by repairing it, rather than fixing your own. */
  claim: boolean;
}

/** Seasons mode: what repairing a route costs the viewer, or null when there is nothing to repair. */
export function repairInfo(routeId: string, view: GameView, map: MapIndex): RepairInfo | null {
  const me = view.me;
  const board = boardOfView(view);
  const cost = repairCost(board, map, routeId);
  if (!me || !cost) return null;
  const claim = view.abandoned[routeId] !== undefined;
  if (!claim && view.routeOwners[routeId] !== me.index) return null;
  const route = effectiveRoute(board, map, routeId)!;
  const blocked = repairError(board, map, routeId, me.index, view.players[me.index]!.trains);
  if (blocked) return { cost, options: [], reason: tr(blocked), claim };
  const options = repairPaymentOptions(route, cost, me.hand, view.rules);
  const reason = options.length
    ? null
    : cost.excavators
      ? T.misc.repairNeedsExcavators(cost.excavators)
      : T.misc.repairNeedsCards(cost.cards, route.color === 'gray' ? null : route.color);
  return { cost, options, reason, claim };
}
