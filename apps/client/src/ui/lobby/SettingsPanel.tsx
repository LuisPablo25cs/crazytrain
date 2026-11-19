import { useEffect, useState } from 'react';
import { TRAINS_RANGE } from '@rails/shared';
import { sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { T } from '../strings.js';

const STEP = 5;
const clamp = (n: number) => Math.min(TRAINS_RANGE.max, Math.max(TRAINS_RANGE.min, Math.round(n)));

/**
 * Game settings chosen before the start. For now: how many trains each player gets.
 * Everyone sees the number; only the host can change it.
 */
export function SettingsPanel({ isHost }: { isHost: boolean }) {
  const trains = useClient((s) => s.room!.trainsPerPlayer);
  const fallback = useClient((s) => s.room!.defaultTrains);
  const [draft, setDraft] = useState(String(trains));
  useEffect(() => setDraft(String(trains)), [trains]);
  const L = T.lobby;

  const set = (n: number) => {
    const next = clamp(n);
    setDraft(String(next));
    if (next !== trains) void sendOrToast({ type: 'setSettings', trainsPerPlayer: next === fallback ? null : next });
  };
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim() !== '') set(n);
    else setDraft(String(trains));
  };
  // Buttons move to the next multiple of 5, so 45 → 40 → 35 and 42 → 40.
  const down = () => set(trains % STEP ? trains - (trains % STEP) : trains - STEP);
  const up = () => set(trains % STEP ? trains + STEP - (trains % STEP) : trains + STEP);

  return (
    <div className="lobby-group">
      <span className="nx-caps" id="lobby-settings">
        {L.settings}
      </span>
      <div className="lobby-box lobby-setting" role="group" aria-labelledby="lobby-settings">
        <span className="lobby-option-body">
          <strong id="lobby-trains">{L.trainsPerPlayer}</strong>
          <span>{L.trainsHelp(fallback)}</span>
        </span>
        <div className="lobby-stepper">
          <button
            className="nx-square"
            disabled={!isHost || trains <= TRAINS_RANGE.min}
            aria-label={L.fewerTrains}
            title={L.fewerTrains}
            onClick={down}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 9h12" />
            </svg>
          </button>
          <input
            className="lobby-stepper-value"
            type="number"
            inputMode="numeric"
            min={TRAINS_RANGE.min}
            max={TRAINS_RANGE.max}
            value={draft}
            disabled={!isHost}
            aria-labelledby="lobby-trains"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          <button
            className="nx-square"
            disabled={!isHost || trains >= TRAINS_RANGE.max}
            aria-label={L.moreTrains}
            title={L.moreTrains}
            onClick={up}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M9 3v12M3 9h12" />
            </svg>
          </button>
          {isHost && trains !== fallback && (
            <button className="nx-btn outline light lobby-reset" onClick={() => set(fallback)}>
              {L.useDefault}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
