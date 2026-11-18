import { useEffect, useState } from 'react';
import { monthOfYear, type GameEvent, type GameView, type Hazard, type MapIndex } from '@rails/shared';
import { HAZARD_EFFECTS, HAZARD_NAMES, monthLabel, T } from '../strings.js';

const WINTER = [11, 0, 1];

/** Seasons mode: the month, the year, and how long the game still runs. */
export function SeasonClock({ view }: { view: GameView }) {
  if (view.rules.mode !== 'seasons') return null;
  const left = view.rules.seasons.years * 12 - view.month;
  const winter = WINTER.includes(monthOfYear(view.month));
  return (
    <div className={`season-clock ${winter ? 'winter' : ''}`} role="status" title={T.misc.clockTitle}>
      {winter && <span aria-label={T.misc.winter}>❄</span>}
      <strong>{monthLabel(view.month)}</strong>
      <span className="muted">
        {T.misc.monthsLeft(left)}
      </span>
    </div>
  );
}

/** Animation for each disaster, made with the /animations tool (copied to /art/animations). */
export function disasterGif(kind: Hazard): string {
  return `/art/animations/${kind}.gif`;
}

type Shown = Extract<GameEvent, { type: 'disaster' }>;

/** A card announcing a disaster as it strikes: its animation, where, and what it did. */
export function DisasterCard({ events, map }: { events: GameEvent[]; map: MapIndex }) {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    const hit = events.find((e): e is Shown => e.type === 'disaster');
    if (!hit) return;
    setShown(hit);
    const timer = setTimeout(() => setShown(null), 9000);
    return () => clearTimeout(timer);
  }, [events]);
  if (!shown) return null;
  const city = map.cities.get(shown.cityId)?.name ?? shown.cityId;
  const routeName = (id: string) => {
    const r = map.routes.get(id);
    return r ? `${map.cities.get(r.from)?.name} – ${map.cities.get(r.to)?.name}` : id;
  };
  const lines = [
    ...shown.damaged.map((id) => T.misc.damagedLine(routeName(id))),
    ...shown.lost.map((id) => T.misc.washedLine(routeName(id))),
    ...shown.blocked.map((id) => T.misc.ashLine(routeName(id))),
  ];
  return (
    <div className="disaster-card panel" role="alertdialog" aria-label={T.misc.near(HAZARD_NAMES[shown.kind], city)} onClick={() => setShown(null)}>
      <img src={disasterGif(shown.kind)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
      <div>
        <h2>
          {T.misc.near(HAZARD_NAMES[shown.kind], city)}!
        </h2>
        <p>{HAZARD_EFFECTS[shown.kind]}</p>
        {lines.length ? (
          <ul className="disaster-hits">
            {lines.slice(0, 8).map((l) => (
              <li key={l}>{l}</li>
            ))}
            {lines.length > 8 && <li>{T.misc.andMore(lines.length - 8)}</li>}
          </ul>
        ) : (
          <p className="muted">{T.misc.noTrackHit}</p>
        )}
        <p className="muted small-print">{T.misc.clickToClose}</p>
      </div>
    </div>
  );
}
