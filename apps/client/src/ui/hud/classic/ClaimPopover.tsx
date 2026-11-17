import { useMemo, useState, type ReactNode } from 'react';
import {
  CARD_COLORS,
  LOCOMOTIVE,
  effectiveRoute,
  routePoints,
  routeStatus,
  tunnelExtraOptions,
  type Card,
  type CardColor,
  type CardCounts,
  type GameView,
  type MapIndex,
  type Route,
} from '@rails/shared';
import { sendAction } from '../../../net/socket.js';
import { setUi, useClient } from '../../../state/store.js';
import { CARD_NAMES, NX, S } from '../../strings.js';
import { boardOfView, claimInfo, type Affordances } from '../affordances.js';
import { cardArtUrl } from '../CardChip.js';
import { CardStrip, paymentCards } from './MiniCard.js';

type PayColor = CardColor | typeof LOCOMOTIVE;

/** The color an option pays with (all-locomotive options count as "locomotive"). */
function colorOf(option: CardCounts): PayColor {
  return CARD_COLORS.find((c) => (option[c] ?? 0) > 0) ?? LOCOMOTIVE;
}
const locosOf = (option: CardCounts) => option[LOCOMOTIVE] ?? 0;

/** Payment options grouped by color, each group sorted by how many locomotives it uses. */
function groupOptions(options: CardCounts[]): Map<PayColor, CardCounts[]> {
  const groups = new Map<PayColor, CardCounts[]>();
  for (const o of options) {
    const c = colorOf(o);
    groups.set(c, [...(groups.get(c) ?? []), o]);
  }
  for (const list of groups.values()) list.sort((a, b) => locosOf(a) - locosOf(b));
  return groups;
}

/** How many cards short the viewer is for a route, and with which color they get closest. */
function shortfall(
  route: Route,
  view: GameView,
): { color: CardColor; have: number; missing: number } | null {
  const hand = view.me?.hand;
  if (!hand) return null;
  const colors = route.color === 'gray' ? [...CARD_COLORS] : [route.color];
  const best = colors.reduce((a, c) => (hand[c] > hand[a] ? c : a), colors[0]!);
  const have = Math.min(route.length, hand[best] + hand[LOCOMOTIVE]);
  return { color: best, have, missing: route.length - have };
}

function Shell({
  title,
  medium,
  onClose,
  children,
  stamp,
}: {
  title: string;
  medium?: boolean;
  onClose?: () => void;
  children: ReactNode;
  stamp?: string;
}) {
  return (
    <div className={`nx-pop ${medium ? 'medium' : ''}`} role="dialog" aria-label={title}>
      <header className="nx-pop-title">
        <h2>{title}</h2>
        {onClose && (
          <button className="nx-close" onClick={onClose} aria-label={S.cancel}>
            ✕
          </button>
        )}
      </header>
      {children}
      {stamp && <span className="nx-stamp nx-caps">{stamp}</span>}
    </div>
  );
}

function Facts({ route, points }: { route: Route; points: number }) {
  return (
    <div className="nx-facts">
      <span className="nx-pips" aria-hidden="true">
        {Array.from({ length: route.length }, (_, i) => (
          <span key={i} className={`nx-pip pip-${route.color}`} />
        ))}
      </span>
      <span className="nx-facts-text">
        {NX.spaces(route.length)} · {CARD_NAMES[route.color]}
      </span>
      <span className="nx-points">+{points}</span>
    </div>
  );
}

/**
 * The claim popover. Small (260px) when there is one way to pay, so the cards are already dealt;
 * medium (320px) when the player can change the color (chips) or how many locomotives to use (stepper).
 * A route the player cannot pay for shows the cards they hold, empty slots for the rest, and why.
 */
