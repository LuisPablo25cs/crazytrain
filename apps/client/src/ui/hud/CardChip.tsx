import type { Card } from '@rails/shared';
import { CARD_LETTERS, CARD_NAMES } from '../strings.js';

interface CardChipProps {
  card: Card | 'gray';
  count?: number;
  size?: 'small' | 'normal';
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

/** Card artwork (assets/web/cards), served under /art. Gray is a route color, not a card. */
export function cardArtUrl(card: Card): string {
  return `/art/cards/${card}.webp`;
}

/** A train card drawn with its artwork. Gray (any color) has no card, so it stays a plain chip. */
export function CardChip({ card, count, size = 'normal', disabled, title, onClick }: CardChipProps) {
  const label = `${CARD_NAMES[card]}${count !== undefined ? ` × ${count}` : ''}`;
  // Gray has no card; the excavator has no art yet (placeholder chip until it arrives).
  const art = card === 'gray' || card === 'excavator' ? undefined : { backgroundImage: `url(${cardArtUrl(card)})` };
  const content = (
    <>
      {!art && <span className="card-letter">{CARD_LETTERS[card]}</span>}
      {count !== undefined && <span className="card-count">{count}</span>}
    </>
  );
  const className = `card card-${card} ${art ? 'card-art' : ''} ${size} ${count === 0 ? 'empty' : ''}`;
  if (!onClick) {
    return (
      <span className={className} style={art} title={title ?? label} aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <button className={className} style={art} title={title ?? label} aria-label={label} disabled={disabled} onClick={onClick}>
      {content}
    </button>
  );
}

export function CardSet({ cards }: { cards: Partial<Record<Card, number>> }) {
  return (
    <span className="card-set">
      {Object.entries(cards)
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([c, n]) => (
          <CardChip key={c} card={c as Card} count={n} size="small" />
        ))}
    </span>
  );
}
