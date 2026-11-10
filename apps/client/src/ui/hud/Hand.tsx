import { ALL_CARDS, EXCAVATOR, type Hand as HandCounts } from '@rails/shared';
import { S } from '../strings.js';
import { CardChip } from './CardChip.js';

/** `excavators`: show the excavator card (Seasons mode only). */
export function Hand({ hand, excavators = false }: { hand: HandCounts; excavators?: boolean }) {
  const cards = ALL_CARDS.filter((c) => c !== EXCAVATOR || excavators);
  const total = cards.reduce((n, c) => n + hand[c], 0);
  return (
    <div className="hand" aria-label={S.hand}>
      <div className="dock-title">
        {S.hand} <span className="muted">({total})</span>
      </div>
      <div className="hand-cards">
        {cards.map((c) => (
          <CardChip key={c} card={c} count={hand[c]} />
        ))}
      </div>
    </div>
  );
}
