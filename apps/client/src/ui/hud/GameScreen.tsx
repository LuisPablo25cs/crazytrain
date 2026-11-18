import { useEffect, useMemo, useState } from 'react';
import { BoardScene } from '../../board/BoardScene.js';
import { resetViewFocus } from '../../board/CameraRig.js';
import { leaveRoom, sendAction } from '../../net/socket.js';
import { setUi, store, useClient } from '../../state/store.js';
import { useTheme } from '../../theme/ThemeProvider.js';
import { S, useLang } from '../strings.js';
import { LanguagePicker } from '../lobby/LanguagePicker.js';
import { ThemePicker } from '../lobby/ThemePicker.js';
import { affordances, boardOfView, stationCandidates } from './affordances.js';
import { CitySearch } from './CitySearch.js';
import { ClaimDialog } from './ClaimDialog.js';
import { EndScreen } from './EndScreen.js';
import { EventLog } from './EventLog.js';
import { Hand } from './Hand.js';
import { Market } from './Market.js';
import { Scoreboard } from './Scoreboard.js';
import { StationDialog } from './StationMode.js';
import { TicketChoice } from './TicketChoice.js';
import { TicketCards } from './Tickets.js';
import { TunnelPrompt } from './TunnelPrompt.js';
import { DisasterCard, SeasonClock } from './Seasons.js';
import { TurnBanner } from './TurnBanner.js';
import { nextStationCost } from '@rails/shared';
import { ClassicHud } from './classic/ClassicHud.js';
import { ClaimPopover, TunnelPopover } from './classic/ClaimPopover.js';

/**
 * In-game layout: the board fills the window; the HUD sits on top in fixed regions.
 * Top: turn banner, city search, view and theme controls. Left: players. Right: tickets and log.
 * Bottom: hand, market and actions. Dialogs float above.
 */
