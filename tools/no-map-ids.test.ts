import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import starter from '../assets/maps/north-america.map.json' with { type: 'json' };

// R18: engine, server and client code must not depend on a specific map.
const root = resolve(import.meta.dirname, '..');
const codeDirs = ['packages/shared/src', 'apps/server/src', 'apps/client/src'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('map independence (R18)', () => {
  it('has no starter-map city ids in engine, server or client code', () => {
    const ids = starter.cities.map((c) => c.id);
    const hits: string[] = [];
    for (const dir of codeDirs) {
      for (const file of files(resolve(root, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const id of ids) if (text.includes(`'${id}'`) || text.includes(`"${id}"`)) hits.push(`${file}: ${id}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
