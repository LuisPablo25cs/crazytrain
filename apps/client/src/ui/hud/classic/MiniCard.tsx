import type { Card, CardCounts } from '@rails/shared';
import { CARD_NAMES, NX } from '../../strings.js';
import { cardArtUrl } from '../CardChip.js';

/** A small train card with its artwork; `ghost` marks a card the player is missing. */
export function MiniCard({
  card,
  ghost,
  index = 0,
}: {
  card?: Card;
  ghost?: boolean;
  index?: number;
}) {
  const delay = { animationDelay: `${index * 60}ms` };
  if (ghost || !card)
    return <span className="nx-mini ghost" style={delay} aria-label={NX.missingCard} />;
  return (
    <span className="nx-mini" style={delay} title={CARD_NAMES[card]}>
      <img src={cardArtUrl(card)} alt={CARD_NAMES[card]} draggable={false} />
    </span>
  );
}

/** Cards of a payment in play order: the color cards first, then locomotives. */
export function paymentCards(payment: CardCounts): Card[] {
  const out: Card[] = [];
  const entries = Object.entries(payment) as [Card, number][];
  entries.sort(([a], [b]) => Number(a === 'locomotive') - Number(b === 'locomotive'));
  for (const [card, n] of entries) for (let i = 0; i < n; i++) out.push(card);
  return out;
}

/** A row of mini cards that deal in one by one; `missing` adds empty slots after them. */
export function CardStrip({ cards, missing = 0 }: { cards: Card[]; missing?: number }) {
  return (
    <span className="nx-strip-cards">
      {cards.map((c, i) => (
        <MiniCard key={`${c}-${i}`} card={c} index={i} />
      ))}
      {Array.from({ length: missing }, (_, i) => (
        <MiniCard key={`ghost-${i}`} ghost index={cards.length + i} />
      ))}
    </span>
  );
}
