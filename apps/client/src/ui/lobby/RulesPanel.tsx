import { DOUBLE_ROUTE_CHOICES, EXPANSION_NAMES, GAME_MODES } from '@rails/shared';
import { sendOrToast } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { MODE_BLURBS, MODE_NAMES, S, T } from '../strings.js';

/**
 * The journey settings: game mode (and Seasons length), double routes, and the extra rules as
 * switches. Everyone sees them; only the host can change them.
 */
export function RulesPanel({ isHost }: { isHost: boolean }) {
  const toggles = useClient((s) => s.room!.toggles);
  const mode = useClient((s) => s.room!.mode);
  const years = useClient((s) => s.room!.years);
  const doubleRoutes = useClient((s) => s.room!.doubleRoutes);
  const L = T.lobby;
  return (
    <div className="lobby-journey">
      <div className="lobby-options two" role="radiogroup" aria-label={T.misc.gameMode}>
        {GAME_MODES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            disabled={!isHost}
            className={`lobby-option tall ${mode === m ? 'on' : ''}`}
            onClick={() => void sendOrToast({ type: 'setMode', mode: m })}
          >
            <span className="lobby-option-title">
              <span className="lobby-dot" aria-hidden="true" />
              {MODE_NAMES[m]}
            </span>
            <span className="lobby-option-text">{MODE_BLURBS[m]}</span>
          </button>
        ))}
      </div>

      {mode === 'seasons' && (
        <div className="lobby-years" role="radiogroup" aria-label={T.misc.gameLength}>
          <span>{T.misc.gameLength}</span>
          {[1, 2, 3, 4, 5].map((y) => (
            <button
              key={y}
              role="radio"
              aria-checked={years === y}
              disabled={!isHost}
              className={`lobby-option small ${years === y ? 'on' : ''}`}
              title={T.misc.years(y)}
              onClick={() => void sendOrToast({ type: 'setMode', mode, years: y })}
            >
              {L.year(y)}
            </button>
          ))}
        </div>
      )}

      <div className="lobby-options two">
        <div className="lobby-group">
          <span className="nx-caps" id="lobby-doubles">
            {T.lanes.lobbyTitle}
          </span>
          <div className="lobby-stack" role="radiogroup" aria-labelledby="lobby-doubles">
            {DOUBLE_ROUTE_CHOICES.map((choice) => (
              <button
                key={choice}
                role="radio"
                aria-checked={doubleRoutes === choice}
                disabled={!isHost}
                className={`lobby-option row ${doubleRoutes === choice ? 'on' : ''}`}
                onClick={() => void sendOrToast({ type: 'setMode', mode, doubleRoutes: choice })}
              >
                <span className="lobby-dot" aria-hidden="true" />
                <span className="lobby-option-body">
                  <strong>{choice === 'rule' ? T.lanes.ruleTitle : T.lanes.bothTitle}</strong>
                  <span>{choice === 'rule' ? T.lanes.ruleText : T.lanes.bothText}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lobby-group">
          <span className="nx-caps">{L.extraRules}</span>
          <div className="lobby-box tight">
            {EXPANSION_NAMES.map((name) => (
              <button
                key={name}
                role="switch"
                aria-checked={toggles[name]}
                disabled={!isHost}
                className="lobby-switch"
                onClick={() => void sendOrToast({ type: 'setToggles', toggles: { [name]: !toggles[name] } })}
              >
                <span className="lobby-option-body">
                  <strong>{S.ruleNames[name]}</strong>
                  <span>{S.ruleHelp[name]}</span>
                </span>
                <span className={`lobby-track ${toggles[name] ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
