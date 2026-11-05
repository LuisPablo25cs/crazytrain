import type { Server, Socket } from 'socket.io';
import { EVENTS, IntentSchema, type IntentReply } from '@rails/shared';
import type { RoomManager } from '../rooms/RoomManager.js';

export interface RateLimit {
  /** Messages allowed per window. */
  max: number;
  windowMs: number;
}

/** Wire sockets to the room manager. Every message is validated with Zod before any handler runs. */
export function attachHandlers(io: Server, rooms: RoomManager, limit: RateLimit): void {
  io.on('connection', (socket: Socket) => {
    let windowStart = Date.now();
    let count = 0;

    socket.on(EVENTS.intent, (payload: unknown, ack?: unknown) => {
      const reply = (r: IntentReply) => {
        if (typeof ack === 'function') ack(r);
      };
      const now = Date.now();
      if (now - windowStart >= limit.windowMs) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > limit.max) return reply({ ok: false, error: 'slow down', reason: 'rateLimited' });

      const parsed = IntentSchema.safeParse(payload);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return reply({ ok: false, error: issue ? `${issue.path.join('.') || 'message'}: ${issue.message}` : 'invalid message', reason: 'invalid' });
      }
      try {
        reply(rooms.handle(socket.id, parsed.data));
      } catch (e) {
        console.error('intent failed', parsed.data.type, e);
        reply({ ok: false, error: 'the server hit an error' });
      }
    });

    socket.on('disconnect', () => rooms.disconnect(socket.id));
  });
}
