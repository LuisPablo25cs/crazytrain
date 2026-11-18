import { useEffect, useRef, useState } from 'react';
import { routePoints, type Card, type GameEvent, type GameView, type MapIndex, type Theme } from '@rails/shared';
import { setUi, store, useClient, type ActivityKind } from '../../../state/store.js';
import { playerHex } from '../../../theme/themes.js';
import { T } from '../../strings.js';
import { cardArtUrl } from '../CardChip.js';

/** How long a toast and a plaque badge stay. */
export const ACTIVITY_MS = 3200;
/** At most this many toasts at once; older ones leave first. */
const MAX_TOASTS = 2;

interface Item {
  id: number;
  player: number;
  kind: ActivityKind;
  text: string;
  card?: Card;
  points?: number;
}

let nextId = 1;

/** One toast per rival action worth seeing; null for events that are not a player's move. */
function itemOf(e: GameEvent, view: GameView, map: MapIndex): Omit<Item, 'id'> | null {
  const A = T.activity;
  const routeName = (id: string) => {
    const r = map.routes.get(id);
    return r ? `${map.cities.get(r.from)?.name ?? r.from} – ${map.cities.get(r.to)?.name ?? r.to}` : id;
  };
  switch (e.type) {
    case 'drewFaceUp':
      return { player: e.player, kind: 'card', text: A.tookCard(e.card), card: e.card };
    case 'drewBlind':
      return { player: e.player, kind: 'card', text: A.drewBlind };
    case 'claimedRoute': {
      const r = map.routes.get(e.routeId);
      return { player: e.player, kind: 'route', text: A.claimed(routeName(e.routeId)), points: r ? routePoints(view.rules, r.length) : undefined };
    }
    case 'drewTickets':
      return { player: e.player, kind: 'tickets', text: A.drewTickets };
    case 'keptTickets':
      return { player: e.player, kind: 'tickets', text: A.keptTickets(e.count) };
    case 'builtStation':
      return { player: e.player, kind: 'station', text: A.builtStation(map.cities.get(e.cityId)?.name ?? e.cityId) };
    case 'tunnelRevealed':
      return { player: e.player, kind: 'tunnel', text: A.tunnel(routeName(e.routeId)) };
    case 'tunnelWithdrawn':
      return { player: e.player, kind: 'tunnel', text: A.tunnelWithdrawn };
    case 'passed':
      return { player: e.player, kind: 'pass', text: A.passed };
    default:
      return null;
  }
}

/**
 * What the other players just did, as short toasts under the header with the real card art. The
 * acting player's plaque shows a badge at the same time (see PlayerPlaques). My own moves are not
 * repeated here: I just made them.
 */
export function ActivityFeed({ view, map, theme }: { view: GameView; map: MapIndex; theme: Theme }) {
  const lastEvents = useClient((s) => s.lastEvents);
  const [items, setItems] = useState<Item[]>([]);
  const viewer = useRef(view.me?.index ?? null);
  viewer.current = view.me?.index ?? null;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const fresh = lastEvents
      .map((e) => itemOf(e, viewRef.current, map))
      .filter((i): i is Omit<Item, 'id'> => i !== null && i.player !== viewer.current)
      .map((i) => ({ ...i, id: nextId++ }));
    if (fresh.length === 0) return;
    setItems((prev) => [...prev, ...fresh].slice(-MAX_TOASTS));
    const last = fresh[fresh.length - 1]!;
    const at = Date.now();
    setUi({ activity: { player: last.player, kind: last.kind, at } });
    const t = setTimeout(() => {
      if (store.getState().ui.activity?.at === at) setUi({ activity: null });
    }, ACTIVITY_MS);
    return () => clearTimeout(t);
  }, [lastEvents, map]);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => setItems((prev) => prev.slice(1)), ACTIVITY_MS);
    return () => clearTimeout(t);
  }, [items]);

  return (
    <div className="nx-feed" aria-live="polite">
      {items.map((it) => {
        const p = view.players[it.player];
        return (
          <div key={it.id} className="nx-toast" role="status">
            <span className="nx-toast-swatch" style={{ background: playerHex(theme, p?.color ?? '') }} />
            {it.card && <img src={cardArtUrl(it.card)} alt="" draggable={false} />}
            <span className="nx-toast-text">
              <strong>{p?.name ?? '?'}</strong> {it.text}
            </span>
            {it.points !== undefined && <span className="nx-points">+{it.points}</span>}
          </div>
        );
      })}
    </div>
  );
}
