import {
  applyAction,
  createGame,
  eventsFor,
  formatIssues,
  GameSetupError,
  indexMap,
  MAX_MAP_UPLOAD_BYTES,
  resolveRules,
  RulesError,
  validateMap,
  viewFor,
  type Action,
  type ClientAction,
  type ExpansionToggles,
  type GameMode,
  type GameEvent,
  type GameMessage,
  type GameState,
  type IntentReply,
  type MapDefinition,
  type MapIndex,
  type RoomView,
  type RulesConfig,
} from '@rails/shared';
import { newSeatId, newSeed, newToken } from './codes.js';

export interface Seat {
  id: string;
  token: string;
  name: string;
  color: string;
  socketId: string | null;
  /** Player index once the game starts. */
  playerIndex: number | null;
  disconnectedAt: number | null;
}

/** How a room talks to sockets. The socket layer implements it; tests can fake it. */
export interface RoomTransport {
  send(socketId: string, event: string, payload: unknown): void;
  /** Tell a socket why it left the room and detach it (kick, or replaced by a newer window). */
  detach(socketId: string, reason: string): void;
}

export interface RoomOptions {
  now: () => number;
  /** How long the host may be disconnected before the host role moves on. */
  hostGraceMs: number;
  seed?: () => number;
}

type Fail = Extract<IntentReply, { ok: false }>;
const fail = (error: string, reason?: Fail['reason']): Fail => ({ ok: false, error, reason });
const OK: IntentReply = { ok: true };

