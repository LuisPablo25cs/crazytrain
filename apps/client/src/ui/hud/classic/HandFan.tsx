import { useState } from 'react';
import { CARD_COLORS, LOCOMOTIVE, type Hand } from '@rails/shared';
import { setUi, useClient } from '../../../state/store.js';
import { CARD_NAMES, S } from '../../strings.js';
import { cardArtUrl } from '../CardChip.js';

const CARDS = [...CARD_COLORS, LOCOMOTIVE] as const;
type HandCard = (typeof CARDS)[number];

/**
 * The hand as a fan: one card per color with its count. Hovering a card lifts it 34px, straightens it,
 * scales it to 1.14 and lights it; its neighbors step 14px aside. Clicking picks that color, so the
 * claim popover pays with it first.
 */
export function HandFan({ hand }: { hand: Hand }) {
  const picked = useClient((s) => s.ui.handColor);
  const [hover, setHover] = useState<number | null>(null);
  const mid = (CARDS.length - 1) / 2;
  const total = CARDS.reduce((n, c) => n + hand[c], 0);
  return (
    <div
      className="nx-hand"
      aria-label={`${S.hand} (${total})`}
      role="group"
      onMouseLeave={() => setHover(null)}
    >
      {CARDS.map((card: HandCard, i) => {
        const count = hand[card];
        const off = i - mid;
        let x = 0;
        let y = off * off * 1.2;
        let rot = -off * 2.2;
        let scale = 1;
        const lifted = hover === i;
        if (lifted) {
          y -= 34;
          rot = 0;
          scale = 1.14;
        } else if (hover !== null && Math.abs(i - hover) === 1) {
          x = (i - hover) * 14;
        } else if (picked === card) {
          y -= 14;
        }
        return (
          <button
            key={card}
            className={`nx-hand-card ${count === 0 ? 'empty' : ''} ${picked === card ? 'picked' : ''} ${lifted ? 'lifted' : ''}`}
            style={{
              transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
              zIndex: lifted ? 50 : i + 1,
            }}
            aria-label={`${CARD_NAMES[card]} × ${count}`}
            aria-pressed={picked === card}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => setUi({ handColor: picked === card ? null : card })}
          >
            <img src={cardArtUrl(card)} alt="" draggable={false} />
            <span className="nx-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
