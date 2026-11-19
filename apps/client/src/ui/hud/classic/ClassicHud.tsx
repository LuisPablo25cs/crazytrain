import { useEffect, useState } from 'react';
import {
  nextStationCost,
  type GameView,
  type MapIndex,
  type RoomView,
  type Theme,
} from '@rails/shared';
import { leaveRoom, sendAction } from '../../../net/socket.js';
import { setUi, useClient } from '../../../state/store.js';
import { LanguagePicker } from '../../lobby/LanguagePicker.js';
import { ThemePicker } from '../../lobby/ThemePicker.js';
import { NX, S, T } from '../../strings.js';
import type { Affordances } from '../affordances.js';
import { CitySearch } from '../CitySearch.js';
import { EventLog } from '../EventLog.js';
import { ActivityFeed } from './ActivityFeed.js';
import { ClaimedFlash } from './ClaimPopover.js';
import { FirstTimeHints } from './FirstTimeHints.js';
import { HandFan } from './HandFan.js';
import { MarketBlock } from './MarketBlock.js';
import { PlayerPlaques } from './PlayerPlaques.js';
import { RouteTooltip } from './RouteTooltip.js';
import { RulesSheet } from './RulesSheet.js';
import { TicketFan } from './TicketFan.js';
import { ZoomControl } from './ZoomControl.js';
import { PhoneLog, PhoneMenu, PhoneTickets, clearHighlights, usePhone, type PhoneSheet } from './phone.js';
import './fonts.js';

/** How long my CLAIMED popover stays while the train rolls in. */
const FLASH_MS = 1400;

interface ClassicHudProps {
  view: GameView;
  room: RoomView;
  map: { doc: { width: number; height: number }; index: MapIndex };
  theme: Theme;
  can: Affordances;
  onLeave: () => void;
}

/**
 * Classic mode HUD in the Night Express style. The board fills the window; HUD plates sit on its edges:
 * header plaque (top center), player plaques (top left), market and log (top right), ticket fan
 * (bottom left), hand fan (bottom center), actions (bottom right).
 */
