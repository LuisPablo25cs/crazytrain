import { ALL_CARDS, type Hand as HandCounts } from '@rails/shared';
import { S } from '../strings.js';
import { CardChip } from './CardChip.js';

export function Hand({ hand }: { hand: HandCounts }) {
  const total = ALL_CARDS.reduce((n, c) => n + hand[c], 0);
  return (
    <div className="hand" aria-label={S.hand}>
      <div className="dock-title">
        {S.hand} <span className="muted">({total})</span>
      </div>
      <div className="hand-cards">
        {ALL_CARDS.map((c) => (
          <CardChip key={c} card={c} count={hand[c]} />
        ))}
      </div>
    </div>
  );
}
