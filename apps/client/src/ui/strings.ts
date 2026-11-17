import { MONTH_NAMES, yearOf, monthOfYear, type Card, type CardCounts, type GameEvent, type GameMode, type Hazard, type MapIndex } from '@rails/shared';

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
  longTicket: 'Triple ticket',
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
  excavator: 'Excavator',
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
  excavator: '⛏',
  gray: '·',
};

export const HAZARD_NAMES: Record<Hazard, string> = {
  earthquake: 'Earthquake',
  volcano: 'Volcano',
  tsunami: 'Tsunami',
  hurricane: 'Hurricane',
  tornado: 'Tornado',
  snow: 'Snow storm',
};

/** What each disaster does, for the announcement card. */
export const HAZARD_EFFECTS: Record<Hazard, string> = {
  earthquake: 'Built routes touching nearby cities are broken. Repair them within a year or lose them, and anyone may claim them by paying the repair.',
  volcano: 'Nearby routes are buried in ash for a year: they cannot be used or built. Then they turn gray and free.',
  tsunami: 'Track inside the wave is washed away. Partly washed lines need excavators to repair (1 per 2 pieces) within a year.',
  hurricane: 'Built routes lose a piece now and one more every 3 months until repaired. Building here needs an excavator for a year.',
  tornado: 'Pieces inside the funnel may fly off and need repairs. Building here this month needs excavators.',
  snow: 'Nothing can be built here in winter.',
};

export const MODE_NAMES: Record<GameMode, string> = {
  classic: 'Classic',
  seasons: 'Seasons',
};

export const MODE_BLURBS: Record<GameMode, string> = {
  classic: 'The board game rules.',
  seasons: 'Each round is a month. Earthquakes, hurricanes, tornados, tsunamis, volcanoes and snow hit the board; repair your lines or lose them.',
};

/** "March, year 2" */
export function monthLabel(month: number): string {
  return `${MONTH_NAMES[monthOfYear(month)]}, year ${yearOf(month)}`;
}

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
    case 'monthStarted':
      return `— ${monthLabel(e.month)} —`;
    case 'disaster': {
      const hits = e.damaged.length + e.lost.length + e.blocked.length;
      return `${HAZARD_NAMES[e.kind]} near ${cityName(e.cityId)}${hits ? `: ${hits} route(s) hit` : ', no track hit'}.`;
    }
    case 'damageSpread':
      return `Hurricane damage spreads on ${who(e.player)}'s ${routeName(e.routeId)} (${e.broken} pieces broken).`;
    case 'routeRepaired':
      return e.claimed ? `${who(e.player)} repaired and claimed ${routeName(e.routeId)}.` : `${who(e.player)} repaired ${routeName(e.routeId)}.`;
    case 'routeLost': {
      const why = e.reason === 'volcano' ? 'to the volcano' : e.reason === 'destroyed' ? 'to the disaster' : 'after a year without repairs';
      return `${who(e.player)} lost ${routeName(e.routeId)} ${why}.${e.claimable ? ' Anyone may repair it to claim it.' : ''}`;
    }
    case 'routeGrayed':
      return `The ash settled: ${routeName(e.routeId)} is gray and free again.`;
  }
}

/** Classic HUD (Night Express design) wording. */
export const NX = {
  title: 'Crazy Train Express',
  market: 'Market',
  deck: 'Deck',
  round: (round: number, deck: number) => `Round ${round} · Deck ${deck}`,
  trainsLeft: (n: number) => `${n} trains`,
  lastTrains: (n: number) => `${n} left`,
  drawTickets: (n: number) => `Draw tickets · ${n}`,
  ticketCounter: (front: number, total: number, done: number) =>
    `${front} / ${total} · ${done} complete`,
  ticketCount: (total: number, done: number) =>
    `${total} ticket${total === 1 ? '' : 's'} · ${done} complete`,
  noTickets: 'No tickets yet',
  prevTicket: 'Previous ticket',
  nextTicket: 'Next ticket',
  spaces: (n: number) => `${n} space${n === 1 ? '' : 's'}`,
  payWith: 'Pay with',
  locomotives: 'Locomotives',
  addLoco: 'Use one more locomotive',
  removeLoco: 'Use one less locomotive',
  toPay: 'To pay',
  claim: (points: number) => `Claim · +${points}`,
  dig: 'Dig · draw 3',
  claimed: 'Claimed',
  claimedPoints: (points: number) => `Claimed · +${points}`,
  notEnough: 'Not enough cards',
  cannotClaim: 'Cannot claim',
  ferryNeeds: (n: number) => `Ferry · ${n} locomotive${n === 1 ? '' : 's'} needed`,
  tunnel: 'Tunnel',
  tunnelTurnedUp: 'The tunnel turned up',
  laidDown: 'Laid down',
  moreToPay: (n: number) => `${n} more to pay`,
  payMore: (n: number) => `Pay ${n} more`,
  giveUp: 'Give up',
  cannotPayExtra: 'You cannot pay the extra cards.',
  digging: (name: string) => `${name} is digging a tunnel…`,
  missing: (n: number, color: string) =>
    `You need ${n} more ${color} card${n === 1 ? '' : 's'} or locomotives.`,
  chooseTitle: 'Choose Your Tickets',
  chooseHelp: (min: number) => `Keep at least ${min}. Returned tickets go under the deck.`,
  keeping: 'Keeping',
  returning: 'Returning',
  triple: 'Triple',
  keepSummary: (kept: number, total: number, points: number) =>
    `Keeping ${kept} of ${total}: worth +${points} if you finish them, −${points} if you do not.`,
  keepAtLeast: (min: number) => `Keep at least ${min} tickets to continue.`,
  keepButton: (n: number) => `Keep ${n} ticket${n === 1 ? '' : 's'}`,
  keepMinButton: (min: number) => `Keep at least ${min}`,
};
