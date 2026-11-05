import type { Card, CardCounts, GameEvent, MapIndex } from '@rails/shared';

/** Every user-facing string lives here so the UI can be translated later. */
export const S = {
  appName: 'Rails',
  tagline: 'Build railways across North America with your friends.',
  yourName: 'Your nickname',
  createRoom: 'Create a room',
  joinRoom: 'Join',
  roomCode: 'Room code',
  joinTitle: 'Join room',
  connecting: 'Connecting…',
  reconnecting: 'Connection lost. Reconnecting…',
  lobby: 'Lobby',
  shareLink: 'Share this link with your friends',
  copy: 'Copy',
  copied: 'Copied!',
  players: 'Players',
  host: 'host',
  you: 'you',
  away: 'away',
  remove: 'Remove',
  color: 'Color',
  rules: 'Expansion rules',
  ruleNames: {
    tunnels: 'Tunnels',
    ferries: 'Ferries',
    stations: 'Stations',
    longTickets: 'Long tickets',
  },
  ruleHelp: {
    tunnels: 'Claiming reveals 3 cards; matches cost extra.',
    ferries: 'Ferry routes need locomotives.',
    stations: 'Borrow one rival route per station for tickets.',
    longTickets: 'Each player gets one long ticket at the start.',
  },
  map: 'Map',
  starterMap: 'Use the starter map',
  uploadMap: 'Upload a map file…',
  customMap: 'custom',
  start: 'Start game',
  waitingForHost: 'Waiting for the host to start…',
  needPlayers: (min: number, max: number) => `${min} to ${max} players`,
  leave: 'Leave room',
  kickedTitle: 'You left the room',
  backHome: 'Back to start',
  theme: 'Theme',
  // Game
  yourTurn: 'Your turn',
  turnOf: (name: string) => `${name}'s turn`,
  lastRound: 'Last round!',
  drawPile: 'Draw pile',
  drawSecond: 'Draw one more card',
  market: 'Face-up cards',
  tickets: 'Tickets',
  drawTickets: 'Draw tickets',
  ticketsLeft: (n: number) => `${n} left`,
  hand: 'Your cards',
  keepTickets: 'Keep selected tickets',
  chooseTickets: (min: number) => `Choose tickets to keep (at least ${min})`,
  waitingTickets: (n: number) => `Waiting for ${n} player(s) to choose tickets…`,
  claim: 'Claim',
  cancel: 'Cancel',
  payWith: 'Pay with',
  noPayment: 'You do not have the cards for this route.',
  claimRoute: (from: string, to: string) => `${from} – ${to}`,
  tunnel: 'Tunnel',
  ferry: 'Ferry',
  tunnelReveal: 'Tunnel reveal',
  tunnelExtra: (n: number) => `The reveal costs ${n} more card(s).`,
  payExtra: 'Pay extra',
  withdraw: 'Withdraw',
  buildStation: 'Build station',
  stationCost: (n: number) => `Next station costs ${n} card(s)`,
  stationPick: 'Click a highlighted city for your station.',
  stationBorrow: 'Route this station lets you use for tickets',
  noStations: 'No stations left',
  pass: 'Pass',
  skip: 'Skip turn',
  scores: 'Players',
  trains: 'trains',
  cards: 'cards',
  stations: 'stations',
  points: 'pts',
  log: 'Game log',
  finished: 'Game over',
  winner: (names: string) => `Winner: ${names}`,
  routePoints: 'Routes',
  ticketPoints: 'Tickets',
  stationPoints: 'Stations',
  longestBonus: 'Longest trail',
  total: 'Total',
  backToLobby: 'Back to lobby',
  completed: 'completed',
  failed: 'failed',
  connected: 'connected',
  notConnected: 'not connected yet',
  searchCity: 'Find a city…',
  resetView: 'Reset view',
  closed: 'This lane is closed with this many players.',
  blockedForYou: 'You already own a lane of this route.',
  owned: (name: string) => `Owned by ${name}`,
};

export const CARD_NAMES: Record<Card | 'gray', string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Pink',
  black: 'Black',
  white: 'White',
  locomotive: 'Locomotive',
  gray: 'Any color',
};

/** One-letter cue per card so colors are not the only signal. */
export const CARD_LETTERS: Record<Card | 'gray', string> = {
  red: 'R',
  orange: 'O',
  yellow: 'Y',
  green: 'G',
  blue: 'B',
  purple: 'P',
  black: 'K',
  white: 'W',
  locomotive: '★',
  gray: '·',
};

export function describeCards(cards: CardCounts): string {
  return Object.entries(cards)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([c, n]) => `${n} ${CARD_NAMES[c as Card].toLowerCase()}`)
    .join(' + ');
}

/** Plain-language event log line, or null for events not worth logging. */
export function describeEvent(e: GameEvent, names: string[], map: MapIndex | null): string | null {
  const who = (i: number) => names[i] ?? `Player ${i + 1}`;
  const routeName = (id: string) => {
    const r = map?.routes.get(id);
    if (!r) return id;
    return `${map!.cities.get(r.from)?.name ?? r.from} – ${map!.cities.get(r.to)?.name ?? r.to}`;
  };
  const cityName = (id: string) => map?.cities.get(id)?.name ?? id;
  switch (e.type) {
    case 'drewBlind':
      return e.secret ? `${who(e.player)} drew a ${CARD_NAMES[e.secret.card].toLowerCase()} card.` : `${who(e.player)} drew from the pile.`;
    case 'drewFaceUp':
      return `${who(e.player)} took a face-up ${CARD_NAMES[e.card].toLowerCase()}.`;
    case 'marketReset':
      return 'Too many locomotives: the face-up cards were replaced.';
    case 'claimedRoute':
      return `${who(e.player)} claimed ${routeName(e.routeId)}.`;
    case 'tunnelRevealed':
      return `${who(e.player)} tried the ${routeName(e.routeId)} tunnel: ${e.extra} extra card(s).`;
    case 'tunnelWithdrawn':
      return `${who(e.player)} withdrew from the tunnel.`;
    case 'drewTickets':
      return `${who(e.player)} drew ${e.count} ticket(s).`;
    case 'keptTickets':
      return `${who(e.player)} kept ${e.count} ticket(s).`;
    case 'builtStation':
      return `${who(e.player)} built a station in ${cityName(e.cityId)}.`;
    case 'passed':
      return `${who(e.player)} passed.`;
    case 'skipped':
      return `The host skipped ${who(e.player)}.`;
    case 'lastRoundStarted':
      return `${who(e.player)} is almost out of trains. Last round!`;
    case 'gameFinished':
      return 'The game is over.';
    case 'deckReshuffled':
      return 'The discard pile was shuffled into the draw pile.';
    case 'turnStarted':
      return null;
  }
}
