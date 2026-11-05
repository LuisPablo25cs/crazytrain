import { describe, expect, it } from 'vitest';
import { MapSchema, validateMap, type MapDefinition } from '@rails/shared';
import tiny from '../../../../packages/shared/test/fixtures/tiny.map.json' with { type: 'json' };
import {
  addCity,
  addLane,
  addRoute,
  commit,
  deleteCity,
  deleteRoute,
  indexDoc,
  lanesOf,
  moveCity,
  moveSlots,
  placedSlots,
  recalcTicketPoints,
  redo,
  renameCity,
  renameCityWithId,
  resampleSlots,
  resetSlots,
  resizeSlots,
  restoreRouteProps,
  rotateSlots,
  setFerryLocomotives,
  setRouteColor,
  setRouteKind,
  setRouteLength,
  slugify,
  straightenRoute,
  undo,
} from './mapOps.js';

const base = (): MapDefinition => MapSchema.parse(structuredClone(tiny));
const ROUTE = 'bravo-charlie'; // length 3
const valid = (doc: MapDefinition) => validateMap(doc).ok;

describe('slots', () => {
  it('copies automatic slots the first time, then moves only the chosen slot', () => {
    const doc = base();
    const before = placedSlots(doc, indexDoc(doc), ROUTE);
    const next = moveSlots(doc, indexDoc(doc), { routeId: ROUTE, index: 1 }, 5, -2);
    expect(doc.routes.find((r) => r.id === ROUTE)!.slots).toBeUndefined();
    const after = next.routes.find((r) => r.id === ROUTE)!.slots!;
    expect(after[1]!.x).toBeCloseTo(before[1]!.x + 5);
    expect(after[0]).toEqual(before[0]);
    expect(valid(next)).toBe(true);
  });

  it('rotates a route around its center', () => {
    const doc = base();
    const before = placedSlots(doc, indexDoc(doc), ROUTE);
    const after = rotateSlots(doc, indexDoc(doc), { routeId: ROUTE, index: 'all' }, Math.PI / 2).routes.find((r) => r.id === ROUTE)!.slots!;
    const cx = (ss: { x: number }[]) => ss.reduce((n, s) => n + s.x, 0) / ss.length;
    expect(cx(after)).toBeCloseTo(cx(before), 1);
  });

  it('resizes, straightens and resets slots', () => {
    const doc = base();
    const sized = resizeSlots(doc, indexDoc(doc), { routeId: ROUTE, index: 0 }, -1000, 2);
    expect(sized.routes.find((r) => r.id === ROUTE)!.slots![0]!.length).toBe(1);
    const bent = moveSlots(doc, indexDoc(doc), { routeId: ROUTE, index: 1 }, 0, 30);
    const [a, m, b] = straightenRoute(bent, indexDoc(bent), ROUTE).routes.find((r) => r.id === ROUTE)!.slots!;
    expect(m!.y).toBeCloseTo((a!.y + b!.y) / 2, 1);
    expect(resetSlots(bent, ROUTE).routes.find((r) => r.id === ROUTE)!.slots).toBeUndefined();
  });

  it('extends slots along the last spacing', () => {
    expect(resampleSlots([{ x: 0, y: 0, angle: 0 }, { x: 10, y: 0, angle: 0 }], 4).map((s) => s.x)).toEqual([0, 10, 20, 30]);
  });
});

describe('route properties', () => {
  it('recolors one lane only', () => {
    const next = setRouteColor(base(), 'alpha-bravo-1', 'green');
    expect(next.routes.find((r) => r.id === 'alpha-bravo-1')!.color).toBe('green');
    expect(next.routes.find((r) => r.id === 'alpha-bravo-2')!.color).toBe('blue');
  });

  it('sets the length of every lane up to 10, with placed slots following', () => {
    const doc = base();
    const placed = moveSlots(doc, indexDoc(doc), { routeId: 'alpha-bravo-1', index: 0 }, 1, 0);
    const next = setRouteLength(placed, 'alpha-bravo-1', 10);
    expect(next.routes.filter((r) => r.parallelGroup === 'alpha-bravo').map((r) => r.length)).toEqual([10, 10]);
    expect(next.routes.find((r) => r.id === 'alpha-bravo-1')!.slots).toHaveLength(10);
    expect(valid(next)).toBe(true);
  });

  it('turns a route into a ferry with locomotives, and back', () => {
    const ferry = setFerryLocomotives(setRouteKind(base(), ROUTE, 'ferry'), ROUTE, 2);
    expect(ferry.routes.find((r) => r.id === ROUTE)).toMatchObject({ kind: 'ferry', ferryLocomotives: 2 });
    expect(setFerryLocomotives(ferry, ROUTE, 9).routes.find((r) => r.id === ROUTE)!.ferryLocomotives).toBe(3);
    const normal = setRouteKind(ferry, ROUTE, 'normal');
    expect(normal.routes.find((r) => r.id === ROUTE)).toMatchObject({ kind: 'normal', ferryLocomotives: 0 });
    expect(valid(normal)).toBe(true);
  });

  it('restores color, length and kind from the last saved map', () => {
    const saved = base();
    const changed = setRouteKind(setRouteLength(setRouteColor(saved, ROUTE, 'red'), ROUTE, 6), ROUTE, 'tunnel');
    expect(restoreRouteProps(changed, saved, ROUTE).routes.find((r) => r.id === ROUTE)).toMatchObject({ color: 'gray', length: 3, kind: 'normal' });
  });
});

