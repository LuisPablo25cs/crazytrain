import { useSyncExternalStore } from 'react';
import { yearOf, monthOfYear, type CardCounts, type Card, type GameEvent, type MapIndex } from '@rails/shared';
import { en, type Dict } from './i18n/en.js';
import { es } from './i18n/es.js';

/**
 * Every player-facing string, in English (i18n/en.ts) and Spanish (i18n/es.ts). The exports below are
 * live bindings: changing the language swaps them, and `useLang` re-renders the screens that read them.
 */
export const LANGS = { en: 'English', es: 'Español' } as const;
export type Lang = keyof typeof LANGS;
const DICTS: Record<Lang, Dict> = { en, es };
const KEY = 'rails.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Storage can be blocked; fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export let lang: Lang = initialLang();
export let T: Dict = DICTS[lang];
export let S = T.S;
export let NX = T.NX;
export let CARD_NAMES = T.cards;
export let CARD_LETTERS = T.letters;
export let HAZARD_NAMES = T.hazards;
export let HAZARD_EFFECTS = T.hazardEffects;
export let MODE_NAMES = T.modes;
export let MODE_BLURBS = T.modeBlurbs;

const listeners = new Set<() => void>();

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  T = DICTS[next];
  S = T.S;
  NX = T.NX;
  CARD_NAMES = T.cards;
  CARD_LETTERS = T.letters;
  HAZARD_NAMES = T.hazards;
  HAZARD_EFFECTS = T.hazardEffects;
  MODE_NAMES = T.modes;
  MODE_BLURBS = T.modeBlurbs;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // The choice still holds for this visit.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const l of listeners) l();
}

/** The current language; a component that calls this re-renders (with its children) when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
    () => lang,
  );
}

if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** A message from the server or the rules engine (written in English), in the current language. */
export function tr(message: string): string {
  for (const [pattern, render] of T.messages) {
    const m = pattern.exec(message);
    if (m) return render(...m.slice(1));
  }
  return message;
}

/** Display name of a player color ("red" → "Rojo"). */
export function colorName(id: string): string {
  return T.playerColors[id] ?? id;
}

/** "March, year 2" / "Marzo, año 2" */
export function monthLabel(month: number): string {
  return T.monthLabel(T.months[monthOfYear(month)]!, yearOf(month));
}

export function describeCards(cards: CardCounts): string {
  return Object.entries(cards)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([c, n]) => `${n} ${CARD_NAMES[c as Card].toLowerCase()}`)
    .join(' + ');
}

/** Plain-language event log line, or null for events not worth logging. */
export function describeEvent(e: GameEvent, names: string[], map: MapIndex | null): string | null {
  const E = T.events;
  const who = (i: number) => names[i] ?? E.player(i + 1);
  const routeName = (id: string) => {
    const r = map?.routes.get(id);
    if (!r) return id;
    return `${map!.cities.get(r.from)?.name ?? r.from} – ${map!.cities.get(r.to)?.name ?? r.to}`;
  };
  const cityName = (id: string) => map?.cities.get(id)?.name ?? id;
  switch (e.type) {
    case 'drewBlind':
      return e.secret ? E.drewBlindCard(who(e.player), e.secret.card) : E.drewBlind(who(e.player));
    case 'drewFaceUp':
      return E.drewFaceUp(who(e.player), e.card);
    case 'marketReset':
      return E.marketReset;
    case 'claimedRoute':
      return E.claimedRoute(who(e.player), routeName(e.routeId));
    case 'tunnelRevealed':
      return E.tunnelRevealed(who(e.player), routeName(e.routeId), e.extra);
    case 'tunnelWithdrawn':
      return E.tunnelWithdrawn(who(e.player));
    case 'drewTickets':
      return E.drewTickets(who(e.player), e.count);
    case 'keptTickets':
      return E.keptTickets(who(e.player), e.count);
    case 'builtStation':
      return E.builtStation(who(e.player), cityName(e.cityId));
    case 'passed':
      return E.passed(who(e.player));
    case 'skipped':
      return E.skipped(who(e.player));
    case 'lastRoundStarted':
      return E.lastRoundStarted(who(e.player));
    case 'gameFinished':
      return E.gameFinished;
    case 'deckReshuffled':
      return E.deckReshuffled;
    case 'turnStarted':
      return null;
    case 'monthStarted':
      return `— ${monthLabel(e.month)} —`;
    case 'disaster':
      return E.disaster(HAZARD_NAMES[e.kind], cityName(e.cityId), e.damaged.length + e.lost.length + e.blocked.length);
    case 'damageSpread':
      return E.damageSpread(who(e.player), routeName(e.routeId), e.broken);
    case 'routeRepaired':
      return e.claimed ? E.repairedClaimed(who(e.player), routeName(e.routeId)) : E.repaired(who(e.player), routeName(e.routeId));
    case 'routeLost':
      return E.lost(who(e.player), routeName(e.routeId), e.reason, e.claimable);
    case 'routeGrayed':
      return E.grayed(routeName(e.routeId));
  }
}
