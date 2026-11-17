import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '../src/http.js';

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

describe('/api/art', () => {
  it('lists the cities that have label art and serves it', async () => {
    const artDir = mkdtempSync(join(tmpdir(), 'rails-art-'));
    mkdirSync(join(artDir, 'cities'));
    writeFileSync(join(artDir, 'cities', 'calgary.webp'), 'x');
    writeFileSync(join(artDir, 'cities', 'notes.txt'), 'x');
    const url = await listen(createHttpApp({ artDir }));
    const art = (await (await fetch(`${url}/api/art`)).json()) as { cityLabels: string[] };
    expect(art.cityLabels).toEqual(['calgary']);
    expect((await fetch(`${url}/art/cities/calgary.webp`)).status).toBe(200);
  });

  it('lists no city labels when there is no art folder', async () => {
    const url = await listen(createHttpApp({}));
    const art = (await (await fetch(`${url}/api/art`)).json()) as { cityLabels: string[]; cityPins: boolean };
    expect(art.cityLabels).toEqual([]);
    expect(art.cityPins).toBe(false);
  });

  it('says when the Seasons city pins are there', async () => {
    const artDir = mkdtempSync(join(tmpdir(), 'rails-art-'));
    mkdirSync(join(artDir, 'city-pins'));
    writeFileSync(join(artDir, 'city-pins', 'index.json'), '{}');
    const url = await listen(createHttpApp({ artDir }));
    const art = (await (await fetch(`${url}/api/art`)).json()) as { cityPins: boolean };
    expect(art.cityPins).toBe(true);
  });

  it('lists the tickets that have a picture', async () => {
    const artDir = mkdtempSync(join(tmpdir(), 'rails-art-'));
    mkdirSync(join(artDir, 'tickets'));
    writeFileSync(join(artDir, 'tickets', 'new-york-merida.webp'), 'x');
    const url = await listen(createHttpApp({ artDir }));
    const art = (await (await fetch(`${url}/api/art`)).json()) as { tickets: string[] };
    expect(art.tickets).toEqual(['new-york-merida']);
    expect((await fetch(`${url}/art/tickets/new-york-merida.webp`)).status).toBe(200);
  });
});
