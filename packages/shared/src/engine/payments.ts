import { CARD_COLORS, LOCOMOTIVE, type CardColor, type Route } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';
import { handSize, hasCards } from './cards.js';
import type { CardCounts, Hand } from './types.js';

export interface PaymentShape {
  /** The single non-locomotive color in the payment, or null when it is all locomotives. */
  color: CardColor | null;
  locomotives: number;
  total: number;
}

/** Check that a payment is well formed: non-negative integers, at most one color plus locomotives. */
export function paymentShape(payment: CardCounts): PaymentShape | null {
  let color: CardColor | null = null;
  for (const [card, n] of Object.entries(payment)) {
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 0) return null;
    if (card !== LOCOMOTIVE && !(CARD_COLORS as readonly string[]).includes(card)) return null;
    if (n === 0 || card === LOCOMOTIVE) continue;
    if (color !== null) return null;
    color = card as CardColor;
  }
  return { color, locomotives: payment[LOCOMOTIVE] ?? 0, total: handSize(payment) };
}

export function isFerryActive(route: Route, rules: RulesConfig): boolean {
  return route.kind === 'ferry' && rules.expansions.ferries;
}

export function isTunnelActive(route: Route, rules: RulesConfig): boolean {
  return route.kind === 'tunnel' && rules.expansions.tunnels;
}

/** Why a payment cannot claim a route, or null when it can. Does not check ownership or trains. */
export function routePaymentError(route: Route, payment: CardCounts, hand: Hand, rules: RulesConfig): string | null {
  const shape = paymentShape(payment);
  if (!shape) return 'a payment uses one color plus locomotives';
  if (shape.total !== route.length) return `this route needs exactly ${route.length} cards`;
  if (route.color !== 'gray' && shape.color !== null && shape.color !== route.color) {
    return `this route needs ${route.color} cards or locomotives`;
  }
  if (isFerryActive(route, rules) && shape.locomotives < route.ferryLocomotives) {
    return `this ferry needs at least ${route.ferryLocomotives} locomotive(s)`;
  }
  if (!hasCards(hand, payment)) return 'you do not have those cards';
  return null;
}

/** Every distinct way the hand can pay for the route, fewest locomotives first. */
export function routePaymentOptions(route: Route, hand: Hand, rules: RulesConfig): CardCounts[] {
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
  if (!shape) return 'extra cards use the tunnel color plus locomotives';
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
  if (!shape) return 'a station is paid with one color plus locomotives';
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
