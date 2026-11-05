import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import {
  MapSchema,
  type GameMessage,
  type Intent,
  type IntentReply,
  type MapDefinition,
  type RoomView,
} from '@rails/shared';
import { createRailsServer, type RailsServer, type RailsServerOptions } from '../src/app.js';
import tiny from '../../../packages/shared/test/fixtures/tiny.map.json' with { type: 'json' };

export function tinyMap(): MapDefinition {
  return MapSchema.parse(structuredClone(tiny));
}

export interface TestServer {
  server: RailsServer;
  url: string;
  clients: TestClient[];
  client(): Promise<TestClient>;
  stop(): Promise<void>;
}

export async function startServer(options: Partial<RailsServerOptions> = {}): Promise<TestServer> {
  const server = createRailsServer({ starterMap: tinyMap(), rooms: { seed: () => 1234 }, ...options });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const clients: TestClient[] = [];
  return {
    server,
    url,
    clients,
    async client() {
      const c = await TestClient.connect(url);
      clients.push(c);
      return c;
    },
    async stop() {
      for (const c of clients) c.socket.disconnect();
      await server.close();
    },
  };
}

/** A socket client that remembers the latest room, map and game messages. */
export class TestClient {
  room: RoomView | null = null;
  map: MapDefinition | null = null;
  game: GameMessage | null = null;
  games: GameMessage[] = [];
  kicked: string | null = null;
  token: string | undefined;
  code: string | undefined;
  private waiters: (() => void)[] = [];

  private constructor(readonly socket: Socket) {
    socket.on('room', (r: RoomView) => this.update(() => (this.room = r)));
    socket.on('map', (m: MapDefinition) => this.update(() => (this.map = m)));
    socket.on('game', (g: GameMessage) =>
      this.update(() => {
        this.game = g;
        this.games.push(g);
      }),
    );
    socket.on('kicked', (k: { reason: string }) => this.update(() => (this.kicked = k.reason)));
  }

  static connect(url: string): Promise<TestClient> {
    const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(new TestClient(socket)));
      socket.once('connect_error', reject);
    });
  }

  private update(fn: () => void): void {
    fn();
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  send(intent: Intent | Record<string, unknown>): Promise<IntentReply> {
    return new Promise((resolve) => this.socket.emit('intent', intent, (r: IntentReply) => resolve(r)));
  }

  async create(name: string): Promise<IntentReply> {
    const r = await this.send({ type: 'createRoom', name });
    if (r.ok) {
      this.token = r.token;
      this.code = r.code;
    }
    return r;
  }

  async join(code: string, name: string, token?: string): Promise<IntentReply> {
    const r = await this.send({ type: 'joinRoom', code, name, ...(token ? { token } : {}) });
    if (r.ok) {
      this.token = r.token;
      this.code = r.code;
    }
    return r;
  }

  /** Wait until `check` holds, re-checking after every message. */
  waitFor(check: () => boolean, label = 'condition', timeoutMs = 3000): Promise<void> {
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
      const retry = () => {
        if (check()) {
          clearTimeout(timer);
          resolve();
        } else {
          this.waiters.push(retry);
        }
      };
      this.waiters.push(retry);
    });
  }
}

/** Host creates a room and `guests` join it. Everyone has seen the full seat list. */
export async function roomWith(t: TestServer, guests: number): Promise<TestClient[]> {
  const host = await t.client();
  await host.create('Host');
  const players = [host];
  for (let i = 0; i < guests; i++) {
    const c = await t.client();
    const r = await c.join(host.code!, `Guest${i + 1}`);
    if (!r.ok) throw new Error(r.error);
    players.push(c);
  }
  await Promise.all(players.map((p) => p.waitFor(() => p.room?.seats.length === players.length, 'seats')));
  return players;
}
