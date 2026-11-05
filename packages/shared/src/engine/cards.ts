import { ALL_CARDS, CARD_COLORS, LOCOMOTIVE, type Card } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';
import { shuffle } from './rng.js';
import type { CardCounts, GameEvent, GameState, Hand } from './types.js';

export function emptyHand(): Hand {
  return Object.fromEntries(ALL_CARDS.map((c) => [c, 0])) as Hand;
}

export function handSize(hand: CardCounts): number {
  let n = 0;
  for (const c of ALL_CARDS) n += hand[c] ?? 0;
  return n;
}

export function hasCards(hand: Hand, cards: CardCounts): boolean {
  return ALL_CARDS.every((c) => (cards[c] ?? 0) <= hand[c]);
}

export function addCards(hand: Hand, cards: CardCounts): void {
  for (const c of ALL_CARDS) hand[c] += cards[c] ?? 0;
}

export function removeCards(hand: Hand, cards: CardCounts): void {
  for (const c of ALL_CARDS) hand[c] -= cards[c] ?? 0;
}

/** Expand counts into a flat card list (for the discard pile). */
export function toCardList(cards: CardCounts): Card[] {
  const out: Card[] = [];
  for (const c of ALL_CARDS) for (let i = 0; i < (cards[c] ?? 0); i++) out.push(c);
  return out;
}

export function mergeCounts(a: CardCounts, b: CardCounts): CardCounts {
  const out: CardCounts = {};
  for (const c of ALL_CARDS) {
    const n = (a[c] ?? 0) + (b[c] ?? 0);
    if (n > 0) out[c] = n;
  }
  return out;
}

export function buildDeck(rules: RulesConfig): Card[] {
  const deck: Card[] = [];
  for (const color of CARD_COLORS) for (let i = 0; i < rules.deck.perColor; i++) deck.push(color);
  for (let i = 0; i < rules.deck.locomotives; i++) deck.push(LOCOMOTIVE);
  return deck;
}

/** Draw the top card, reshuffling the discard pile when the draw pile is empty. Null when both are empty. */
export function drawCard(state: GameState, events: GameEvent[]): Card | null {
  if (state.drawPile.length === 0 && state.discard.length > 0) {
    state.drawPile = shuffle(state, state.discard);
    state.discard = [];
    events.push({ type: 'deckReshuffled' });
  }
  return state.drawPile.pop() ?? null;
}

export function cardsAvailable(state: GameState): number {
  return state.drawPile.length + state.discard.length;
}

function marketLocomotives(state: GameState): number {
  return state.market.filter((c) => c === LOCOMOTIVE).length;
}

/**
 * Fill empty market slots, then redeal while too many locomotives show. Redeals stop after
 * `maxResets` in a row so a pool full of locomotives cannot loop forever.
 */
export function refillMarket(state: GameState, events: GameEvent[]): void {
  const fill = () => {
    for (let i = 0; i < state.market.length; i++) {
      if (state.market[i] === null) state.market[i] = drawCard(state, events);
    }
  };
  fill();
  const { maxLocomotives, maxResets } = state.rules.market;
  let resets = 0;
  while (marketLocomotives(state) >= maxLocomotives && resets < maxResets) {
    const discarded = state.market.filter((c): c is Card => c !== null);
    state.discard.push(...discarded);
    state.market = state.market.map(() => null);
    events.push({ type: 'marketReset', discarded });
    fill();
    resets += 1;
  }
}
