import { useEffect, useState } from 'react';
import { routeStatus, type GameView, type MapIndex } from '@rails/shared';
import { setUi, useClient, type RulesTab } from '../../../state/store.js';
import { T } from '../../strings.js';
import { boardOfView } from '../affordances.js';

type HintKey = 'tunnel' | 'ferry' | 'closedLane' | 'lastRound';
const STORAGE = 'rails.hintsSeen';
const TAB: Record<HintKey, RulesTab> = { tunnel: 'special', ferry: 'special', closedLane: 'special', lastRound: 'turn' };

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(key: HintKey): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify([...seen(), key]));
  } catch {
    // Without storage the tip may come back next visit; that is fine.
  }
}

/**
 * One-time tips (fix D): the first time a player opens a tunnel, a ferry or a closed lane, or the
 * last round starts, one line explains it on the spot. Each tip shows once per device.
 */
export function FirstTimeHints({ view, map, hidden }: { view: GameView; map: MapIndex; hidden: boolean }) {
  const selected = useClient((s) => s.ui.selectedRoute);
  const [shown, setShown] = useState<HintKey | null>(null);

  useEffect(() => {
    let key: HintKey | null = null;
    if (view.lastRound) key = 'lastRound';
    if (!key && selected) {
      const route = map.routes.get(selected);
      const status = routeStatus(boardOfView(view), map, selected, view.me?.index ?? null).kind;
      if (status === 'closed' || status === 'blockedForYou') key = 'closedLane';
      else if (route?.kind === 'tunnel' && view.rules.expansions.tunnels) key = 'tunnel';
      else if (route?.kind === 'ferry' && view.rules.expansions.ferries) key = 'ferry';
    }
    if (!key || shown || seen().has(key)) return;
    markSeen(key);
    setShown(key);
  }, [selected, view.lastRound]);

  if (!shown || hidden) return null;
  const H = T.hints;
  return (
    <div className="nx-hint-card" role="note">
      <span className="nx-caps">{H.label}</span>
      <p>{H[shown]}</p>
      <div className="nx-pop-actions">
        <button className="nx-btn dark" onClick={() => setShown(null)}>
          {H.gotIt}
        </button>
        <button
          className="nx-btn outline"
          onClick={() => {
            setUi({ rulesTab: TAB[shown] });
            setShown(null);
          }}
        >
          {H.rules}
        </button>
      </div>
    </div>
  );
}
