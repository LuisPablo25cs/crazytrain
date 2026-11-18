import { useEffect, useState } from 'react';
import { routeStatus, type GameView, type MapIndex } from '@rails/shared';
import { useClient } from '../../../state/store.js';
import { T } from '../../strings.js';
import { boardOfView } from '../affordances.js';

/**
 * A small label next to the pointer over the board: whose line a claimed route is, or why a lane
 * is closed (fixes E and F). Free routes need no label.
 */
export function RouteTooltip({ view, map }: { view: GameView; map: MapIndex }) {
  const hovered = useClient((s) => s.ui.hoveredRoute);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => setAt({ x: e.clientX, y: e.clientY });
    addEventListener('pointermove', onMove);
    return () => removeEventListener('pointermove', onMove);
  }, []);
  if (!hovered || !at) return null;
  const status = routeStatus(boardOfView(view), map, hovered, view.me?.index ?? null);
  const L = T.lanes;
  const text =
    status.kind === 'owned'
      ? L.ownedTooltip(view.players[status.owner]?.name ?? '?')
      : status.kind === 'closed'
        ? L.closedTooltip(view.players.length)
        : status.kind === 'blockedForYou'
          ? L.mineTooltip
          : null;
  if (!text) return null;
  return (
    <div className="nx-tooltip" role="tooltip" style={{ transform: `translate(${at.x + 16}px, ${at.y + 18}px)` }}>
      {status.kind !== 'owned' && (
        <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
          <rect x="3.5" y="8" width="11" height="8" rx="1" />
          <path d="M6 8V5.5a3 3 0 0 1 6 0V8" />
        </svg>
      )}
      {text}
    </div>
  );
}
