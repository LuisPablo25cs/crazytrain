import type { GameView } from '@rails/shared';
import { sendAction } from '../../../net/socket.js';
import { CARD_NAMES, NX, S } from '../../strings.js';
import type { Affordances } from '../affordances.js';
import { cardArtUrl } from '../CardChip.js';

/** Five face-up cards and the deck in a two-column block. Hover lifts a card; click takes it. */
export function MarketBlock({ view, can }: { view: GameView; can: Affordances }) {
  return (
    <section className="nx-panel nx-market" aria-label={S.market}>
      <h2 className="nx-caps">{NX.market}</h2>
      <div className="nx-market-grid">
        {view.market.map((card, slot) => {
          if (!card) return <span key={slot} className="nx-market-card empty" />;
          const why = can.faceUp(slot);
          return (
            <button
              key={slot}
              className="nx-market-card"
              disabled={why !== null}
              title={why ?? CARD_NAMES[card]}
              aria-label={CARD_NAMES[card]}
              onClick={() => void sendAction({ type: 'drawFaceUp', slot })}
            >
              <img src={cardArtUrl(card)} alt="" draggable={false} />
            </button>
          );
        })}
        <button
          className="nx-market-card nx-deck"
          disabled={can.drawBlind !== null}
          title={can.drawBlind ?? S.drawPile}
          aria-label={`${S.drawPile}, ${view.drawPileCount}`}
          onClick={() => void sendAction({ type: 'drawBlind' })}
        >
          <span className="nx-caps">{NX.deck}</span>
          <span className="nx-deck-count">{view.drawPileCount}</span>
        </button>
      </div>
    </section>
  );
}
