import type { Intent, IntentReply, MapDefinition } from '@rails/shared';
import { newRoomCode, normalizeCode } from './codes.js';
import { Room, type RoomTransport, type Seat } from './Room.js';

export interface RoomManagerOptions {
  now?: () => number;
  hostGraceMs?: number;
  /** A lobby with nobody connected is deleted after this long (KTD13). */
  emptyLobbyMs?: number;
  /** A game with nobody connected is deleted after this long, so a long break does not end it. */
  abandonedGameMs?: number;
  /** A finished game's room is deleted after this long (KTD13). */
  finishedMs?: number;
  seed?: () => number;
}

const MINUTE = 60_000;

/** Owns every room and routes each socket's intents to its room and seat. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly bySocket = new Map<string, { room: Room; seat: Seat }>();
  private readonly now: () => number;
  private readonly opts: Required<Omit<RoomManagerOptions, 'seed' | 'now'>> & Pick<RoomManagerOptions, 'seed'>;

  constructor(
    private starterMap: MapDefinition,
    private readonly transport: RoomTransport,
    options: RoomManagerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.opts = {
      hostGraceMs: options.hostGraceMs ?? 30_000,
      emptyLobbyMs: options.emptyLobbyMs ?? 10 * MINUTE,
      abandonedGameMs: options.abandonedGameMs ?? 60 * MINUTE,
      finishedMs: options.finishedMs ?? 30 * MINUTE,
      seed: options.seed,
    };
  }

  /** The map new rooms start with. Existing rooms keep theirs. */
  setStarterMap(map: MapDefinition): void {
    this.starterMap = map;
  }

  handle(socketId: string, intent: Intent): IntentReply {
    switch (intent.type) {
      case 'createRoom':
        return this.create(socketId, intent.name);
      case 'joinRoom':
        return this.join(socketId, intent.code, intent.name, intent.token);
      default:
        break;
    }
    const binding = this.bySocket.get(socketId);
    if (!binding) return { ok: false, error: 'join a room first', reason: 'notFound' };
    const { room, seat } = binding;
    switch (intent.type) {
      case 'leaveRoom':
        this.unbind(socketId);
        room.leave(seat);
        this.dropIfEmpty(room);
        return { ok: true };
      case 'setToggles':
        return room.setToggles(seat, intent.toggles);
      case 'setMode':
        return room.setMode(seat, intent.mode, intent.years, intent.doubleRoutes);
      case 'setMap':
        return room.setMap(seat, intent.map);
      case 'setSettings':
        return room.setSettings(seat, intent.trainsPerPlayer);
      case 'setColor':
        return room.setColor(seat, intent.color);
      case 'kick':
        return room.kick(seat, intent.seatId);
      case 'startGame':
        return room.startGame(seat);
      case 'gameAction':
        return room.gameAction(seat, intent.action, intent.expectedVersion);
      case 'skipPlayer':
        return room.skipPlayer(seat, intent.seatId);
      case 'backToLobby':
        return room.backToLobby(seat);
    }
  }

  private create(socketId: string, name: string): IntentReply {
    this.leaveCurrent(socketId);
    const code = newRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, this.starterMap, this.transport, {
      now: this.now,
      hostGraceMs: this.opts.hostGraceMs,
      seed: this.opts.seed,
    });
    this.rooms.set(code, room);
    const seat = room.addSeat(name, socketId);
    if (!('token' in seat)) return seat;
    this.bySocket.set(socketId, { room, seat });
    return { ok: true, code, token: seat.token, seatId: seat.id };
  }

  private join(socketId: string, rawCode: string, name: string, token?: string): IntentReply {
    const code = normalizeCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: `there is no room "${code}"`, reason: 'notFound' };
    const current = this.bySocket.get(socketId);
    if (current && current.room !== room) this.leaveCurrent(socketId);

    const existing = token ? room.seatByToken(token) : undefined;
    if (existing) {
      if (existing.socketId && existing.socketId !== socketId) this.bySocket.delete(existing.socketId);
      this.bySocket.set(socketId, { room, seat: existing });
      room.reattach(existing, socketId);
      return { ok: true, code, token: existing.token, seatId: existing.id };
    }
    const seat = room.addSeat(name, socketId);
    if (!('token' in seat)) return seat;
    this.bySocket.set(socketId, { room, seat });
    return { ok: true, code, token: seat.token, seatId: seat.id };
  }

  private leaveCurrent(socketId: string): void {
    const binding = this.bySocket.get(socketId);
    if (!binding) return;
    this.unbind(socketId);
    binding.room.leave(binding.seat);
    this.dropIfEmpty(binding.room);
  }

  /** A socket closed. */
  disconnect(socketId: string): void {
    const binding = this.bySocket.get(socketId);
    if (!binding) return;
    this.unbind(socketId);
    if (binding.seat.socketId === socketId) binding.room.disconnect(binding.seat);
  }

  /** The socket layer detached a socket (kick, or replaced by a newer window). */
  unbind(socketId: string): void {
    this.bySocket.delete(socketId);
  }

  private dropIfEmpty(room: Room): void {
    if (room.seats.length === 0) this.delete(room);
  }

  private delete(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
    for (const [socketId, binding] of this.bySocket) if (binding.room === room) this.bySocket.delete(socketId);
  }

  /** Delete rooms nobody will come back to (KTD13). Called on a timer. */
  sweep(): string[] {
    const now = this.now();
    const removed: string[] = [];
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.lastActivity;
      const nobody = room.connectedSeats().length === 0;
      const expired =
        (room.phase === 'finished' && room.finishedAt !== null && now - room.finishedAt >= this.opts.finishedMs) ||
        (room.phase === 'lobby' && nobody && idle >= this.opts.emptyLobbyMs) ||
        (room.phase === 'playing' && nobody && idle >= this.opts.abandonedGameMs);
      if (expired) {
        this.delete(room);
        removed.push(room.code);
      }
    }
    return removed;
  }
}
