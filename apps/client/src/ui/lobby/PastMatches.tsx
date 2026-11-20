import { useState } from 'react';
import type { MatchRecord } from '@rails/shared';
import { useTheme } from '../../theme/ThemeProvider.js';
import { playerHex } from '../../theme/themes.js';
import { SignIcon } from '../hud/classic/SignIcon.js';
import { T, useLang } from '../strings.js';

const SHOWN = 3;

/** "12 min ago", in the chosen language. */
function ago(at: number, lang: string): string {
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const s = Math.round((at - Date.now()) / 1000);
  if (s > -60) return fmt.format(s, 'second');
  if (s > -3600) return fmt.format(Math.round(s / 60), 'minute');
  if (s > -86400) return fmt.format(Math.round(s / 3600), 'hour');
  return fmt.format(Math.round(s / 86400), 'day');
}

/** Finished games in this room, newest first: who won, everyone's score, mode and map. */
export function PastMatches({ history }: { history: MatchRecord[] }) {
  const { theme } = useTheme();
  const lang = useLang();
  const [all, setAll] = useState(false);
  const L = T.lobby;
  const list = all ? history : history.slice(0, SHOWN);
  return (
    <section className="lobby-history" aria-labelledby="lobby-history">
      <div className="lobby-heading">
        <h2 id="lobby-history">{L.pastMatches}</h2>
        {history.length > 0 && <span>{L.matchCount(history.length)}</span>}
      </div>
      {history.length === 0 ? (
        <p className="lobby-history-empty">{L.noMatches}</p>
      ) : (
        <ol className="lobby-matches">
          {list.map((m, n) => (
            <li key={m.endedAt + ':' + n} className="lobby-match">
              <header>
                <span className="nx-caps">{L.matchNumber(history.length - history.indexOf(m))}</span>
                <span>
                  {m.mode === 'seasons' ? `${T.modes.seasons} · ${L.year(m.years)}` : T.modes.classic} · {m.mapName}
                </span>
                <time dateTime={new Date(m.endedAt).toISOString()}>{ago(m.endedAt, lang)}</time>
              </header>
              <ol>
                {m.players.map((p, i) => {
                  const hex = playerHex(theme, p.color);
                  return (
                    <li key={p.name + i} className={p.winner ? 'winner' : ''}>
                      <span className="lobby-match-place">{i + 1}</span>
                      <span className="lobby-match-chip" style={{ background: hex }}>
                        <SignIcon sign={p.sign} hex={hex} size={12} />
                      </span>
                      <span className="lobby-match-name">{p.name}</span>
                      <span className="lobby-match-tickets" title={L.ticketsDone(p.ticketsDone, p.tickets)}>
                        {p.ticketsDone}/{p.tickets}
                      </span>
                      <span className="lobby-match-score">{p.total}</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
      {history.length > SHOWN && (
        <button className="nx-btn outline light lobby-history-more" onClick={() => setAll(!all)}>
          {all ? L.showFewer : L.showAll(history.length)}
        </button>
      )}
    </section>
  );
}