export class Room {
  readonly seats: Seat[] = [];
  hostSeatId = '';
  map: MapDefinition;
  mapIndex: MapIndex;
  customMap = false;
  toggles: ExpansionToggles;
  mode: GameMode = 'classic';
  years: number;
  game: { state: GameState; version: number } | null = null;
  lastActivity: number;
  finishedAt: number | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly starterMap: MapDefinition,
    private readonly transport: RoomTransport,
    private readonly options: RoomOptions,
  ) {
    this.map = starterMap;
    this.mapIndex = indexMap(starterMap);
    const defaults = resolveRules(starterMap.rules);
    this.toggles = { ...defaults.expansions };
    this.mode = defaults.mode;
    this.years = defaults.seasons.years;
    this.lastActivity = options.now();
  }

  get phase(): RoomView['phase'] {
    if (!this.game) return 'lobby';
    return this.game.state.phase === 'finished' ? 'finished' : 'playing';
  }

  rules(): RulesConfig {
    return resolveRules(this.map.rules, this.toggles, undefined, this.lobby());
  }

  /** What the lobby chose besides the expansion toggles. */
  private lobby() {
    return { mode: this.mode, years: this.years };
  }

  connectedSeats(): Seat[] {
    return this.seats.filter((s) => s.socketId !== null);
  }

  seatById(seatId: string): Seat | undefined {
    return this.seats.find((s) => s.id === seatId);
  }

  seatByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.token === token);
  }

  isHost(seat: Seat): boolean {
    return seat.id === this.hostSeatId;
  }

  touch(): void {
    this.lastActivity = this.options.now();
  }

  // --- Joining and leaving -------------------------------------------------

  /** Add a new seat. Returns the seat, or an error when the room cannot take it. */
  addSeat(name: string, socketId: string): Seat | Fail {
    if (this.phase !== 'lobby') return fail('this game has already started', 'started');
    const rules = this.rules();
    if (this.seats.length >= rules.players.max) return fail(`this room is full (${rules.players.max} players)`, 'full');
    const color = rules.playerColors.find((c) => !this.seats.some((s) => s.color === c)) ?? rules.playerColors[0]!;
    const seat: Seat = {
      id: newSeatId(),
      token: newToken(),
      name: this.uniqueName(name),
      color,
      socketId,
      playerIndex: null,
      disconnectedAt: null,
    };
    this.seats.push(seat);
    if (!this.hostSeatId) this.hostSeatId = seat.id;
    this.touch();
    this.broadcastRoom();
    this.sendMap(seat);
    return seat;
  }

  /** Reattach a returning player (R4). The newest connection wins (KTD10). */
  reattach(seat: Seat, socketId: string): void {
    if (seat.socketId && seat.socketId !== socketId) this.transport.detach(seat.socketId, 'This seat was opened in another window.');
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    this.touch();
    this.broadcastRoom();
    this.sendMap(seat);
    if (this.game) this.sendGame(seat, []);
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** A socket went away. The seat stays so the player can come back. */
  disconnect(seat: Seat): void {
    seat.socketId = null;
    seat.disconnectedAt = this.options.now();
    this.touch();
    if (this.isHost(seat)) this.scheduleHostHandover();
    this.broadcastRoom();
  }

  /** Explicit leave. In the lobby the seat is removed; during a game it stays, disconnected. */
  leave(seat: Seat): void {
    if (this.phase === 'lobby') {
      this.removeSeat(seat);
    } else {
      this.disconnect(seat);
    }
  }

  private removeSeat(seat: Seat): void {
    const i = this.seats.indexOf(seat);
    if (i >= 0) this.seats.splice(i, 1);
    if (this.isHost(seat)) this.hostSeatId = this.connectedSeats()[0]?.id ?? this.seats[0]?.id ?? '';
    this.touch();
    this.broadcastRoom();
  }

  private scheduleHostHandover(): void {
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      this.handOverHostIfAway();
    }, this.options.hostGraceMs);
    this.hostTimer.unref?.();
  }

  /** Move the host role to the next connected seat when the host is away. */
  handOverHostIfAway(): void {
    const host = this.seatById(this.hostSeatId);
    if (host?.socketId) return;
    const start = host ? this.seats.indexOf(host) : 0;
    for (let k = 1; k <= this.seats.length; k++) {
      const candidate = this.seats[(start + k) % this.seats.length]!;
      if (candidate.socketId) {
        this.hostSeatId = candidate.id;
        this.broadcastRoom();
        return;
      }
    }
  }

  dispose(): void {
    if (this.hostTimer) clearTimeout(this.hostTimer);
  }

  // --- Host lobby controls (R5) --------------------------------------------

  private requireHostInLobby(seat: Seat): Fail | null {
    if (!this.isHost(seat)) return fail('only the host can do that', 'forbidden');
    if (this.phase !== 'lobby') return fail('the game has already started', 'started');
    return null;
  }

  setToggles(seat: Seat, toggles: Partial<ExpansionToggles>): IntentReply {
    const denied = this.requireHostInLobby(seat);
    if (denied) return denied;
    this.toggles = { ...this.toggles, ...toggles };
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  setMode(seat: Seat, mode: GameMode, years?: number): IntentReply {
    const denied = this.requireHostInLobby(seat);
    if (denied) return denied;
    this.mode = mode;
    if (years !== undefined) this.years = years;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  setMap(seat: Seat, doc: unknown): IntentReply {
    const denied = this.requireHostInLobby(seat);
    if (denied) return denied;
    let map = this.starterMap;
    let custom = false;
    if (doc !== null) {
      const size = JSON.stringify(doc)?.length ?? 0;
      if (size > MAX_MAP_UPLOAD_BYTES) return fail(`map files are limited to ${MAX_MAP_UPLOAD_BYTES / 1_000_000} MB`, 'invalid');
      const result = validateMap(doc);
      if (!result.ok) {
        const lines = result.errors.slice(0, 15);
        const more = result.errors.length > lines.length ? `\n…and ${result.errors.length - lines.length} more` : '';
        return fail(`This map has problems:\n${formatIssues(lines)}${more}`, 'invalid');
      }
      map = result.map;
      custom = true;
    }
    let rules: RulesConfig;
    try {
      rules = resolveRules(map.rules, this.toggles, undefined, this.lobby());
    } catch (e) {
      return fail(e instanceof RulesError ? e.message : String(e), 'invalid');
    }
    if (this.seats.length > rules.players.max) {
      return fail(`this map allows at most ${rules.players.max} players`, 'invalid');
    }
    this.map = map;
    this.mapIndex = indexMap(map);
    this.customMap = custom;
    // Keep seat colors valid for the new map's palette.
    const used = new Set<string>();
    for (const s of this.seats) {
      if (!rules.playerColors.includes(s.color) || used.has(s.color)) {
        s.color = rules.playerColors.find((c) => !used.has(c) && !this.seats.some((o) => o !== s && o.color === c)) ?? s.color;
      }
      used.add(s.color);
    }
    this.touch();
    for (const s of this.seats) this.sendMap(s);
    this.broadcastRoom();
    return OK;
  }

  setColor(seat: Seat, color: string): IntentReply {
    if (this.phase !== 'lobby') return fail('colors are chosen in the lobby', 'started');
    if (!this.rules().playerColors.includes(color)) return fail('unknown color', 'invalid');
    if (this.seats.some((s) => s !== seat && s.color === color)) return fail('that color is taken', 'invalid');
    seat.color = color;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  kick(seat: Seat, targetId: string): IntentReply {
    const denied = this.requireHostInLobby(seat);
    if (denied) return denied;
    const target = this.seatById(targetId);
    if (!target) return fail('no such player', 'notFound');
    if (target === seat) return fail('you cannot remove yourself; leave instead', 'invalid');
    if (target.socketId) this.transport.detach(target.socketId, 'The host removed you from the room.');
    this.removeSeat(target);
    return OK;
  }

  startGame(seat: Seat): IntentReply {
    const denied = this.requireHostInLobby(seat);
    if (denied) return denied;
    try {
      const rules = this.rules();
      const { state } = createGame({
        map: this.mapIndex,
        rules,
        players: this.seats.map((s) => ({ name: s.name, color: s.color })),
        seed: (this.options.seed ?? newSeed)(),
      });
      this.seats.forEach((s, i) => (s.playerIndex = i));
      this.game = { state, version: 1 };
      this.finishedAt = null;
    } catch (e) {
      if (e instanceof GameSetupError || e instanceof RulesError) return fail(e.message, 'invalid');
      throw e;
    }
    this.touch();
    this.broadcastRoom();
    this.broadcastGame([]);
    return OK;
  }

  /** After a finished game, return everyone to the lobby with the same seats. */
  backToLobby(seat: Seat): IntentReply {
    if (!this.isHost(seat)) return fail('only the host can do that', 'forbidden');
    if (this.phase !== 'finished') return fail('the game is not finished', 'invalid');
    this.game = null;
    this.finishedAt = null;
    for (const s of this.seats) s.playerIndex = null;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  // --- Game actions --------------------------------------------------------

  gameAction(seat: Seat, action: ClientAction, expectedVersion: number): IntentReply {
    if (!this.game || seat.playerIndex === null) return fail('the game has not started', 'invalid');
    // Initial tickets are chosen by everyone at once, so only turn actions check the version.
    if (action.type !== 'keepInitialTickets' && expectedVersion !== this.game.version) {
      this.sendGame(seat, []);
      return fail('the game moved on; your screen was refreshed', 'stale');
    }
    return this.apply(seat.playerIndex, action as Action);
  }

  /** Host skips a disconnected player's turn or ticket choice (R5). */
  skipPlayer(seat: Seat, targetId: string): IntentReply {
    if (!this.isHost(seat)) return fail('only the host can skip players', 'forbidden');
    if (!this.game) return fail('the game has not started', 'invalid');
    const target = this.seatById(targetId);
    if (!target || target.playerIndex === null) return fail('no such player', 'notFound');
    if (target.socketId) return fail('that player is connected', 'invalid');
    return this.apply(target.playerIndex, { type: 'skip' });
  }

  private apply(player: number, action: Action): IntentReply {
    const game = this.game!;
    const result = applyAction(game.state, this.mapIndex, player, action);
    if (!result.ok) return fail(result.error, 'invalid');
    game.state = result.state;
    game.version += 1;
    if (game.state.phase === 'finished') this.finishedAt = this.options.now();
    this.touch();
    this.broadcastGame(result.events);
    if (game.state.phase === 'finished') this.broadcastRoom();
    return OK;
  }

  // --- Outgoing messages ---------------------------------------------------

  roomView(seat: Seat): RoomView {
    const rules = this.rules();
    return {
      code: this.code,
      phase: this.phase,
      you: seat.id,
      hostSeatId: this.hostSeatId,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        connected: s.socketId !== null,
        isHost: s.id === this.hostSeatId,
        playerIndex: s.playerIndex,
      })),
      toggles: { ...this.toggles },
      mode: this.mode,
      years: this.years,
      map: {
        id: this.map.id,
        name: this.map.name,
        cityCount: this.map.cities.length,
        routeCount: this.map.routes.length,
        custom: this.customMap,
      },
      limits: { minPlayers: rules.players.min, maxPlayers: rules.players.max, playerColors: [...rules.playerColors] },
    };
  }

  broadcastRoom(): void {
    for (const s of this.seats) if (s.socketId) this.transport.send(s.socketId, 'room', this.roomView(s));
  }

  sendMap(seat: Seat): void {
    if (seat.socketId) this.transport.send(seat.socketId, 'map', this.map);
  }

  sendGame(seat: Seat, events: GameEvent[]): void {
    if (!this.game || !seat.socketId) return;
    const message: GameMessage = {
      version: this.game.version,
      view: viewFor(this.game.state, seat.playerIndex),
      events: eventsFor(events, seat.playerIndex),
    };
    this.transport.send(seat.socketId, 'game', message);
  }

  broadcastGame(events: GameEvent[]): void {
    for (const s of this.seats) this.sendGame(s, events);
  }
}
