import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every map in assets/maps that uses a /maps/ background image must ship that file in assets/maps/images,
// which the server serves at /maps.
const root = resolve(import.meta.dirname, '..');

describe('map background images', () => {
  it('exist for every map that references one', () => {
    const maps = readdirSync(resolve(root, 'assets/maps')).filter((f) => f.endsWith('.map.json'));
    expect(maps.length).toBeGreaterThan(0);
    for (const file of maps) {
      const src: string | undefined = JSON.parse(readFileSync(resolve(root, 'assets/maps', file), 'utf8')).terrain?.image?.src;
      if (!src?.startsWith('/maps/')) continue;
      expect(existsSync(resolve(root, 'assets/maps/images', src.slice('/maps/'.length))), `${file}: ${src}`).toBe(true);
    }
  });
});
