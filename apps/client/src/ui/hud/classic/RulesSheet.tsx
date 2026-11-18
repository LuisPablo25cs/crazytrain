import { useEffect, useRef } from 'react';
import { maxScoredLength, openLanes, routePoints, type GameView, type MapIndex } from '@rails/shared';
import { setUi, useClient, type RulesTab } from '../../../state/store.js';
import { T } from '../../strings.js';
import { cardArtUrl } from '../CardChip.js';
import { ticketPictureUrl } from '../TicketArt.js';

const TABS: RulesTab[] = ['turn', 'score', 'special'];

/** The smallest player count at which both lanes of a double route open, or null when they never do. */
function bothLanesFrom(view: GameView): number | null {
  for (let n = 1; n <= 12; n++) if (openLanes(view.rules, n) > 1) return n;
  return null;
}

/**
 * How to play, as a side panel so the board stays in view (fix D). Three short tabs; the special
 * routes tab lists only the rules turned on in this room.
 */
export function RulesSheet({ view, map }: { view: GameView; map: MapIndex }) {
  const tab = useClient((s) => s.ui.rulesTab);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!tab) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ rulesTab: null });
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [tab !== null]);
  if (!tab) return null;
  const R = T.rulesPanel;
  const rules = view.rules;
  const longest = map.map.routes.reduce((n, r) => Math.max(n, r.length), 0);
  const lengths = Array.from({ length: Math.min(longest, maxScoredLength(rules)) }, (_, i) => i + 1);
  const sampleTicket = map.map.tickets.find((t) => t.deck === 'regular')?.id;
  const from = bothLanesFrom(view);
  const doubles = map.map.routes.some((r) => r.parallelGroup);

  return (
    <aside className="nx-rules" aria-labelledby="nx-rules-title">
      <header>
        <h2 id="nx-rules-title">{R.title}</h2>
        <button ref={closeRef} className="nx-square" aria-label={R.close} onClick={() => setUi({ rulesTab: null })}>
          ✕
        </button>
      </header>
      <div className="nx-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'on' : ''}
            onClick={() => setUi({ rulesTab: t })}
          >
            {R.tabs[t]}
          </button>
        ))}
      </div>

      {tab === 'turn' && (
        <div className="nx-rules-body" role="tabpanel">
          <p>
            {R.turnIntro[0]}
            <strong>{R.turnIntro[1]}</strong>
            {R.turnIntro[2]}
          </p>
          <ol className="nx-steps">
            <li>
              <div>
                <h3>{R.drawTitle}</h3>
                <p>{R.drawText}</p>
              </div>
              <img src={cardArtUrl('locomotive')} alt="" className="nx-rules-card" />
            </li>
            <li>
              <div>
                <h3>{R.claimTitle}</h3>
                <p>{R.claimText}</p>
              </div>
              <img src={cardArtUrl('blue')} alt="" className="nx-rules-card" />
            </li>
            <li>
              <div>
                <h3>{R.ticketsTitle}</h3>
                <p>{R.ticketsText(rules.tickets.drawCount, rules.tickets.drawKeepMin)}</p>
              </div>
              {sampleTicket && <img src={ticketPictureUrl(sampleTicket)} alt="" className="nx-rules-ticket" />}
            </li>
          </ol>
          <p className="muted">{R.lastRound(rules.lastRoundTrainThreshold)}</p>
        </div>
      )}

      {tab === 'score' && (
        <div className="nx-rules-body" role="tabpanel">
          <p>{R.scoreIntro}</p>
          <table className="nx-score-table">
            <caption>{R.scoreCaption}</caption>
            <tbody>
              <tr>
                {lengths.map((n) => (
                  <th key={n} scope="col">
                    {n}
                  </th>
                ))}
              </tr>
              <tr>
                {lengths.map((n) => (
                  <td key={n}>{routePoints(rules, n)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <section>
            <h3>{R.ticketsNoteTitle}</h3>
            <p>{R.ticketsNote}</p>
          </section>
          <section>
            <h3>{R.longestTitle(rules.longestTrailBonus)}</h3>
            <p>{R.longestNote}</p>
          </section>
          <section>
            <h3>{R.duringTitle}</h3>
            <p>{R.duringNote}</p>
          </section>
        </div>
      )}

      {tab === 'special' && (
        <div className="nx-rules-body" role="tabpanel">
          <p className="muted">{R.specialIntro}</p>
          {doubles && (
            <section id="nx-rules-double">
              <h3>{R.doubleTitle}</h3>
              <p>{from !== null && from > 1 ? R.doubleRule(from) : R.doubleBoth}</p>
            </section>
          )}
          {rules.expansions.tunnels && (
            <section>
              <h3>{R.tunnelsTitle}</h3>
              <p>{R.tunnelsText(rules.tunnelRevealCount)}</p>
            </section>
          )}
          {rules.expansions.ferries && (
            <section>
              <h3>{R.ferriesTitle}</h3>
              <p>{R.ferriesText}</p>
            </section>
          )}
          {rules.expansions.stations && (
            <section>
              <h3>{R.stationsTitle}</h3>
              <p>{R.stationsText}</p>
            </section>
          )}
          {rules.expansions.longTickets && (
            <section>
              <h3>{R.triplesTitle}</h3>
              <p>{R.triplesText}</p>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
