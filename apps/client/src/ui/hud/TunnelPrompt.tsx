import { tunnelExtraOptions, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { S } from '../strings.js';
import { CardChip, CardSet } from './CardChip.js';

/** The tunnel reveal, shown to everyone. Only the active player can pay or withdraw (R8). */
export function TunnelPrompt({ view, map }: { view: GameView; map: MapIndex }) {
  const turn = view.turn;
  if (turn.kind !== 'tunnel') return null;
  const route = map.routes.get(turn.routeId);
  const name = route ? `${map.cities.get(route.from)?.name} – ${map.cities.get(route.to)?.name}` : turn.routeId;
  const mine = view.me?.index === view.currentPlayer;
  const options = mine && view.me ? tunnelExtraOptions(turn.color, turn.extra, view.me.hand) : [];
  const player = view.players[view.currentPlayer]?.name ?? '?';

  const body = (
    <>
      <h2>
        {S.tunnelReveal}: {name}
      </h2>
      <p className="muted">{mine ? '' : `${player} — `}{S.tunnelExtra(turn.extra)}</p>
      <div className="reveal">
        {turn.revealed.map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
      </div>
      <p>
        Laid down: <CardSet cards={turn.payment} />
      </p>
    </>
  );

  if (!mine) return <div className="tunnel-watch panel">{body}</div>;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        {body}
        {options.length > 0 ? (
          <ul className="payment-options">
            {options.map((extra, i) => (
              <li key={i}>
                <button className="payment" onClick={() => void sendAction({ type: 'resolveTunnel', extra })}>
                  <CardSet cards={extra} />
                  <span>{S.payExtra}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">You cannot pay the extra cards.</p>
        )}
        <button className="secondary" onClick={() => void sendAction({ type: 'withdrawTunnel' })}>
          {S.withdraw}
        </button>
      </div>
    </div>
  );
}
