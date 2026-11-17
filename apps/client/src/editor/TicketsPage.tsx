import { useEffect, useMemo, useState } from 'react';
import { indexMap, MapSchema, suggestTicketPoints, ticketCities, validateMap, type MapDefinition, type Ticket } from '@rails/shared';
import { TicketArt } from '../ui/hud/TicketArt.js';

/**
 * Hidden page (/tickets, only while the editor is on): pick two cities, or three for a triple
 * ticket, and add it to the map file; and see every ticket as players will. A new ticket shows as a
 * plain card until its picture is made in Canva and added with tools/assets/prepare-tickets.py.
 */
export function TicketsPage() {
  const [doc, setDoc] = useState<MapDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [via, setVia] = useState('');
  const [to, setTo] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const [deck, setDeck] = useState<'regular' | 'long'>('regular');

  useEffect(() => {
    fetch('/api/editor')
      .then(async (res) => {
        if (!res.ok) throw new Error('The map editor is off. Start the game with "npm run dev" (it turns the editor on).');
        const map = MapSchema.parse(((await res.json()) as { map: unknown }).map);
        setDoc(map);
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
          editing the map in /editor at the same moment. A new ticket shows as a plain card until its picture is added (see
          assets/tickets/tickets.json and tools/assets/prepare-tickets.py).
        </p>
      </section>

      <section className="tickets-preview">
        {draft ? (
          <TicketArt names={ticketCities(draft).map(name)} points={draft.points} long={draft.deck === 'long'} />
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
                <TicketArt ticketId={t.id} names={ticketCities(t).map(name)} points={t.points} long={t.deck === 'long'} />
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
