import { EXPANSION_NAMES } from '@rails/shared';
import { sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { S } from '../strings.js';

export function RulesPanel({ isHost }: { isHost: boolean }) {
  const toggles = useClient((s) => s.room!.toggles);
  return (
    <section className="panel">
      <h2>{S.rules}</h2>
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
