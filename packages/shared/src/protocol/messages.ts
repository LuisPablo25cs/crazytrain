import { z } from 'zod';
import { ALL_CARDS } from '../map/schema.js';
import type { GameEvent } from '../engine/types.js';
import type { GameView } from '../engine/view.js';
import { TRAINS_RANGE } from '../rules/resolve.js';
import { DoubleRoutesSchema, GameModeSchema, type DoubleRoutes, type ExpansionToggles, type GameMode } from '../rules/schema.js';

/** Largest map document a host may upload, in bytes of JSON. */
export const MAX_MAP_UPLOAD_BYTES = 2_000_000;
export const MAX_NAME_LENGTH = 20;

const cardCounts = z.partialRecord(z.enum(ALL_CARDS as [string, ...string[]]), z.number().int().min(0).max(200));
const id = z.string().min(1).max(80);

/** Game actions a client may send. `skip` is host-only and goes through `skipPlayer`. */
export const ClientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('keepInitialTickets'), ticketIds: z.array(id).max(20) }),
  z.object({ type: z.literal('drawBlind') }),
  z.object({ type: z.literal('drawFaceUp'), slot: z.number().int().min(0).max(50) }),
  z.object({ type: z.literal('claimRoute'), routeId: id, payment: cardCounts }),
  z.object({ type: z.literal('resolveTunnel'), extra: cardCounts }),
  z.object({ type: z.literal('withdrawTunnel') }),
  z.object({ type: z.literal('repairRoute'), routeId: id, payment: cardCounts }),
  z.object({ type: z.literal('drawTickets') }),
  z.object({ type: z.literal('keepTickets'), ticketIds: z.array(id).max(20) }),
  z.object({ type: z.literal('buildStation'), cityId: id, payment: cardCounts, borrowRouteId: id }),
  z.object({ type: z.literal('pass') }),
]);
export type ClientAction = z.infer<typeof ClientActionSchema>;

const name = z
  .string()
  .trim()
  .min(1, 'enter a nickname')
  .max(MAX_NAME_LENGTH, `nicknames are at most ${MAX_NAME_LENGTH} characters`);

export const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createRoom'), name }),
  z.object({ type: z.literal('joinRoom'), code: z.string().trim().min(1).max(10), name, token: z.string().max(100).optional() }),
  z.object({ type: z.literal('leaveRoom') }),
  z.object({
    type: z.literal('setToggles'),
    toggles: z
      .object({ tunnels: z.boolean(), ferries: z.boolean(), stations: z.boolean(), longTickets: z.boolean() })
      .partial(),
  }),
  /** Classic or Seasons, and how many years a Seasons game lasts. */
  z.object({
    type: z.literal('setMode'),
    mode: GameModeSchema,
    years: z.number().int().min(1).max(10).optional(),
    doubleRoutes: DoubleRoutesSchema.optional(),
  }),
  /** `map: null` returns to the starter map. The map document is validated separately. */
  z.object({ type: z.literal('setMap'), map: z.unknown().nullable() }),
  /** Game settings the host picks before the start. `trainsPerPlayer: null` returns to the default. */
  z.object({
    type: z.literal('setSettings'),
    trainsPerPlayer: z.number().int().min(TRAINS_RANGE.min).max(TRAINS_RANGE.max).nullable(),
  }),
  z.object({ type: z.literal('setColor'), color: z.string().min(1).max(30) }),
  z.object({ type: z.literal('kick'), seatId: id }),
  z.object({ type: z.literal('startGame') }),
  z.object({ type: z.literal('gameAction'), action: ClientActionSchema, expectedVersion: z.number().int().min(0) }),
  z.object({ type: z.literal('skipPlayer'), seatId: id }),
  z.object({ type: z.literal('backToLobby') }),
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentType = Intent['type'];

export type IntentReply =
  | { ok: true; code?: string; token?: string; seatId?: string }
  | { ok: false; error: string; reason?: 'stale' | 'invalid' | 'forbidden' | 'notFound' | 'full' | 'started' | 'rateLimited' };

export interface SeatView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  /** Player index in the game, or null in the lobby. */
  playerIndex: number | null;
  /** The host removed this player during the game: their turns are skipped and they cannot rejoin. */
  removed: boolean;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  you: string;
  hostSeatId: string;
  seats: SeatView[];
  toggles: ExpansionToggles;
  mode: GameMode;
  /** Seasons mode: game length in years. */
  years: number;
  /** Whether double routes follow the lane table or are always both open. */
  doubleRoutes: DoubleRoutes;
  /** Trains each player starts with, and the number the map gives without a lobby choice. */
  trainsPerPlayer: number;
  defaultTrains: number;
  map: { id: string; name: string; cityCount: number; routeCount: number; custom: boolean };
  limits: { minPlayers: number; maxPlayers: number; playerColors: string[] };
}

export interface GameMessage {
  version: number;
  view: GameView;
  events: GameEvent[];
}

/** Socket event names. Clients send `intent` (with an ack callback); the server sends the rest. */
export const EVENTS = {
  intent: 'intent',
  room: 'room',
  map: 'map',
  game: 'game',
  kicked: 'kicked',
} as const;
