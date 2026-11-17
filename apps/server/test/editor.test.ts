import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MapDefinition } from '@rails/shared';
import { createRailsServer } from '../src/app.js';
import { editorRoutes } from '../src/editor.js';
import { createHttpApp } from '../src/http.js';
import { tinyMap } from './harness.js';

const repo = resolve(import.meta.dirname, '../../..');
const closers: (() => void)[] = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
});

async function listen(app: ReturnType<typeof createHttpApp>): Promise<string> {
  const server = app.listen(0);
  closers.push(() => server.close());
  await new Promise((r) => server.once('listening', r));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

/** A copy of the real default map in a temp folder. */
function mapCopy(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'rails-editor-')), 'map.json');
  cpSync(resolve(repo, 'assets/maps/north-america.map.json'), file);
  return file;
}

const put = (url: string, body: unknown) =>
  fetch(`${url}/api/editor/map`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('map editor endpoints', () => {
  it('loads the map, saves an edited map marked as edited, and hands it to new rooms', async () => {
    const mapFile = mapCopy();
    const saved: MapDefinition[] = [];
    const url = await listen(createHttpApp({ extraRoutes: editorRoutes({ mapFile, onSaved: (m) => saved.push(m) }) }));
    const { map } = (await (await fetch(`${url}/api/editor`)).json()) as { map: MapDefinition };
    expect(map.cities).toHaveLength(61);

    // A new city with a new route, and a recolored, longer route.
    map.cities.push({ id: 'atlantis', name: 'Atlantis', x: 900, y: 500, major: false });
    map.routes.push({ id: 'miami-atlantis', from: 'miami', to: 'atlantis', length: 9, color: 'blue', kind: 'ferry', ferryLocomotives: 2 });
    const res = await put(url, map);
    expect(res.status).toBe(200);

    const written = JSON.parse(readFileSync(mapFile, 'utf8')) as MapDefinition;
    expect(written.edited).toBe(true);
    expect(written.cities.find((c) => c.id === 'atlantis')).toMatchObject({ x: 900, y: 500 });
    expect(written.routes.find((r) => r.id === 'miami-atlantis')).toMatchObject({ length: 9, kind: 'ferry' });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.routes.some((r) => r.id === 'miami-atlantis')).toBe(true);
  });

  it('rejects an invalid map with the reasons and leaves the file alone', async () => {
    const mapFile = mapCopy();
    const before = readFileSync(mapFile, 'utf8');
    const url = await listen(createHttpApp({ extraRoutes: editorRoutes({ mapFile, onSaved: () => {} }) }));
    const map = JSON.parse(before) as MapDefinition;
    map.routes[0]!.to = 'nowhere';
    map.routes[1]!.length = 11;
    const res = await put(url, map);
    expect(res.status).toBe(422);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(/missing city "nowhere"/);
    expect(error).toMatch(/stops at 10/);
    expect(readFileSync(mapFile, 'utf8')).toBe(before);
  });

  it('is off unless the server is started with the editor', async () => {
    const server = createRailsServer({ starterMap: tinyMap() });
    await new Promise<void>((r) => server.httpServer.listen(0, r));
    closers.push(() => void server.close());
    const port = (server.httpServer.address() as AddressInfo).port;
    expect((await fetch(`http://localhost:${port}/api/editor`)).status).toBe(404);
  });

  it('serves art under /art', async () => {
    const url = await listen(createHttpApp({ artDir: resolve(repo, 'assets/web') }));
    for (const path of ['/art/slots/red_normal.webp', '/art/slots/gray_tunnel.webp', '/art/cards/locomotive.webp']) {
      const res = await fetch(`${url}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/webp/);
    }
  });
});
