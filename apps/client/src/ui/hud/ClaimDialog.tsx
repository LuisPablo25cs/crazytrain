import { routeStatus, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { setUi } from '../../state/store.js';
import { CARD_NAMES, S } from '../strings.js';
import { boardOfView, claimInfo, type Affordances } from './affordances.js';
import { CardChip, CardSet } from './CardChip.js';

/** Route details and payment choices for the selected lane. Each lane is its own target (KTD7). */
export function ClaimDialog({ routeId, view, map, can }: { routeId: string; view: GameView; map: MapIndex; can: Affordances }) {
  const route = map.routes.get(routeId);
  if (!route) return null;
  const from = map.cities.get(route.from)?.name ?? route.from;
  const to = map.cities.get(route.to)?.name ?? route.to;
  const status = routeStatus(boardOfView(view), map, routeId, view.me?.index ?? null);
  const info = claimInfo(route, view, map);
  const reason = status.kind === 'owned' ? S.owned(view.players[status.owner]?.name ?? '?') : (can.claim ?? info.reason);
  const close = () => setUi({ selectedRoute: null });
  const kind =
    route.kind === 'tunnel' && view.rules.expansions.tunnels
      ? S.tunnel
      : route.kind === 'ferry' && view.rules.expansions.ferries
        ? `${S.ferry} (${route.ferryLocomotives} ${CARD_NAMES.locomotive.toLowerCase()})`
        : null;

  return (
    <div className="claim-dialog panel" role="dialog" aria-label={S.claimRoute(from, to)}>
      <header>
        <h2>{S.claimRoute(from, to)}</h2>
        <button className="link" onClick={close} aria-label={S.cancel}>
          ✕
        </button>
      </header>
      <p className="route-facts">
        <CardChip card={route.color} size="small" /> {route.length} · {CARD_NAMES[route.color]}
        {kind && <span className="badge">{kind}</span>}
        {route.parallelGroup && <span className="muted"> · lane {route.id.split('-').pop()}</span>}
      </p>
      {reason ? (
        <p className="muted">{reason}</p>
      ) : (
        <>
          <p>{S.payWith}</p>
          <ul className="payment-options">
            {info.options.map((payment, i) => (
              <li key={i}>
                <button
                  className="payment"
                  onClick={() => {
                    void sendAction({ type: 'claimRoute', routeId, payment }).then((ok) => ok && close());
                  }}
                >
                  <CardSet cards={payment} />
                  <span>{S.claim}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
