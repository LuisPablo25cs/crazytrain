import { useEffect, useSyncExternalStore } from 'react';
import { ticketCities, type GameView, type MapIndex } from '@rails/shared';
import { camera } from '../../../board/cameraControl.js';
import { leaveRoom } from '../../../net/socket.js';
import { setUi } from '../../../state/store.js';
import { NX, T } from '../../strings.js';
import { LanguagePicker } from '../../lobby/LanguagePicker.js';
import { ticketProgress } from '../affordances.js';
import { CitySearch } from '../CitySearch.js';
import { EventLog } from '../EventLog.js';
import { TicketArt } from '../TicketArt.js';
import { focusCities } from '../Tickets.js';

/** Screens this small get the phone layout (a phone held sideways is about 844 × 390). */
export const PHONE_QUERY = '(max-width: 900px), (max-height: 500px)';
/** A touch phone held upright: the game asks to be turned sideways. */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px) and (pointer: coarse)';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export const usePhone = () => useMedia(PHONE_QUERY);
export const usePortraitPhone = () => useMedia(PORTRAIT_QUERY);

/** Ask the browser to keep the game sideways. Only works in full screen (Android); fails quietly elsewhere. */
export function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o?.lock?.('landscape').catch(() => {});
}

/** Whether the game fills the screen (no browser bars). */
export function useFullScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    },
    () => !!document.fullscreenElement,
    () => false,
  );
}

export async function fullScreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    lockLandscape();
  } catch {
    // Not every phone allows full screen (iPhone Safari); the game still works without it.
  }
}

/** Covers the game while a phone is held upright. */
export function RotatePrompt() {
  const portrait = usePortraitPhone();
  useEffect(() => {
    if (!portrait) lockLandscape();
  }, [portrait]);
  if (!portrait) return null;
  const P = T.phone;
  return (
    <div className="nx-rotate" role="alertdialog" aria-label={P.rotateTitle}>
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <rect className="nx-rotate-phone" x="30" y="14" width="36" height="68" rx="6" />
        <path className="nx-rotate-arrow" d="M80 40a32 32 0 0 0-22-26M80 40l-8-4M80 40l2-9" />
      </svg>
      <h2>{P.rotateTitle}</h2>
      <p>{P.rotateText}</p>
    </div>
  );
}

export type PhoneSheet = 'market' | 'tickets' | 'log' | 'menu' | null;

/** The phone menu: city search, fit map, game log, language, full screen, leave. */
export function PhoneMenu({
  map,
  onSheet,
  onLeave,
}: {
  map: MapIndex;
  onSheet: (s: PhoneSheet) => void;
  onLeave: () => void;
}) {
  const P = T.phone;
  return (
    <div className="nx-phone-menu" role="menu" aria-label={P.menu}>
      <CitySearch map={map} />
      <button
        role="menuitem"
        onClick={() => {
          camera.fit();
          onSheet(null);
        }}
      >
        {P.fitMap}
      </button>
      <button role="menuitem" onClick={() => onSheet('log')}>
        {P.log}
      </button>
      {document.fullscreenEnabled && (
        <button
          role="menuitem"
          onClick={() => {
            void fullScreen();
            onSheet(null);
          }}
        >
          {P.fullscreen}
        </button>
      )}
      <LanguagePicker />
      <button role="menuitem" className="danger" onClick={() => void leaveRoom().then(onLeave)}>
        {T.S.leave}
      </button>
    </div>
  );
}

/** My tickets as a scrolling list in a side sheet. Tapping one shows its cities on the map. */
export function PhoneTickets({ view, map, onDone }: { view: GameView; map: MapIndex; onDone: () => void }) {
  const me = view.me;
  if (!me) return null;
  const progress = ticketProgress(view, map);
  if (me.tickets.length === 0) return <p className="nx-sheet-empty">{NX.noTickets}</p>;
  return (
    <ul className="nx-phone-tickets">
      {me.tickets.map((id) => {
        const t = map.tickets.get(id);
        if (!t) return null;
        const names = ticketCities(t).map((c) => map.cities.get(c)?.name ?? c);
        return (
          <li key={id}>
            <button
              aria-label={`${NX.ticketLabel(names, t.points)}${progress.get(id) ? `, ${NX.complete}` : ''}`}
              onClick={() => {
                focusCities(id, map);
                onDone();
              }}
            >
              <TicketArt ticketId={t.id} names={names} points={t.points} long={t.deck === 'long'} done={progress.get(id)} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The game log, unfolded, inside a sheet. */
export function PhoneLog({ view, map }: { view: GameView; map: MapIndex }) {
  return <EventLog view={view} map={map} defaultOpen />;
}

/** Clear map highlights when a sheet that set them closes. */
export const clearHighlights = () => setUi({ highlightCities: [] });
