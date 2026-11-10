import { useEffect, useState } from 'react';
import { monthOfYear, type GameEvent, type GameView, type Hazard, type MapIndex } from '@rails/shared';
import { HAZARD_EFFECTS, HAZARD_NAMES, monthLabel } from '../strings.js';

const WINTER = [11, 0, 1];

/** Seasons mode: the month, the year, and how long the game still runs. */
export function SeasonClock({ view }: { view: GameView }) {
  if (view.rules.mode !== 'seasons') return null;
  const left = view.rules.seasons.years * 12 - view.month;
  const winter = WINTER.includes(monthOfYear(view.month));
  return (
    <div className={`season-clock ${winter ? 'winter' : ''}`} role="status" title="Each round is one month">
      {winter && <span aria-label="winter">❄</span>}
      <strong>{monthLabel(view.month)}</strong>
      <span className="muted">
        {left} month{left === 1 ? '' : 's'} left
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
    ...shown.damaged.map((id) => `${routeName(id)} damaged`),
    ...shown.lost.map((id) => `${routeName(id)} washed away`),
    ...shown.blocked.map((id) => `${routeName(id)} under ash`),
  ];
  return (
    <div className="disaster-card panel" role="alertdialog" aria-label={`${HAZARD_NAMES[shown.kind]} near ${city}`} onClick={() => setShown(null)}>
      <img src={disasterGif(shown.kind)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
      <div>
        <h2>
          {HAZARD_NAMES[shown.kind]} near {city}!
        </h2>
        <p>{HAZARD_EFFECTS[shown.kind]}</p>
        {lines.length ? (
          <ul className="disaster-hits">
            {lines.slice(0, 8).map((l) => (
              <li key={l}>{l}</li>
            ))}
            {lines.length > 8 && <li>…and {lines.length - 8} more</li>}
          </ul>
        ) : (
          <p className="muted">No track was hit this time.</p>
        )}
        <p className="muted small-print">Click to close</p>
      </div>
    </div>
  );
}
