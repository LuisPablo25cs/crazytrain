import type { GameView, Theme } from '@rails/shared';
import { playerHex } from '../../theme/themes.js';
import type { Affordances } from './affordances.js';

export function TurnBanner({ view, can, theme }: { view: GameView; can: Affordances; theme: Theme }) {
  const current = view.players[view.currentPlayer];
  return (
    <div className={`turn-banner ${can.isMyTurn ? 'mine' : ''} ${view.lastRound ? 'last-round' : ''}`} role="status">
      {view.phase === 'playing' && current && (
        <span className="dot" style={{ background: playerHex(theme, current.color) }} />
      )}
      {can.banner}
    </div>
  );
}