export function ClaimPopover({
  routeId,
  view,
  map,
  can,
}: {
  routeId: string;
  view: GameView;
  map: MapIndex;
  can: Affordances;
}) {
  const picked = useClient((s) => s.ui.handColor);
  const board = boardOfView(view);
  const route = effectiveRoute(board, map, routeId);
  const info = useMemo(() => (route ? claimInfo(route, view, map) : null), [route, view, map]);
  const groups = useMemo(() => groupOptions(info?.options ?? []), [info]);
  const colors = [...groups.keys()];
  const [color, setColor] = useState<PayColor | null>(() =>
    picked && groups.has(picked) ? picked : (colors[0] ?? null),
  );
  const [locos, setLocos] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (!route || !info) return null;

  const close = () => setUi({ selectedRoute: null });
  const from = map.cities.get(route.from)?.name ?? route.from;
  const to = map.cities.get(route.to)?.name ?? route.to;
  const title = S.claimRoute(from, to);
  const points = routePoints(view.rules, route.length);
  const status = routeStatus(board, map, routeId, view.me?.index ?? null);
  const ferry = route.kind === 'ferry' && view.rules.expansions.ferries;
  const tunnel = route.kind === 'tunnel' && view.rules.expansions.tunnels;
  const badge = ferry ? NX.ferryNeeds(route.ferryLocomotives) : tunnel ? NX.tunnel : null;

  if (status.kind === 'owned') {
    return (
      <Shell title={title} onClose={close}>
        <Facts route={route} points={points} />
        <p className="nx-note quiet">{S.owned(view.players[status.owner]?.name ?? '?')}</p>
      </Shell>
    );
  }

  const reason = can.claim ?? info.reason;
  if (reason) {
    const short = reason === S.noPayment ? shortfall(route, view) : null;
    const held: Card[] = short
      ? [
          ...Array(Math.min(short.have, view.me!.hand[short.color])).fill(short.color),
          ...Array(Math.max(0, short.have - view.me!.hand[short.color])).fill(LOCOMOTIVE),
        ]
      : [];
    return (
      <Shell title={title} onClose={close}>
        <Facts route={route} points={points} />
        {badge && <span className="nx-badge nx-caps">{badge}</span>}
        {short && (
          <div className="nx-strip">
            <span className="nx-caps">{NX.toPay}</span>
            <CardStrip cards={held} missing={short.missing} />
          </div>
        )}
        <p className="nx-note">
          {short ? NX.missing(short.missing, CARD_NAMES[short.color].toLowerCase()) : reason}
        </p>
        <div className="nx-pop-actions">
          <button className="nx-btn" disabled>
            {short ? NX.notEnough : NX.cannotClaim}
          </button>
        </div>
      </Shell>
    );
  }

  const active = color && groups.has(color) ? color : colors[0]!;
  const group = groups.get(active)!;
  const minL = locosOf(group[0]!);
  const maxL = locosOf(group[group.length - 1]!);
  const wantL = locos === null ? minL : Math.min(maxL, Math.max(minL, locos));
  const option = group.find((o) => locosOf(o) === wantL) ?? group[0]!;
  const chips = colors.length > 1;
  const stepper = group.length > 1;
  const medium = chips || stepper;
  const pay = async () => {
    setBusy(true);
    const ok = await sendAction({ type: 'claimRoute', routeId, payment: option });
    setBusy(false);
    if (ok)
      setUi({
        selectedRoute: null,
        handColor: null,
        claimed: tunnel ? null : { routeId, payment: option, at: Date.now() },
      });
  };

  return (
    <Shell title={title} medium={medium} onClose={close}>
      <Facts route={route} points={points} />
      {badge && <span className="nx-badge nx-caps">{badge}</span>}
      {chips && (
        <div className="nx-field">
          <span className="nx-caps">{NX.payWith}</span>
          <div className="nx-chips" role="radiogroup" aria-label={NX.payWith}>
            {colors.map((c) => {
              const most = groups.get(c)!.reduce((n, o) => Math.max(n, o[c] ?? 0), 0);
              return (
                <button
                  key={c}
                  role="radio"
                  aria-checked={c === active}
                  className={`nx-chip ${c === active ? 'on' : ''}`}
                  onClick={() => {
                    setColor(c);
                    setLocos(null);
                  }}
                  title={CARD_NAMES[c]}
                >
                  <img src={cardArtUrl(c)} alt="" draggable={false} />
                  <span>×{c === LOCOMOTIVE ? route.length : most}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {stepper && (
        <div className="nx-stepper">
          <span className="nx-caps">{NX.locomotives}</span>
          <button
            className="nx-step"
            aria-label={NX.removeLoco}
            disabled={wantL <= minL}
            onClick={() => setLocos(wantL - 1)}
          >
            −
          </button>
          <span className="nx-step-value" aria-live="polite">
            {wantL}
          </span>
          <button
            className="nx-step"
            aria-label={NX.addLoco}
            disabled={wantL >= maxL}
            onClick={() => setLocos(wantL + 1)}
          >
            +
          </button>
        </div>
      )}
      <div className="nx-strip">
        <span className="nx-caps">{NX.toPay}</span>
        <CardStrip key={`${active}-${wantL}`} cards={paymentCards(option)} />
      </div>
      <div className="nx-pop-actions">
        <button className="nx-btn dark" disabled={busy} onClick={() => void pay()}>
          {tunnel ? NX.dig : NX.claim(points)}
        </button>
      </div>
    </Shell>
  );
}

/** Step two of a tunnel, in the same popover: the three cards that turned up and what more it costs. */
export function TunnelPopover({ view, map }: { view: GameView; map: MapIndex }) {
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const turn = view.turn;
  if (turn.kind !== 'tunnel') return null;
  const route = map.routes.get(turn.routeId);
  const title = route
    ? S.claimRoute(
        map.cities.get(route.from)?.name ?? route.from,
        map.cities.get(route.to)?.name ?? route.to,
      )
    : turn.routeId;
  const mine = view.me?.index === view.currentPlayer;
  const options = mine && view.me ? tunnelExtraOptions(turn.color, turn.extra, view.me.hand) : [];
  const extra = options[Math.min(pick, options.length - 1)];
  const act = async (action: Parameters<typeof sendAction>[0]) => {
    setBusy(true);
    await sendAction(action);
    setBusy(false);
  };
  return (
    <Shell title={title} medium>
      <span className="nx-badge nx-caps">{NX.tunnel}</span>
      <div className="nx-field">
        <span className="nx-caps nx-alert">{NX.tunnelTurnedUp}</span>
        <CardStrip cards={turn.revealed} />
      </div>
      <div className="nx-strip">
        <span className="nx-caps">{NX.laidDown}</span>
        <CardStrip cards={paymentCards(turn.payment)} />
      </div>
      {!mine ? (
        <p className="nx-note quiet">{NX.digging(view.players[view.currentPlayer]?.name ?? '?')}</p>
      ) : (
        <>
          {extra ? (
            <div className="nx-strip">
              <span className="nx-caps">{NX.moreToPay(turn.extra)}</span>
              {options.length > 1 && (
                <div className="nx-chips small">
                  {options.map((o, i) => (
                    <button
                      key={i}
                      className={`nx-chip ${i === pick ? 'on' : ''}`}
                      onClick={() => setPick(i)}
                      aria-pressed={i === pick}
                    >
                      <img
                        src={cardArtUrl(colorOf(o))}
                        alt={CARD_NAMES[colorOf(o)]}
                        draggable={false}
                      />
                      {locosOf(o) > 0 && colorOf(o) !== LOCOMOTIVE && <span>+{locosOf(o)}★</span>}
                    </button>
                  ))}
                </div>
              )}
              <CardStrip key={pick} cards={paymentCards(extra)} />
            </div>
          ) : (
            <p className="nx-note">{NX.cannotPayExtra}</p>
          )}
          <div className="nx-pop-actions">
            <button
              className="nx-btn outline"
              disabled={busy}
              onClick={() => void act({ type: 'withdrawTunnel' })}
            >
              {NX.giveUp}
            </button>
            {extra && (
              <button
                className="nx-btn dark"
                disabled={busy}
                onClick={() => void act({ type: 'resolveTunnel', extra })}
              >
                {NX.payMore(turn.extra)}
              </button>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

/** After my claim: the popover comes back for a moment with the CLAIMED stamp while the train rolls in. */
export function ClaimedFlash({
  routeId,
  payment,
  view,
  map,
}: {
  routeId: string;
  payment: CardCounts;
  view: GameView;
  map: MapIndex;
}) {
  const route = map.routes.get(routeId);
  if (!route) return null;
  const title = S.claimRoute(
    map.cities.get(route.from)?.name ?? route.from,
    map.cities.get(route.to)?.name ?? route.to,
  );
  const points = routePoints(view.rules, route.length);
  return (
    <div className="nx-flash">
      <Shell title={title} stamp={NX.claimed}>
        <Facts route={route} points={points} />
        <div className="nx-strip">
          <span className="nx-caps">{NX.toPay}</span>
          <CardStrip cards={paymentCards(payment)} />
        </div>
        <div className="nx-pop-actions">
          <button className="nx-btn dark" disabled>
            {NX.claimedPoints(points)}
          </button>
        </div>
      </Shell>
    </div>
  );
}
