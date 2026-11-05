import { useEffect, useRef, useState } from 'react';
import type { GameView, MapIndex } from '@rails/shared';
import { useClient } from '../../state/store.js';
import { describeEvent, S } from '../strings.js';

/** Recent actions in plain language: the durable record of what happened on other turns. */
export function EventLog({ view, map }: { view: GameView; map: MapIndex }) {
  const log = useClient((s) => s.log);
  const [open, setOpen] = useState(true);
  const end = useRef<HTMLLIElement>(null);
  const names = view.players.map((p) => p.name);
  const lines = log
    .map((entry) => ({ id: entry.id, text: describeEvent(entry.event, names, map) }))
    .filter((l): l is { id: number; text: string } => l.text !== null)
    .slice(-40);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  return (
    <section className="event-log panel" aria-label={S.log}>
      <h2>
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} {S.log}
        </button>
      </h2>
      {open && (
        <ol>
          {lines.map((l, i) => (
            <li key={l.id} ref={i === lines.length - 1 ? end : undefined}>
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
