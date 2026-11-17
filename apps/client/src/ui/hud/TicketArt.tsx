import { useEffect, useState } from 'react';
import '@fontsource/cardo/400.css';
import '@fontsource/cardo/700.css';

/** A ticket's own picture (from the Canva ticket designs, made web-sized by tools/assets/prepare-tickets.py). */
export function ticketPictureUrl(ticketId: string): string {
  return `/art/tickets/${ticketId}.webp`;
}

// Which tickets have their own picture; asked once per page.
let pictures: Promise<Set<string>> | null = null;
function loadTicketPictures(): Promise<Set<string>> {
  pictures ??= fetch('/api/art')
    .then((res) => (res.ok ? (res.json() as Promise<{ tickets?: string[] }>) : ({} as { tickets?: string[] })))
    .catch(() => ({}) as { tickets?: string[] })
    .then((art) => new Set(art.tickets ?? []));
  return pictures;
}

/** Ticket ids that have a picture; null until the server answers. */
function useTicketPictures(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTicketPictures().then((s) => alive && setIds(s));
    return () => {
      alive = false;
    };
  }, []);
  return ids;
}

export interface TicketArtProps {
  /** City names in order: two for a normal ticket, three for a triple ticket. */
  names: string[];
  points: number;
  long?: boolean;
  done?: boolean;
  className?: string;
  /** The ticket's id: its picture is assets/web/tickets/<id>.webp. */
  ticketId?: string;
}

/**
 * A ticket as players see it: its own picture from the Canva designs, with a done mark when
 * completed. A ticket that has no picture yet (one just made in the /tickets page) shows as a
 * plain card with its cities and points until its picture is added.
 */
export function TicketArt({ names, points, long, done, className, ticketId }: TicketArtProps) {
  const pictures = useTicketPictures();
  const [broken, setBroken] = useState(false);
  const label = `${names.join(' to ')}, ${points} points`;
  const classes = `ticket-art ${long ? 'long' : ''} ${done ? 'done' : ''} ${className ?? ''}`;
  const pictured = !!ticketId && !broken && !!pictures?.has(ticketId);
  return (
    <span className={`${classes} ${pictured ? 'ticket-picture' : 'ticket-plain'}`} role="img" aria-label={label}>
      {pictured ? (
        <img src={ticketPictureUrl(ticketId)} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <>
          <span className="ticket-plain-points">{points}</span>
          <span className="ticket-plain-cities">
            {names.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </>
      )}
      {done && <span className="ticket-done">✓ DONE</span>}
    </span>
  );
}
