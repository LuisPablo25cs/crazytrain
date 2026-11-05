import type { GameView } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { S } from '../strings.js';
import type { Affordances } from './affordances.js';
import { CardChip } from './CardChip.js';

export function Market({ view, can }: { view: GameView; can: Affordances }) {
  return (
    <div className="market" aria-label={S.market}>
      <div className="dock-title">{S.market}</div>
      <div className="market-cards">
        {view.market.map((card, slot) =>
          card ? (
            <CardChip
              key={slot}
              card={card}
              disabled={can.faceUp(slot) !== null}
              title={can.faceUp(slot) ?? undefined}
              onClick={() => void sendAction({ type: 'drawFaceUp', slot })}
            />
          ) : (
            <span key={slot} className="card empty-slot" />
          ),
        )}
        <button
          className="deck"
          disabled={can.drawBlind !== null}
          title={can.drawBlind ?? S.drawPile}
          onClick={() => void sendAction({ type: 'drawBlind' })}
        >
          <span>{S.drawPile}</span>
          <span className="muted">{view.drawPileCount}</span>
        </button>
        <button
          className="deck tickets-deck"
          disabled={can.drawTickets !== null}
          title={can.drawTickets ?? S.drawTickets}
          onClick={() => void sendAction({ type: 'drawTickets' })}
        >
          <span>{S.drawTickets}</span>
          <span className="muted">{S.ticketsLeft(view.ticketDeckCount)}</span>
        </button>
      </div>
    </div>
  );
}
