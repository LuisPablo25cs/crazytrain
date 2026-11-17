import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The city label art data (assets/city_labels) must name real cities of the default map.
const root = resolve(import.meta.dirname, '..');
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const cityIds = new Set<string>(read('assets/maps/north-america.map.json').cities.map((c: { id: string }) => c.id));

describe('city label art data', () => {
  it('maps Canva pages to existing cities, one page per city', () => {
    const pages: Record<string, string | { city: string }> = read('assets/city_labels/pages.json').pages;
    const cities = Object.values(pages).map((p) => (typeof p === 'string' ? p : p.city));
    for (const id of cities) expect(cityIds.has(id), id).toBe(true);
    expect(new Set(cities).size).toBe(cities.length);
  });

  it('lists hazards only for existing cities', () => {
    const hazards: Record<string, unknown> = read('assets/city_labels/hazards.json');
    for (const [kind, value] of Object.entries(hazards)) {
      if (kind.startsWith('$')) continue;
      const ids = Array.isArray(value) ? value : Object.values(value as Record<string, string[]>).flat();
      for (const id of ids) expect(cityIds.has(id), `${kind}: ${id}`).toBe(true);
    }
  });

  it('maps the Seasons placeholders to existing cities, one picture per city', () => {
    const cfg: { files: Record<string, string> } = read('assets/city_placeholders/cities.json');
    const ids = Object.values(cfg.files);
    for (const id of ids) expect(cityIds.has(id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a name picture and marker colors for every city pin', () => {
    const index: Record<string, { name: [number, number]; fill: string; ring: string }> = read('assets/web/city-pins/index.json');
    for (const [id, pin] of Object.entries(index)) {
      expect(cityIds.has(id), id).toBe(true);
      expect(existsSync(resolve(root, 'assets/web/city-pins', `${id}-name.webp`)), id).toBe(true);
      expect(pin.name[0]).toBeGreaterThan(0);
      expect(pin.name[1]).toBeGreaterThan(0);
      expect(pin.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pin.ring).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

});
