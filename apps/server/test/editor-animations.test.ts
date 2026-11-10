import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { editorRoutes } from '../src/editor.js';
import { createHttpApp } from '../src/http.js';

const closers: (() => void)[] = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
});

async function start(): Promise<{ url: string; dir: string }> {
  const dir = join(mkdtempSync(join(tmpdir(), 'rails-anim-')), 'animations');
  const app = createHttpApp({ extraRoutes: editorRoutes({ mapFile: 'unused', onSaved: () => {}, animationsDir: dir }) });
  const server = app.listen(0);
  closers.push(() => server.close());
  await new Promise((r) => server.once('listening', r));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, dir };
}

const GIF = Buffer.from('GIF89a-frames').toString('base64');
const body = { effect: 'volcano', output: { width: 100 }, params: { bombs: 3 }, gif: GIF };
const put = (url: string, name: string, data: unknown) =>
  fetch(`${url}/api/editor/animations/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

describe('animation endpoints', () => {
  it('saves the GIF with its settings, and lists them for reloading', async () => {
    const { url, dir } = await start();
    expect((await put(url, 'big-volcano', body)).status).toBe(200);
    expect(readFileSync(join(dir, 'big-volcano.gif'), 'latin1')).toBe('GIF89a-frames');
    expect(readdirSync(dir).sort()).toEqual(['big-volcano.gif', 'big-volcano.json']);

    const { animations } = (await (await fetch(`${url}/api/editor/animations`)).json()) as { animations: unknown[] };
    expect(animations).toEqual([{ name: 'big-volcano', effect: 'volcano', output: { width: 100 }, params: { bombs: 3 } }]);
  });

  it('lists nothing before the first save', async () => {
    const { url } = await start();
    expect(await (await fetch(`${url}/api/editor/animations`)).json()).toEqual({ animations: [] });
  });

  it('refuses names that are not plain file names', async () => {
    const { url, dir } = await start();
    for (const name of ['..%2Fevil', 'UPPER', '.hidden', 'a%5Cb']) {
      const res = await put(url, name, body);
      expect(res.status, name).toBe(422);
    }
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses anything that is not a GIF', async () => {
    const { url, dir } = await start();
    const res = await put(url, 'fake', { ...body, gif: Buffer.from('<script>').toString('base64') });
    expect(res.status).toBe(422);
    expect(existsSync(dir)).toBe(false);
  });
});
