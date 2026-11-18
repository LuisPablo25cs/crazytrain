import { useEffect } from 'react';
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
            {can.pass === null && (
              <button
                className="nx-btn outline light"
                onClick={() => void sendAction({ type: 'pass' })}
              >
                {S.pass}
              </button>
            )}
            {view.rules.expansions.stations && (
              <button
                className="nx-btn outline light"
                disabled={!myTurnStart || can.station !== null}
                title={
                  can.station ?? (stationCost !== null ? S.stationCost(stationCost) : undefined)
                }
                onClick={() =>
                  setUi(
                    ui.mode.kind === 'station'
                      ? { mode: { kind: 'normal' }, selectedCity: null }
                      : { mode: { kind: 'station' }, selectedRoute: null },
                  )
                }
              >
                {ui.mode.kind === 'station'
                  ? S.cancel
                  : `${S.buildStation}${stationCost !== null ? ` · ${stationCost}` : ''}`}
              </button>
            )}
            <button
              className="nx-btn primary"
              disabled={can.drawTickets !== null}
              title={can.drawTickets ?? undefined}
              onClick={() => void sendAction({ type: 'drawTickets' })}
            >
              {NX.drawTickets(view.ticketDeckCount)}
            </button>
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
