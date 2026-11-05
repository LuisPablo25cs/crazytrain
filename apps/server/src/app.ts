import { createServer, type Server as HttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';
import { formatIssues, validateMap, type MapDefinition } from '@rails/shared';
import { editorRoutes, type EditorOptions } from './editor.js';
import { createHttpApp } from './http.js';
import { attachHandlers, type RateLimit } from './net/handlers.js';
import { RoomManager, type RoomManagerOptions } from './rooms/RoomManager.js';

export interface RailsServerOptions {
  starterMap: MapDefinition;
  clientDist?: string;
  /** Folder served at /maps for map background images. */
  mapImagesDir?: string;
  /** Folder served at /art for web-sized game art. */
  artDir?: string;
  /** Enables the dev-only map editor endpoints. */
  editor?: Omit<EditorOptions, 'onSaved'>;
  rooms?: RoomManagerOptions;
  rateLimit?: RateLimit;
  sweepIntervalMs?: number;
}

export interface RailsServer {
  httpServer: HttpServer;
  io: Server;
  rooms: RoomManager;
  close(): Promise<void>;
}

export function loadMap(path: string): MapDefinition {
  const result = validateMap(JSON.parse(readFileSync(path, 'utf8')));
  if (!result.ok) throw new Error(`Map ${path} is invalid:\n${formatIssues(result.errors)}`);
  return result.map;
}

export function createRailsServer(options: RailsServerOptions): RailsServer {
  let rooms: RoomManager | null = null;
  const httpServer = createServer(
    createHttpApp({
      clientDist: options.clientDist,
      mapImagesDir: options.mapImagesDir,
      artDir: options.artDir,
      extraRoutes: options.editor
        ? editorRoutes({ ...options.editor, onSaved: (map) => rooms?.setStarterMap(map) })
        : undefined,
    }),
  );
  // Map uploads can reach 2 MB; Socket.IO's default message cap is 1 MB.
  const io = new Server(httpServer, { maxHttpBufferSize: 3_000_000 });
  const transport = {
    send: (socketId: string, event: string, payload: unknown) => {
      io.to(socketId).emit(event, payload);
    },
    detach: (socketId: string, reason: string) => {
      io.to(socketId).emit('kicked', { reason });
      rooms?.unbind(socketId);
    },
  };
  const manager = new RoomManager(options.starterMap, transport, options.rooms);
  rooms = manager;
  attachHandlers(io, manager, options.rateLimit ?? { max: 40, windowMs: 5_000 });
  const sweep = setInterval(() => manager.sweep(), options.sweepIntervalMs ?? 60_000);
  sweep.unref();
  return {
    httpServer,
    io,
    rooms,
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweep);
        for (const room of rooms.rooms.values()) room.dispose();
        io.close(() => resolve());
      }),
  };
}
