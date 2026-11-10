import { EXPANSION_NAMES, GAME_MODES } from '@rails/shared';
import { sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { MODE_BLURBS, MODE_NAMES, S } from '../strings.js';

export function RulesPanel({ isHost }: { isHost: boolean }) {
  const toggles = useClient((s) => s.room!.toggles);
  const mode = useClient((s) => s.room!.mode);
  const years = useClient((s) => s.room!.years);
  return (
    <section className="panel">
      <h2>{S.rules}</h2>
      <div className="mode-picker" role="radiogroup" aria-label="Game mode">
        {GAME_MODES.map((m) => (
          <label key={m} className={`mode-option ${mode === m ? 'chosen' : ''}`}>
            <input
              type="radio"
              name="mode"
              checked={mode === m}
              disabled={!isHost}
              onChange={() => void sendOrToast({ type: 'setMode', mode: m })}
            />
            <strong>{MODE_NAMES[m]}</strong>
            <span className="muted">{MODE_BLURBS[m]}</span>
          </label>
        ))}
      </div>
      {mode === 'seasons' && (
        <label className="mode-years">
          Game length
          <select value={years} disabled={!isHost} onChange={(e) => void sendOrToast({ type: 'setMode', mode, years: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} year{y > 1 ? 's' : ''} ({y * 12} rounds)
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="toggles">
        {EXPANSION_NAMES.map((name) => (
          <li key={name}>
            <label>
              <input
                type="checkbox"
                checked={toggles[name]}
                disabled={!isHost}
                onChange={(e) => void sendOrToast({ type: 'setToggles', toggles: { [name]: e.target.checked } })}
              />
              <strong>{S.ruleNames[name]}</strong>
              <span className="muted"> — {S.ruleHelp[name]}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
