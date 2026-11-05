import { describe, expect, it } from 'vitest';
import { validateMap } from '../src/index.js';
import starter from '../../../assets/maps/north-america.map.json' with { type: 'json' };

const CANADA = ['prince-rupert', 'jasper', 'edmonton', 'regina', 'churchill', 'ottawa', 'quebec', 'halifax'];
const MEXICO = [
  'hermosillo',
  'ciudad-obregon',
  'chihuahua',
  'saltillo',
  'monterrey',
  'aguascalientes',
  'guadalajara',
  'ciudad-de-mexico',
  'veracruz',
  'merida',
];
const REFERENCE = [
  'vancouver', 'seattle', 'portland', 'san-francisco', 'los-angeles', 'las-vegas', 'phoenix', 'el-paso',
  'santa-fe', 'salt-lake-city', 'helena', 'denver', 'omaha', 'duluth', 'kansas-city', 'oklahoma-city',
  'dallas', 'houston', 'little-rock', 'new-orleans', 'saint-louis', 'chicago', 'nashville', 'atlanta',
  'charleston', 'miami', 'raleigh', 'washington', 'pittsburgh', 'new-york', 'boston', 'calgary',
  'winnipeg', 'sault-st-marie', 'toronto', 'montreal',
];

describe('North America starter map', () => {
  const result = validateMap(starter);

  it('passes the validator with no errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('holds every city named in R15', () => {
    const ids = new Set(starter.cities.map((c) => c.id));
    for (const id of [...REFERENCE, ...CANADA, ...MEXICO, 'la-habana']) expect(ids, id).toContain(id);
    expect(ids.size).toBe(55);
  });

  it('has at least 9 long tickets, enough for 7 players', () => {
    expect(starter.tickets.filter((t) => t.deck === 'long').length).toBeGreaterThanOrEqual(9);
  });

  it('gives every ferry at least 1 locomotive', () => {
    const ferries = starter.routes.filter((r) => r.kind === 'ferry');
    expect(ferries.length).toBeGreaterThan(0);
    for (const f of ferries) expect(f.ferryLocomotives, f.id).toBeGreaterThanOrEqual(1);
  });

  it('uses a background image that covers the whole map, with every city on it', () => {
    const image = starter.terrain.image!;
    expect(image.src.startsWith('/maps/')).toBe(true);
    expect([image.width, image.height]).toEqual([starter.width, starter.height]);
    for (const c of starter.cities) {
      expect(c.x, c.id).toBeGreaterThanOrEqual(0);
      expect(c.x, c.id).toBeLessThanOrEqual(starter.width);
      expect(c.y, c.id).toBeGreaterThanOrEqual(0);
      expect(c.y, c.id).toBeLessThanOrEqual(starter.height);
    }
  });

  it('keeps colors balanced: no color above 1.5x the rarest', () => {
    if (!result.ok) throw new Error('invalid map');
    const counts = Object.entries(result.stats.byColor)
      .filter(([c]) => c !== 'gray')
      .map(([, v]) => v.trains);
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThanOrEqual(1.5);
  });
});
