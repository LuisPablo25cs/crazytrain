import { useState } from 'react';
import { nextStationCost, stationPaymentOptions, type GameView, type MapIndex } from '@rails/shared';
import { sendAction } from '../../net/socket.js';
import { setUi } from '../../state/store.js';
import { S } from '../strings.js';
import { CardSet } from './CardChip.js';

/**
 * Station building, after the player picked a highlighted city: choose the route this station
 * will let them use (KTD8) and how to pay.
 */
export function StationDialog({ cityId, view, map }: { cityId: string; view: GameView; map: MapIndex }) {
  const me = view.me!;
  const city = map.cities.get(cityId);
  const cost = nextStationCost(view, view.players[me.index]!);
  const routes = (map.routesByCity.get(cityId) ?? []).filter((r) => view.routeOwners[r.id] !== me.index);
  const [borrow, setBorrow] = useState(() => routes.find((r) => view.routeOwners[r.id] !== undefined)?.id ?? routes[0]?.id ?? '');
  const cancel = () => setUi({ selectedCity: null, mode: { kind: 'normal' } });
  if (!city || cost === null) return null;
  const options = stationPaymentOptions(cost, me.hand);
  const owner = (routeId: string) => {
    const o = view.routeOwners[routeId];
    return o === undefined ? 'unclaimed' : (view.players[o]?.name ?? '?');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>
          {S.buildStation}: {city.name}
        </h2>
        <p className="muted">{S.stationCost(cost)}</p>
        <label>
          {S.stationBorrow}
          <select value={borrow} onChange={(e) => setBorrow(e.target.value)}>
            {routes.map((r) => {
              const other = r.from === cityId ? r.to : r.from;
              return (
                <option key={r.id} value={r.id}>
                  {city.name} – {map.cities.get(other)?.name} ({r.length}, {owner(r.id)})
                </option>
              );
            })}
          </select>
        </label>
        <p className="muted small-print">The chosen route counts for your tickets at the end only if another player owns it then.</p>
        <ul className="payment-options">
          {options.map((payment, i) => (
            <li key={i}>
              <button
                className="payment"
                disabled={!borrow}
                onClick={() => {
                  void sendAction({ type: 'buildStation', cityId, payment, borrowRouteId: borrow }).then((ok) => ok && cancel());
                }}
              >
                <CardSet cards={payment} />
                <span>{S.buildStation}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={cancel}>
          {S.cancel}
        </button>
      </div>
    </div>
  );
}