describe('cities', () => {
  it('adds a city with a unique id from its name', () => {
    const { doc, id } = addCity(base(), 50, 60, 'Mérida');
    expect(id).toBe('merida');
    expect(addCity(doc, 1, 1, 'Mérida').id).toBe('merida-2');
    expect(addCity(doc, 1, 1).id).toBe('new-city-1');
    expect(slugify('Ciudad de México')).toBe('ciudad-de-mexico');
  });

  it('renames a city but keeps its id, and ignores empty names', () => {
    const doc = renameCity(base(), 'alpha', 'Alfa Town');
    expect(doc.cities.find((c) => c.id === 'alpha')!.name).toBe('Alfa Town');
    expect(renameCity(doc, 'alpha', '   ')).toBe(doc);
  });

  it('gives a new city an id from its new name, updating its routes and tickets', () => {
    const added = addCity(base(), 10, 10);
    const linked = addRoute(addRoute(added.doc, added.id, 'alpha', 10).doc, added.id, 'alpha', 10).doc;
    const withTicket = { ...linked, tickets: [...linked.tickets, { id: `${added.id}-golf`, from: added.id, to: 'golf', points: 5, deck: 'regular' as const }] };
    const { doc, id } = renameCityWithId(withTicket, added.id, 'Port Royal');
    expect(id).toBe('port-royal');
    expect(doc.cities.some((c) => c.id === added.id)).toBe(false);
    expect(doc.routes.filter((r) => r.from === 'port-royal').map((r) => r.id)).toEqual(['port-royal-alpha', 'port-royal-alpha-2']);
    expect(doc.routes.find((r) => r.id === 'port-royal-alpha')!.parallelGroup).toBe('port-royal-alpha');
    expect(doc.tickets.find((t) => t.from === 'port-royal')!.id).toBe('port-royal-golf');
    expect(valid({ ...doc, tickets: doc.tickets })).toBe(true);
  });

  it('moves a city and automatic routes follow', () => {
    const doc = base();
    const moved = moveCity(doc, 'bravo', 300, 400);
    expect(placedSlots(moved, indexDoc(moved), ROUTE)[0]!.y).not.toBeCloseTo(placedSlots(doc, indexDoc(doc), ROUTE)[0]!.y);
  });

  it('deletes a city with its routes and tickets', () => {
    const { doc, routes, tickets } = deleteCity(base(), 'hotel');
    expect(routes).toBe(3);
    expect(tickets).toBeGreaterThan(0);
    expect(doc.routes.some((r) => r.from === 'hotel' || r.to === 'hotel')).toBe(false);
    expect(doc.tickets.some((t) => t.from === 'hotel' || t.to === 'hotel')).toBe(false);
  });
});

describe('routes', () => {
  it('connects two cities with a gray route of an estimated length', () => {
    const { doc, id } = addRoute(base(), 'alpha', 'golf', 10);
    const route = doc.routes.find((r) => r.id === id)!;
    expect(route).toMatchObject({ from: 'alpha', to: 'golf', color: 'gray', kind: 'normal' });
    expect(route.length).toBeGreaterThanOrEqual(1);
    expect(route.length).toBeLessThanOrEqual(10);
    expect(valid(doc)).toBe(true);
  });

  it('adds a lane when the cities are already connected, up to three', () => {
    let doc = base();
    const first = addRoute(doc, 'alpha', 'delta', 10);
    doc = first.doc;
    expect(lanesOf(doc, 'alpha-delta')).toEqual(['alpha-delta', first.id]);
    expect(doc.routes.find((r) => r.id === 'alpha-delta')!.parallelGroup).toBe('alpha-delta');
    expect(valid(doc)).toBe(true);
    doc = addLane(doc, 'alpha-delta').doc;
    expect(lanesOf(doc, 'alpha-delta')).toHaveLength(3);
    expect(addLane(doc, 'alpha-delta').id).toBeNull();
  });

  it('deletes a lane; a lane left alone stops being a group', () => {
    const doc = deleteRoute(base(), 'alpha-bravo-2');
    expect(doc.routes.find((r) => r.id === 'alpha-bravo-1')!.parallelGroup).toBeUndefined();
    expect(valid(doc)).toBe(true);
  });

  it('recalculates ticket points from shortest paths', () => {
    expect(base().tickets.find((t) => t.id === 'golf-hotel')!.points).toBe(1);
    // Lengthening Golf-Hotel to 5 makes the detour through Foxtrot (2 + 3) just as short.
    const doc = recalcTicketPoints(setRouteLength(base(), 'golf-hotel', 5));
    expect(doc.tickets.find((t) => t.id === 'golf-hotel')!.points).toBe(5);
  });
});

describe('undo history', () => {
  it('undoes and redoes; a new edit clears redo', () => {
    const a = base();
    const b = moveCity(a, 'alpha', 1, 1);
    const c = moveCity(b, 'alpha', 2, 2);
    let h = commit(commit({ past: [], present: a, future: [] }, b), c);
    h = undo(h);
    expect(h.present).toBe(b);
    expect(redo(h).present).toBe(c);
    expect(commit(h, moveCity(b, 'alpha', 9, 9)).future).toEqual([]);
  });
});
