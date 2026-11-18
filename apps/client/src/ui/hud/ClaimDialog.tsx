import { effectiveRoute, routeStatus, type CardCounts, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { setUi } from '../../state/store.js';
import { CARD_NAMES, HAZARD_NAMES, monthLabel, S, T } from '../strings.js';
import { boardOfView, claimInfo, repairInfo, type Affordances } from './affordances.js';
import { CardChip, CardSet } from './CardChip.js';

function PaymentList({ options, label, onPay }: { options: CardCounts[]; label: string; onPay: (payment: CardCounts) => void }) {
  return (
    <ul className="payment-options">
      {options.map((payment, i) => (
        <li key={i}>
          <button className="payment" onClick={() => onPay(payment)}>
            <CardSet cards={payment} />
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Route details and payment choices for the selected lane. Each lane is its own target (KTD7). */
export function ClaimDialog({ routeId, view, map, can }: { routeId: string; view: GameView; map: MapIndex; can: Affordances }) {
  const board = boardOfView(view);
  const route = effectiveRoute(board, map, routeId);
  if (!route) return null;
  const from = map.cities.get(route.from)?.name ?? route.from;
  const to = map.cities.get(route.to)?.name ?? route.to;
  const status = routeStatus(board, map, routeId, view.me?.index ?? null);
  const info = claimInfo(route, view, map);
  const repair = repairInfo(routeId, view, map);
  const damage = view.damage[routeId];
  const close = () => setUi({ selectedRoute: null });
  const kind =
    route.kind === 'tunnel' && view.rules.expansions.tunnels
      ? S.tunnel
      : route.kind === 'ferry' && view.rules.expansions.ferries
        ? `${S.ferry} (${route.ferryLocomotives} ${CARD_NAMES.locomotive.toLowerCase()})`
        : null;

  // What the board says about this route right now (Seasons mode).
  const notes: string[] = [];
  if (status.kind === 'owned') notes.push(S.owned(view.players[status.owner]?.name ?? '?'));
  if (damage) {
    const pieces = damage.cause === 'earthquake' ? T.misc.wholeLine : T.misc.piecesOf(damage.broken.length, route.length);
    notes.push(T.misc.damageNote(HAZARD_NAMES[damage.cause], pieces, monthLabel(damage.deadline)));
  }
  if (view.blocked[routeId] !== undefined) notes.push(T.misc.ashNote(monthLabel(view.blocked[routeId])));
  if (view.recolored[routeId]) notes.push(T.misc.grayNote);
  if (status.kind === 'abandoned') notes.push(T.misc.abandonedNote(status.cost));

  const repairing = repair && (repair.claim || status.kind === 'owned');
  const reason = repairing ? (can.claim ?? repair.reason) : status.kind === 'owned' ? null : (can.claim ?? info.reason);
  const excavators = info.options[0]?.excavator ?? 0;

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
        {route.parallelGroup && <span className="muted"> · {T.misc.lane(route.id.split('-').pop() ?? '')}</span>}
      </p>
      {notes.map((n) => (
        <p key={n} className="route-note">
          {n}
        </p>
      ))}
      {repairing ? (
        reason ? (
          <p className="muted">{reason}</p>
        ) : (
          <>
            <p>{repair.claim ? T.misc.repairToClaim : T.misc.repairWith(repair.cost.excavators ? T.misc.excavatorsN(repair.cost.excavators) : T.misc.cardsN(repair.cost.cards))}</p>
            <PaymentList
              options={repair.options}
              label={repair.claim ? T.misc.repairAndClaim : T.misc.repair}
              onPay={(payment) => void sendAction({ type: 'repairRoute', routeId, payment }).then((ok) => ok && close())}
            />
          </>
        )
      ) : status.kind === 'owned' ? null : reason ? (
        <p className="muted">{reason}</p>
      ) : (
        <>
          <p>
            {S.payWith}
            {excavators > 0 && <span className="muted">{T.misc.disasterGround(excavators)}</span>}
          </p>
          <PaymentList
            options={info.options}
            label={S.claim}
            onPay={(payment) => void sendAction({ type: 'claimRoute', routeId, payment }).then((ok) => ok && close())}
          />
        </>
      )}
    </div>
  );
}