export function GameScreen({ onLeave }: { onLeave: () => void }) {
  const room = useClient((s) => s.room)!;
  const map = useClient((s) => s.map);
  const game = useClient((s) => s.game);
  const ui = useClient((s) => s.ui);
  const lastEvents = useClient((s) => s.lastEvents);
  const { theme } = useTheme();
  const [trail, setTrail] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUi({ selectedRoute: null, selectedCity: null, mode: { kind: 'normal' } });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const view = game?.view;
  // The affordances hold sentences, so they are rebuilt when the language changes.
  const lang = useLang();
  const can = useMemo(() => (view && map ? affordances(view, map.index) : null), [view, map, lang]);
  const stationCities = useMemo(
    () => (view && map && ui.mode.kind === 'station' ? new Set(stationCandidates(view, map.index)) : null),
    [view, map, ui.mode],
  );
  const highlighted = useMemo(() => stationCities ?? new Set(ui.highlightCities), [stationCities, ui.highlightCities]);

  if (!map || !view || !can) {
    return <main className="center-screen">{S.connecting}</main>;
  }
  const me = view.me;
  const myTurnStart = can.isMyTurn && view.turn.kind === 'await';
  const stationCost = me ? nextStationCost(view, view.players[me.index]!) : null;
  const choosingInitial = view.phase === 'initialTickets' && me && !view.players[me.index]!.keptInitial;
  const choosingDrawn = view.turn.kind === 'choosingTickets' && can.isMyTurn;
  // Classic mode uses the Night Express HUD; Seasons keeps its own.
  const classic = view.rules.mode !== 'seasons';

  return (
    <div className={`game ${classic ? 'classic-ui' : me && view.phase !== 'finished' ? 'has-dock' : ''}`}>
      <BoardScene
        map={map.index}
        theme={theme}
        board={boardOfView(view)}
        viewer={me?.index ?? null}
        playerColors={view.players.map((p) => p.color)}
        stations={view.stations}
        lastEvents={lastEvents}
        hoveredRoute={ui.hoveredRoute}
        selectedRoute={ui.selectedRoute}
        highlightedCities={highlighted}
        highlightedRoutes={trail}
        selectedCity={ui.selectedCity}
        focus={ui.focus}
        onHoverRoute={(id) => setUi({ hoveredRoute: id })}
        onSelectRoute={(id) => ui.mode.kind === 'normal' && setUi({ selectedRoute: id })}
        onCityClick={ui.mode.kind === 'station' ? (id) => setUi({ selectedCity: id }) : undefined}
        onBackgroundClick={() => ui.selectedRoute && setUi({ selectedRoute: null })}
        focusPlayer={classic ? ui.focusPlayer : null}
      />

      {classic ? (
        <ClassicHud view={view} room={room} map={map} theme={theme} can={can} onLeave={onLeave} />
      ) : (
        <>
          <header className="hud-top">
            <TurnBanner view={view} can={can} theme={theme} />
            <SeasonClock view={view} />
            <CitySearch map={map.index} />
            <button
              className="secondary small"
              onClick={() => setUi({ focus: resetViewFocus(map.doc.width, map.doc.height, (store.getState().ui.focus?.nonce ?? 0) + 1) })}
            >
              {S.resetView}
            </button>
            <ThemePicker />
            <LanguagePicker />
            <button className="secondary small" onClick={() => void leaveRoom().then(onLeave)}>
              {S.leave}
            </button>
          </header>

          <aside className="hud-left">
            <Scoreboard view={view} room={room} theme={theme} />
          </aside>

          <aside className="hud-right">
            <EventLog view={view} map={map.index} />
          </aside>

          {me && view.phase !== 'finished' && (
            <footer className="hud-bottom">
              <TicketCards view={view} map={map.index} />
              <Hand hand={me.hand} excavators={view.rules.mode === 'seasons'} />
              <Market view={view} can={can} />
              <div className="actions">
                {view.rules.expansions.stations && (
                  <button
                    className={ui.mode.kind === 'station' ? 'primary' : 'secondary'}
                    disabled={!myTurnStart || can.station !== null}
                    title={can.station ?? (stationCost !== null ? S.stationCost(stationCost) : undefined)}
                    onClick={() =>
                      setUi(ui.mode.kind === 'station' ? { mode: { kind: 'normal' }, selectedCity: null } : { mode: { kind: 'station' }, selectedRoute: null })
                    }
                  >
                    {ui.mode.kind === 'station' ? S.cancel : S.buildStation}
                    {stationCost !== null && ui.mode.kind !== 'station' && <span className="muted"> ({stationCost})</span>}
                  </button>
                )}
                {can.pass === null && (
                  <button className="secondary" onClick={() => void sendAction({ type: 'pass' })}>
                    {S.pass}
                  </button>
                )}
                {ui.mode.kind === 'station' && <p className="hint">{S.stationPick}</p>}
              </div>
            </footer>
          )}
        </>
      )}

      {ui.selectedRoute &&
        view.phase === 'playing' &&
        ui.mode.kind === 'normal' &&
        !(classic && view.turn.kind === 'tunnel') &&
        (classic ? (
          <ClaimPopover key={ui.selectedRoute} routeId={ui.selectedRoute} view={view} map={map.index} can={can} />
        ) : (
          <ClaimDialog routeId={ui.selectedRoute} view={view} map={map.index} can={can} />
        ))}
      {(choosingInitial || choosingDrawn) && <TicketChoice key={`${view.turnNumber}-${me?.offeredTickets.join()}`} view={view} map={map.index} classic={classic} />}
      {view.turn.kind === 'tunnel' &&
        (classic ? <TunnelPopover view={view} map={map.index} /> : <TunnelPrompt view={view} map={map.index} />)}
      {ui.mode.kind === 'station' && ui.selectedCity && myTurnStart && (
        <StationDialog key={ui.selectedCity} cityId={ui.selectedCity} view={view} map={map.index} />
      )}
      <DisasterCard events={lastEvents} map={map.index} />
      {view.phase === 'finished' && (
        <EndScreen view={view} map={map.index} room={room} theme={theme} onHighlight={setTrail} onLeave={onLeave} />
      )}
    </div>
  );
}
