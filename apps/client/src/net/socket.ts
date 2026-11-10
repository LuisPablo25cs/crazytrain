import { io, type Socket } from 'socket.io-client';
import {
  EVENTS,
  type ClientAction,
  type GameMessage,
  type Intent,
  type IntentReply,
  type MapDefinition,
  type RoomView,
} from '@rails/shared';
import { reduceGame, reduceMap, reduceRoom, showToast, store } from '../state/store.js';
import { Session } from './session.js';

export const session = new Session();
let socket: Socket | null = null;
/** The room this window is in, so a dropped connection can rejoin with its token (R4). */
let currentRoom: { code: string; name: string } | null = null;

export function connect(): Socket {
  if (socket) return socket;
  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    store.setState({ connection: 'connected' });
    if (currentRoom) void rejoin();
  });
  socket.on('disconnect', () => store.setState({ connection: 'disconnected' }));
  socket.on('connect_error', () => store.setState({ connection: 'disconnected' }));
  socket.on(EVENTS.room, (room: RoomView) => store.setState((s) => reduceRoom(s, room)));
  socket.on(EVENTS.map, (map: MapDefinition) => store.setState(reduceMap(map)));
  socket.on(EVENTS.game, (message: GameMessage) => {
    const patch = reduceGame(store.getState(), message);
    if (patch) store.setState(patch);
  });
  socket.on(EVENTS.kicked, ({ reason }: { reason: string }) => {
    if (currentRoom && /removed/.test(reason)) session.forget(currentRoom.code);
    currentRoom = null;
    store.setState({ kicked: reason, room: null, game: null });
  });
  return socket;
}

/**
 * Lets the map editor's player view run a game inside the browser: while set, intents go here
 * instead of to the server.
 */
export interface LocalMode {
  intent: (intent: Intent) => IntentReply;
}
let local: LocalMode | null = null;
export function setLocalMode(mode: LocalMode | null): void {
  local = mode;
}

export function send(intent: Intent): Promise<IntentReply> {
  if (local) return Promise.resolve(local.intent(intent));
  const s = connect();
  return new Promise((resolve) => {
    s.timeout(10_000).emit(EVENTS.intent, intent, (err: Error | null, reply: IntentReply) => {
      resolve(err ? { ok: false, error: 'the server did not answer' } : reply);
    });
  });
}

/** Send and show any error as a toast. Returns whether it worked. */
export async function sendOrToast(intent: Intent): Promise<boolean> {
  const reply = await send(intent);
  if (!reply.ok && reply.reason !== 'stale') showToast(reply.error);
  if (!reply.ok && reply.reason === 'stale') showToast(reply.error, 'info');
  return reply.ok;
}

export async function createRoom(name: string): Promise<IntentReply> {
  session.saveName(name);
  const reply = await send({ type: 'createRoom', name });
  if (reply.ok && reply.code && reply.token) {
    session.saveToken(reply.code, reply.token);
    currentRoom = { code: reply.code, name };
  }
  return reply;
}

export async function joinRoom(code: string, name: string): Promise<IntentReply> {
  if (name) session.saveName(name);
  const reply = await send(session.joinIntent(code, name));
  if (reply.ok && reply.code && reply.token) {
    session.saveToken(reply.code, reply.token);
    currentRoom = { code: reply.code, name };
  } else if (!reply.ok && session.token(code) && reply.reason === 'notFound') {
    session.forget(code);
  }
  return reply;
}

async function rejoin(): Promise<void> {
  if (!currentRoom) return;
  const reply = await joinRoom(currentRoom.code, currentRoom.name);
  if (!reply.ok) showToast(reply.error);
}

export async function leaveRoom(): Promise<void> {
  if (local) {
    local.intent({ type: 'leaveRoom' });
    return;
  }
  if (currentRoom) session.forget(currentRoom.code);
  currentRoom = null;
  await send({ type: 'leaveRoom' });
  store.setState({ room: null, game: null, log: [], lastEvents: [] });
}

export function sendAction(action: ClientAction): Promise<boolean> {
  const version = store.getState().game?.version ?? 0;
  return sendOrToast({ type: 'gameAction', action, expectedVersion: version });
}