export function ClassicHud({ view, room, map, theme, can, onLeave }: ClassicHudProps) {
  const ui = useClient((s) => s.ui);
  const claimed = ui.claimed;
  const me = view.me;

  useEffect(() => {
    if (!claimed) return;
    const t = setTimeout(
      () => setUi({ claimed: null }),
      Math.max(0, claimed.at + FLASH_MS - Date.now()),
    );
    return () => clearTimeout(t);
  }, [claimed]);

  const playing = me && view.phase !== 'finished';
  const myTurnStart = can.isMyTurn && view.turn.kind === 'await';
  const stationCost = me ? nextStationCost(view, view.players[me.index]!) : null;
  const phone = usePhone();
  const [sheet, setSheetState] = useState<PhoneSheet>(null);
  const setSheet = (next: PhoneSheet) => {
    if (sheet === 'tickets' && next !== 'tickets') clearHighlights();
    setSheetState(next);
  };
  // A new turn closes the market; picking a route closes any sheet so the claim card shows.
  useEffect(() => setSheetState((s) => (s === 'market' ? null : s)), [view.turnNumber]);
  useEffect(() => {
    if (ui.selectedRoute) setSheetState(null);
  }, [ui.selectedRoute]);
  useEffect(() => {
    if (!phone) setSheetState(null);
  }, [phone]);

  const stationButton = view.rules.expansions.stations && (
    <button
      className="nx-btn outline light"
      disabled={!myTurnStart || can.station !== null}
      title={can.station ?? (stationCost !== null ? S.stationCost(stationCost) : undefined)}
      onClick={() =>
        setUi(
          ui.mode.kind === 'station'
            ? { mode: { kind: 'normal' }, selectedCity: null }
            : { mode: { kind: 'station' }, selectedRoute: null },
        )
      }
    >
      {ui.mode.kind === 'station' ? S.cancel : `${S.buildStation}${stationCost !== null ? ` · ${stationCost}` : ''}`}
    </button>
  );
  const passButton = can.pass === null && (
    <button className="nx-btn outline light" onClick={() => void sendAction({ type: 'pass' })}>
      {S.pass}
    </button>
  );
  const drawTicketsButton = (
    <button
      className="nx-btn primary"
      disabled={can.drawTickets !== null}
      title={can.drawTickets ?? undefined}
      onClick={() => {
        setSheet(null);
        void sendAction({ type: 'drawTickets' });
      }}
    >
      {NX.drawTickets(view.ticketDeckCount)}
    </button>
  );
  const P = T.phone;

  if (phone) {
    const sheetTitle =
      sheet === 'market' ? P.market : sheet === 'tickets' ? P.tickets : sheet === 'log' ? P.log : '';
    return (
      <>
        <header className="nx-header">
          <div className="nx-header-text" role="status">
            <p className={view.lastRound ? 'last-round' : ''}>{can.banner}</p>
          </div>
          <button
            className={`nx-rules-btn ${ui.rulesTab ? 'on' : ''}`}
            aria-label={T.rulesPanel.open}
            aria-expanded={ui.rulesTab !== null}
            onClick={() => setUi({ rulesTab: ui.rulesTab ? null : 'turn' })}
          >
            ?
          </button>
          <button
            className={`nx-rules-btn nx-menu-btn ${sheet === 'menu' ? 'on' : ''}`}
            aria-label={P.menu}
            aria-expanded={sheet === 'menu'}
            onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 5h12M3 9h12M3 13h12" />
            </svg>
          </button>
        </header>
        {sheet === 'menu' && <PhoneMenu map={map.index} onSheet={setSheet} onLeave={onLeave} />}
        <ActivityFeed view={view} map={map.index} theme={theme} />

        <aside className="nx-left">
          <PlayerPlaques view={view} room={room} theme={theme} phone />
        </aside>

        <nav className="nx-rail" aria-label={S.market}>
          <button
            className={`nx-rail-btn ${sheet === 'market' ? 'on' : ''}`}
            aria-expanded={sheet === 'market'}
            onClick={() => setSheet(sheet === 'market' ? null : 'market')}
          >
            {P.market}
            <span>{view.market.filter(Boolean).length}</span>
          </button>
          {me && (
            <button
              className={`nx-rail-btn ${sheet === 'tickets' ? 'on' : ''}`}
              aria-expanded={sheet === 'tickets'}
              onClick={() => setSheet(sheet === 'tickets' ? null : 'tickets')}
            >
              {P.tickets}
              <span>{me.tickets.length}</span>
            </button>
          )}
          {playing && view.rules.expansions.stations && (
            <button
              className={`nx-rail-btn ${ui.mode.kind === 'station' ? 'on' : ''}`}
              disabled={ui.mode.kind !== 'station' && (!myTurnStart || can.station !== null)}
              title={can.station ?? undefined}
              onClick={() =>
                setUi(
                  ui.mode.kind === 'station'
                    ? { mode: { kind: 'normal' }, selectedCity: null }
                    : { mode: { kind: 'station' }, selectedRoute: null },
                )
              }
            >
              {ui.mode.kind === 'station' ? S.cancel : P.station}
              {ui.mode.kind !== 'station' && stationCost !== null && <span>{stationCost}</span>}
            </button>
          )}
          {playing && can.pass === null && (
            <button className="nx-rail-btn" onClick={() => void sendAction({ type: 'pass' })}>
              {S.pass}
            </button>
          )}
          <ZoomControl />
        </nav>

        {playing && (
          <>
            <div className="nx-bottom-center">
              <HandFan hand={me.hand} flat />
            </div>
            {ui.mode.kind === 'station' && <p className="nx-hint nx-phone-hint">{S.stationPick}</p>}
          </>
        )}

        {sheet && sheet !== 'menu' && (
          <>
            <div className="nx-sheet-scrim" aria-hidden="true" onClick={() => setSheet(null)} />
            <section className={`nx-sheet ${sheet === 'tickets' ? 'left' : 'right'}`} role="dialog" aria-label={sheetTitle}>
              <header>
                <h2 className="nx-caps">{sheetTitle}</h2>
                <button className="nx-square" aria-label={P.close} onClick={() => setSheet(null)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M3 3l8 8M11 3l-8 8" />
                  </svg>
                </button>
              </header>
              {sheet === 'market' && (
                <>
                  <MarketBlock view={view} can={can} />
                  {playing && drawTicketsButton}
                </>
              )}
              {sheet === 'tickets' && <PhoneTickets view={view} map={map.index} onDone={() => setSheetState(null)} />}
              {sheet === 'log' && <PhoneLog view={view} map={map.index} />}
            </section>
          </>
        )}

        <RulesSheet view={view} map={map.index} />
        {claimed && (
          <ClaimedFlash
            key={claimed.at}
            routeId={claimed.routeId}
            payment={claimed.payment}
            view={view}
            map={map.index}
          />
        )}
      </>
    );
  }

  return (
    <>
      <header className="nx-header">
        <div className="nx-header-text" role="status">
          <h1>{NX.title}</h1>
          <p className={view.lastRound ? 'last-round' : ''}>{can.banner}</p>
        </div>
        <button
          className={`nx-rules-btn ${ui.rulesTab ? 'on' : ''}`}
          aria-label={T.rulesPanel.open}
          aria-expanded={ui.rulesTab !== null}
          title={T.rulesPanel.open}
          onClick={() => setUi({ rulesTab: ui.rulesTab ? null : 'turn' })}
        >
          ?
        </button>
      </header>
      <ActivityFeed view={view} map={map.index} theme={theme} />

      <aside className="nx-left">
        <PlayerPlaques view={view} room={room} theme={theme} />
      </aside>

      <aside className="nx-right">
        <div className="nx-tools">
          <CitySearch map={map.index} />
          <ThemePicker />
          <LanguagePicker />
          <button className="nx-tool" onClick={() => void leaveRoom().then(onLeave)}>
            {S.leave}
          </button>
        </div>
        <MarketBlock view={view} can={can} />
        {/* Rival moves now show as toasts; the log stays as history, folded until opened. */}
        <EventLog view={view} map={map.index} defaultOpen={false} />
      </aside>

      {playing && (
        <>
          <div className="nx-bottom-left">
            <TicketFan view={view} map={map.index} />
          </div>
          <div className="nx-bottom-center">
            <HandFan hand={me.hand} />
          </div>
          <div className="nx-actions">
            {ui.mode.kind === 'station' && <p className="nx-hint">{S.stationPick}</p>}
            {passButton}
            {stationButton}
            {drawTicketsButton}
          </div>
        </>
      )}

      <ZoomControl />
      <RouteTooltip view={view} map={map.index} />
      <FirstTimeHints
        view={view}
        map={map.index}
        hidden={ui.rulesTab !== null || (me?.offeredTickets.length ?? 0) > 0}
      />
      <RulesSheet view={view} map={map.index} />

      {claimed && (
        <ClaimedFlash
          key={claimed.at}
          routeId={claimed.routeId}
          payment={claimed.payment}
          view={view}
          map={map.index}
        />
      )}
    </>
  );
}
