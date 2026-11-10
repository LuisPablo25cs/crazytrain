import { CARD_COLORS, EXCAVATOR, LOCOMOTIVE, type CardColor, type Route } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';
import { handSize, hasCards } from './cards.js';
import type { CardCounts, Hand } from './types.js';

export interface PaymentShape {
  /** The single non-locomotive color in the payment, or null when it is all locomotives. */
  color: CardColor | null;
  locomotives: number;
  /** Excavator cards: paid on top, never part of `total`. */
  excavators: number;
  /** Colored cards plus locomotives. */
  total: number;
}

/** Check that a payment is well formed: non-negative integers, at most one color plus locomotives. */
export function paymentShape(payment: CardCounts): PaymentShape | null {
  let color: CardColor | null = null;
  for (const [card, n] of Object.entries(payment)) {
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 0) return null;
    if (card !== LOCOMOTIVE && card !== EXCAVATOR && !(CARD_COLORS as readonly string[]).includes(card)) return null;
    if (n === 0 || card === LOCOMOTIVE || card === EXCAVATOR) continue;
    if (color !== null) return null;
    color = card as CardColor;
  }
  const excavators = payment[EXCAVATOR] ?? 0;
  return { color, locomotives: payment[LOCOMOTIVE] ?? 0, excavators, total: handSize(payment) - excavators };
}

export function isFerryActive(route: Route, rules: RulesConfig): boolean {
  return route.kind === 'ferry' && rules.expansions.ferries;
}

export function isTunnelActive(route: Route, rules: RulesConfig): boolean {
  return route.kind === 'tunnel' && rules.expansions.tunnels;
}

/** Why a payment cannot claim a route, or null when it can. Does not check ownership or trains. */
export function routePaymentError(route: Route, payment: CardCounts, hand: Hand, rules: RulesConfig, excavators = 0): string | null {
  const shape = paymentShape(payment);
  if (!shape) return 'a payment uses one color plus locomotives';
  if (shape.total !== route.length) return `this route needs exactly ${route.length} cards`;
  if (shape.excavators !== excavators) {
    return excavators ? `building here also needs exactly ${excavators} excavator(s)` : 'excavators are not needed here';
  }
  if (route.color !== 'gray' && shape.color !== null && shape.color !== route.color) {
    return `this route needs ${route.color} cards or locomotives`;
  }
  if (isFerryActive(route, rules) && shape.locomotives < route.ferryLocomotives) {
    return `this ferry needs at least ${route.ferryLocomotives} locomotive(s)`;
  }
  if (!hasCards(hand, payment)) return 'you do not have those cards';
  return null;
}

/** Every distinct way the hand can pay for the route, fewest locomotives first. Excavators are added on top. */
export function routePaymentOptions(route: Route, hand: Hand, rules: RulesConfig, excavators = 0): CardCounts[] {
  if (excavators > 0) {
    if (hand[EXCAVATOR] < excavators) return [];
    return routePaymentOptions(route, hand, rules).map((o) => ({ ...o, [EXCAVATOR]: excavators }));
  }
  const minLocos = isFerryActive(route, rules) ? route.ferryLocomotives : 0;
  const colors = route.color === 'gray' ? CARD_COLORS : [route.color];
  const options: CardCounts[] = [];
  for (let locos = minLocos; locos < route.length; locos++) {
    if (hand[LOCOMOTIVE] < locos) break;
    const need = route.length - locos;
    for (const c of colors) {
      if (hand[c] >= need) options.push(locos > 0 ? { [c]: need, [LOCOMOTIVE]: locos } : { [c]: need });
    }
  }
  if (hand[LOCOMOTIVE] >= route.length) options.push({ [LOCOMOTIVE]: route.length });
  return options;
}

/** Why extra cards cannot pay for a tunnel, or null when they can. */
export function tunnelExtraError(color: CardColor | null, extra: number, payment: CardCounts, hand: Hand): string | null {
  const shape = paymentShape(payment);
  if (!shape || shape.excavators) return 'extra cards use the tunnel color plus locomotives';
  if (shape.total !== extra) return `the tunnel needs exactly ${extra} extra card(s)`;
  if (shape.color !== null && shape.color !== color) {
    return color === null ? 'you paid with locomotives, so extra cards must be locomotives' : `extra cards must be ${color} or locomotives`;
  }
  if (!hasCards(hand, payment)) return 'you do not have those cards';
  return null;
}

export function tunnelExtraOptions(color: CardColor | null, extra: number, hand: Hand): CardCounts[] {
  const options: CardCounts[] = [];
  if (color !== null) {
    for (let locos = 0; locos < extra; locos++) {
      if (hand[LOCOMOTIVE] < locos) break;
      if (hand[color] >= extra - locos) options.push(locos > 0 ? { [color]: extra - locos, [LOCOMOTIVE]: locos } : { [color]: extra });
    }
  }
  if (hand[LOCOMOTIVE] >= extra) options.push({ [LOCOMOTIVE]: extra });
  return options;
}

/** Why a payment cannot build a station costing `cost`, or null when it can. Any one color plus locomotives works. */
export function stationPaymentError(cost: number, payment: CardCounts, hand: Hand): string | null {
  const shape = paymentShape(payment);
  if (!shape || shape.excavators) return 'a station is paid with one color plus locomotives';
  if (shape.total !== cost) return `this station costs exactly ${cost} card(s)`;
  if (!hasCards(hand, payment)) return 'you do not have those cards';
  return null;
}

export function stationPaymentOptions(cost: number, hand: Hand): CardCounts[] {
  const options: CardCounts[] = [];
  for (let locos = 0; locos < cost; locos++) {
    if (hand[LOCOMOTIVE] < locos) break;
    for (const c of CARD_COLORS) {
      if (hand[c] >= cost - locos) options.push(locos > 0 ? { [c]: cost - locos, [LOCOMOTIVE]: locos } : { [c]: cost - locos });
    }
  }
  if (hand[LOCOMOTIVE] >= cost) options.push({ [LOCOMOTIVE]: cost });
  return options;
}

/**
 * Seasons mode: why a payment cannot repair a route, or null when it can. Card repairs use the
 * route's color or locomotives (any one color for gray routes); tsunami repairs use excavators.
 */
export function repairPaymentError(route: Route, cost: { cards: number; excavators: number }, payment: CardCounts, hand: Hand): string | null {
  const shape = paymentShape(payment);
  if (!shape) return 'a repair uses one color plus locomotives';
  if (cost.excavators > 0) {
    if (shape.total !== 0 || shape.excavators !== cost.excavators) return `this repair needs exactly ${cost.excavators} excavator(s)`;
  } else {
    if (shape.excavators) return 'this repair is paid with cards, not excavators';
    if (shape.total !== cost.cards) return `this repair needs exactly ${cost.cards} card(s)`;
    if (route.color !== 'gray' && shape.color !== null && shape.color !== route.color) return `this repair needs ${route.color} cards or locomotives`;
  }
  if (!hasCards(hand, payment)) return 'you do not have those cards';
  return null;
}

export function repairPaymentOptions(route: Route, cost: { cards: number; excavators: number }, hand: Hand, rules: RulesConfig): CardCounts[] {
  if (cost.excavators > 0) return hand[EXCAVATOR] >= cost.excavators ? [{ [EXCAVATOR]: cost.excavators }] : [];
  return routePaymentOptions({ ...route, length: cost.cards, kind: 'normal', ferryLocomotives: 0 }, hand, rules);
}
