import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_TICKET_STYLE,
  indexMap,
  MapSchema,
  resolveTicketStyle,
  suggestTicketPoints,
  ticketCities,
  validateMap,
  type MapDefinition,
  type Ticket,
  type TicketStyle,
} from '@rails/shared';
import { TicketArt } from '../ui/hud/TicketArt.js';

/**
 * Hidden page (/tickets, only while the editor is on): pick two cities, or three for a triple
 * ticket, see the ticket as players will, and add it to the map file.
 */
/** Sliders for how the text sits on the ticket. Units are the artwork's 1000-wide drawing space. */
const TUNING: { group: string; key: keyof TicketStyle; label: string; min: number; max: number; step: number }[] = [
  { group: 'City names', key: 'cityX', label: 'Position across', min: 0, max: 1000, step: 1 },
  { group: 'City names', key: 'cityY', label: 'Position down', min: 0, max: 460, step: 1 },
  { group: 'City names', key: 'citySize', label: 'Text size', min: 8, max: 60, step: 0.5 },
  { group: 'City names', key: 'cityMaxWidth', label: 'Longest line', min: 80, max: 700, step: 5 },
  { group: 'City names', key: 'cityCurve', label: 'Curve (0 is straight)', min: 0, max: 180, step: 1 },
  { group: 'City names', key: 'citySpacing', label: 'Letter spacing', min: -2, max: 12, step: 0.25 },
  { group: 'Points number', key: 'numberX', label: 'Position across', min: 0, max: 1000, step: 1 },
  { group: 'Points number', key: 'numberY', label: 'Position down', min: 0, max: 460, step: 1 },
  { group: 'Points number', key: 'numberSize', label: 'Text size', min: 20, max: 200, step: 1 },
  { group: 'Points number', key: 'numberAngle', label: 'Tilt (degrees)', min: -90, max: 90, step: 1 },
];

export function TicketsPage() {
  const [doc, setDoc] = useState<MapDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [via, setVia] = useState('');
  const [to, setTo] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const [deck, setDeck] = useState<'regular' | 'long'>('regular');
  const [style, setStyle] = useState<TicketStyle>({});

  useEffect(() => {
    fetch('/api/editor')
      .then(async (res) => {
        if (!res.ok) throw new Error('The map editor is off. Start the game with "npm run dev" (it turns the editor on).');
        const map = MapSchema.parse(((await res.json()) as { map: unknown }).map);
        setDoc(map);
        setStyle(map.ticketStyle ?? {});
        const sorted = [...map.cities].sort((a, b) => a.name.localeCompare(b.name));
        setFrom(sorted[0]?.id ?? '');
        setTo(sorted[1]?.id ?? '');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const index = useMemo(() => (doc ? indexMap(doc) : null), [doc]);
  const cities = useMemo(() => [...(doc?.cities ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [doc]);
  const distinct = !!from && !!to && from !== to && (!via || (via !== from && via !== to));
  const suggested = index && distinct ? suggestTicketPoints(index, from, to, via || undefined) : null;
  const shownPoints = points ?? suggested ?? 0;
  const name = (id: string) => doc?.cities.find((c) => c.id === id)?.name ?? id;
  const draft: Ticket | null = distinct
    ? { id: [from, via, to].filter(Boolean).join('-'), from, to, points: Math.max(1, shownPoints), deck, ...(via ? { via } : {}) }
    : null;

  const put = async (next: MapDefinition, done: string) => {
    const check = validateMap(next);
    if (!check.ok) return setStatus(`Not saved:\n${check.errors.map((e) => e.message).join('\n')}`);
    const res = await fetch('/api/editor/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (body.ok) {
      setDoc(next);
      setStatus(done);
    } else setStatus(`Not saved:\n${body.error ?? 'unknown error'}`);
  };

  if (error) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>Tickets</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }
  if (!doc) return <main className="center-screen">Loading the map…</main>;

  const exists = draft ? doc.tickets.some((t) => t.id === draft.id) : false;
  const select = (value: string, set: (v: string) => void, optional = false) => (
    <select
      value={value}
      onChange={(e) => {
        set(e.target.value);
        setPoints(null);
      }}
    >
      {optional && <option value="">— none —</option>}
      {cities.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="tickets-page">
      <section className="panel">
        <h1>Make a ticket</h1>
        <label>From {select(from, setFrom)}</label>
        <label>Also through (optional, makes a triple ticket) {select(via, setVia, true)}</label>
        <label>To {select(to, setTo)}</label>
        <label>
          Points {suggested !== null && <span className="muted">(suggested {suggested})</span>}
          <input type="number" min={1} value={shownPoints} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
        <label>
          Deck
          <select value={deck} onChange={(e) => setDeck(e.target.value as 'regular' | 'long')}>
            <option value="regular">Regular</option>
            <option value="long">Long</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={!draft || exists || suggested === null}
          onClick={() => draft && void put({ ...doc, tickets: [...doc.tickets, draft] }, `Added ${draft.id}.`)}
        >
          {exists ? 'This ticket already exists' : 'Add to the map'}
        </button>
        {status && <pre className="editor-status">{status}</pre>}
        <p className="small-print">
          A triple ticket scores when the player's tracks join all three cities, in any order. The map file changes right away; avoid
          editing the map in /editor at the same moment.
        </p>
      </section>

      <section className="panel tickets-tuning">
        <h2>Text on the ticket</h2>
        {['City names', 'Points number'].map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {TUNING.filter((t) => t.group === group).map((t) => {
              const value = resolveTicketStyle(style)[t.key];
              return (
                <label key={t.key} className="tuning-row">
                  <span>{t.label}</span>
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={value}
                    onChange={(e) => setStyle({ ...style, [t.key]: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    step={t.step}
                    value={value}
                    onChange={(e) => e.target.value !== '' && setStyle({ ...style, [t.key]: Number(e.target.value) })}
                  />
                </label>
              );
            })}
          </fieldset>
        ))}
        <div className="row">
          <button
            className="primary"
            disabled={JSON.stringify(style) === JSON.stringify(doc.ticketStyle ?? {})}
            onClick={() => void put({ ...doc, ticketStyle: style }, 'Saved the text layout. Every ticket in the game uses it.')}
          >
            Save layout
          </button>
          <button className="secondary" onClick={() => setStyle({})} title={`Back to the starting values (${DEFAULT_TICKET_STYLE.cityCurve}° curve and so on)`}>
            Reset
          </button>
        </div>
      </section>

      <section className="tickets-preview">
        {draft ? (
          <TicketArt names={ticketCities(draft).map(name)} points={draft.points} long={draft.deck === 'long'} style={style} />
        ) : (
          <p>Pick different cities.</p>
        )}
      </section>

      <section className="tickets-all">
        <h2>All tickets ({doc.tickets.length})</h2>
        <div className="tickets-grid">
          {doc.tickets.map((t) => (
            <div key={t.id} className="tickets-grid-item">
              <button
                className="ticket-card"
                title="Load into the form"
                onClick={() => {
                  setFrom(t.from);
                  setVia(t.via ?? '');
                  setTo(t.to);
                  setPoints(t.points);
                  setDeck(t.deck);
                }}
              >
                <TicketArt names={ticketCities(t).map(name)} points={t.points} long={t.deck === 'long'} style={style} />
              </button>
              <button
                className="secondary small"
                onClick={() => void put({ ...doc, tickets: doc.tickets.filter((x) => x.id !== t.id) }, `Removed ${t.id}.`)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
