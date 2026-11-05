import {
  indexMap,
  suggestTicketPoints,
  type City,
  type MapDefinition,
  type MapIndex,
  type Route,
  type RouteColor,
  type RouteKind,
  type RouteSlot,
} from '@rails/shared';
import { slotTransforms } from '../board/geometry.js';

/**
 * Pure edits of a whole map for the map editor. Every function returns a new map; the input is
 * never changed, so undo is a list of past maps. The map file is the design.
 */

export type MapDoc = MapDefinition;

export function indexDoc(doc: MapDoc): MapIndex {
  return indexMap(doc);
}

/** Most lanes a route may have side by side. */
export const MAX_LANES = 3;

const round = (n: number) => Math.round(n * 100) / 100;

function cleanSlot(s: RouteSlot): RouteSlot {
  return {
    x: round(s.x),
    y: round(s.y),
    angle: Math.round(s.angle * 10000) / 10000,
    ...(s.length !== undefined ? { length: round(s.length) } : {}),
    ...(s.width !== undefined ? { width: round(s.width) } : {}),
  };
}

function updateRoute(doc: MapDoc, routeId: string, change: (r: Route) => Route): MapDoc {
  return { ...doc, routes: doc.routes.map((r) => (r.id === routeId ? change(r) : r)) };
}

function updateCity(doc: MapDoc, cityId: string, change: (c: City) => City): MapDoc {
  return { ...doc, cities: doc.cities.map((c) => (c.id === cityId ? change(c) : c)) };
}

/** Every lane of the route's parallel group (just the route when it has no group). */
export function lanesOf(doc: MapDoc, routeId: string): string[] {
  const route = doc.routes.find((r) => r.id === routeId);
  if (!route?.parallelGroup) return route ? [route.id] : [];
  return doc.routes.filter((r) => r.parallelGroup === route.parallelGroup).map((r) => r.id);
}

// --- Slots ----------------------------------------------------------------------------------

/** A route's current slots (automatic or placed), with explicit sizes. */
export function placedSlots(doc: MapDoc, index: MapIndex, routeId: string): RouteSlot[] {
  const route = index.routes.get(routeId);
  if (!route) return [];
  if (route.slots && route.slots.length === route.length) return route.slots.map((s) => ({ ...s }));
  return slotTransforms(route, index).map((t) => cleanSlot({ x: t.x, y: t.y, angle: t.angle, length: t.length, width: t.width }));
}

function withSlots(doc: MapDoc, routeId: string, slots: RouteSlot[]): MapDoc {
  return updateRoute(doc, routeId, (r) => ({ ...r, slots: slots.map(cleanSlot) }));
}

/** Which slots an edit touches: one slot, or every slot of the route. */
export type Target = { routeId: string; index: number | 'all' };

function edit(doc: MapDoc, index: MapIndex, target: Target, change: (s: RouteSlot) => RouteSlot): MapDoc {
  const slots = placedSlots(doc, index, target.routeId);
  if (slots.length === 0) return doc;
  return withSlots(doc, target.routeId, slots.map((s, i) => (target.index === 'all' || target.index === i ? change(s) : s)));
}

export function moveSlots(doc: MapDoc, index: MapIndex, target: Target, dx: number, dy: number): MapDoc {
  return edit(doc, index, target, (s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
}

/** Rotate one slot in place, or a whole route around its center. */
export function rotateSlots(doc: MapDoc, index: MapIndex, target: Target, radians: number): MapDoc {
  const slots = placedSlots(doc, index, target.routeId);
  const cx = slots.reduce((n, s) => n + s.x, 0) / Math.max(1, slots.length);
  const cy = slots.reduce((n, s) => n + s.y, 0) / Math.max(1, slots.length);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return edit(doc, index, target, (s) => {
    if (target.index !== 'all') return { ...s, angle: s.angle + radians };
    const dx = s.x - cx;
    const dy = s.y - cy;
    return { ...s, x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos, angle: s.angle + radians };
  });
}

export function resizeSlots(doc: MapDoc, index: MapIndex, target: Target, dLength: number, dWidth: number): MapDoc {
  return edit(doc, index, target, (s) => ({
    ...s,
    length: Math.max(1, (s.length ?? 10) + dLength),
    width: Math.max(1, (s.width ?? 5) + dWidth),
  }));
}

/** Spread a route's slots evenly on the straight line from its first slot to its last. */
export function straightenRoute(doc: MapDoc, index: MapIndex, routeId: string): MapDoc {
  const slots = placedSlots(doc, index, routeId);
  if (slots.length < 2) return doc;
  const a = slots[0]!;
  const b = slots[slots.length - 1]!;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const n = slots.length - 1;
  return withSlots(
    doc,
    routeId,
    slots.map((s, i) => ({ ...s, x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, angle })),
  );
}

/** Back to automatic slots that follow the cities. */
export function resetSlots(doc: MapDoc, routeId: string): MapDoc {
  return updateRoute(doc, routeId, ({ slots: _slots, ...r }) => r);
}

/** Keep the first n slots, or add slots that continue the route's last spacing. */
export function resampleSlots(slots: RouteSlot[], n: number): RouteSlot[] {
  if (slots.length >= n) return slots.slice(0, n);
  const out = slots.map((s) => ({ ...s }));
  const last = out[out.length - 1]!;
  const prev = out[out.length - 2];
  const step = prev
    ? { x: last.x - prev.x, y: last.y - prev.y }
    : { x: Math.cos(last.angle) * ((last.length ?? 10) + 1.4), y: Math.sin(last.angle) * ((last.length ?? 10) + 1.4) };
  while (out.length < n) {
    const tail = out[out.length - 1]!;
    out.push({ ...tail, x: tail.x + step.x, y: tail.y + step.y });
  }
  return out;
}

// --- Route properties -----------------------------------------------------------------------

export function setRouteColor(doc: MapDoc, routeId: string, color: RouteColor): MapDoc {
  return updateRoute(doc, routeId, (r) => ({ ...r, color }));
}

/** Set the length of every lane; placed slots grow or shrink to match, ferry locomotives stay within it. */
export function setRouteLength(doc: MapDoc, routeId: string, length: number): MapDoc {
  let next = doc;
  for (const lane of lanesOf(doc, routeId)) {
    next = updateRoute(next, lane, (r) => ({
      ...r,
      length,
      ferryLocomotives: Math.min(r.ferryLocomotives, length),
      ...(r.slots ? { slots: resampleSlots(r.slots, length).map(cleanSlot) } : {}),
    }));
  }
  return next;
}

/** Set the kind of every lane. A ferry needs at least one locomotive; other kinds need none. */
export function setRouteKind(doc: MapDoc, routeId: string, kind: RouteKind): MapDoc {
  let next = doc;
  for (const lane of lanesOf(doc, routeId)) {
    next = updateRoute(next, lane, (r) => ({
      ...r,
      kind,
      ferryLocomotives: kind === 'ferry' ? Math.min(r.length, Math.max(1, r.ferryLocomotives)) : 0,
    }));
  }
  return next;
}

/**
 * Bend a route into an arc, in map units from the straight line (see Route.bend). Every lane
 * bends together, mirrored for lanes that run the other way. Hand-placed slots are dropped so the
 * slots follow the new curve; a bend of 0 makes the route straight again.
 */
export function setRouteBend(doc: MapDoc, routeId: string, bend: number): MapDoc {
  const anchor = doc.routes.find((r) => r.id === routeId);
  if (!anchor) return doc;
  let next = doc;
  for (const lane of lanesOf(doc, routeId)) {
    next = updateRoute(next, lane, ({ slots: _slots, bend: _bend, ...r }) => {
      const signed = r.from === anchor.from ? bend : -bend;
      return bend === 0 ? r : { ...r, bend: signed };
    });
  }
  return next;
}

export function setFerryLocomotives(doc: MapDoc, routeId: string, count: number): MapDoc {
  let next = doc;
  for (const lane of lanesOf(doc, routeId)) {
    next = updateRoute(next, lane, (r) => (r.kind === 'ferry' ? { ...r, ferryLocomotives: Math.max(1, Math.min(r.length, count)) } : r));
  }
  return next;
}

/** Copy color, length, kind and ferry locomotives back from another version of the map (the last save). */
export function restoreRouteProps(doc: MapDoc, original: MapDoc, routeId: string): MapDoc {
  let next = doc;
  for (const lane of lanesOf(doc, routeId)) {
    const o = original.routes.find((r) => r.id === lane);
    if (!o) continue;
    next = updateRoute(next, lane, (r) => ({
      ...r,
      ...(lane === routeId ? { color: o.color } : {}),
      length: o.length,
      kind: o.kind,
      ferryLocomotives: o.ferryLocomotives,
      ...(r.slots ? { slots: resampleSlots(r.slots, o.length).map(cleanSlot) } : {}),
    }));
  }
  return next;
}

// --- Cities ---------------------------------------------------------------------------------

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function moveCity(doc: MapDoc, cityId: string, x: number, y: number): MapDoc {
  return updateCity(doc, cityId, (c) => ({ ...c, x: round(x), y: round(y) }));
}

export function addCity(doc: MapDoc, x: number, y: number, name?: string): { doc: MapDoc; id: string } {
  const taken = new Set(doc.cities.map((c) => c.id));
  let label = name;
  if (!label) {
    let n = 1;
    while (taken.has(slugify(`New city ${n}`))) n++;
    label = `New city ${n}`;
  }
  const id = uniqueId(slugify(label), taken);
  const city: City = { id, name: label, x: round(x), y: round(y), major: false };
  return { doc: { ...doc, cities: [...doc.cities, city] }, id };
}

/** Rename a city. Its id stays, so routes and tickets keep pointing at it. */
export function renameCity(doc: MapDoc, cityId: string, name: string): MapDoc {
  const trimmed = name.trim();
  return trimmed ? updateCity(doc, cityId, (c) => ({ ...c, name: trimmed })) : doc;
}

/**
 * Rename a city and give it an id from the new name, updating every route and ticket that uses it.
 * Meant for cities added since the last save, whose ids came from a placeholder name.
 */
export function renameCityWithId(doc: MapDoc, cityId: string, name: string): { doc: MapDoc; id: string } {
  const renamed = renameCity(doc, cityId, name);
  if (renamed === doc) return { doc, id: cityId };
  const taken = new Set(doc.cities.map((c) => c.id).filter((id) => id !== cityId));
  const id = uniqueId(slugify(name), taken);
  if (id === cityId) return { doc: renamed, id };
  const swap = (v: string) => (v === cityId ? id : v);
  // Route ids and groups were built from city ids ("from-to"), so they follow too.
  const swapInId = (v: string) => v.split(cityId).join(id);
  const routeIds = new Set(doc.routes.map((r) => r.id));
  return {
    id,
    doc: {
      ...renamed,
      cities: renamed.cities.map((c) => (c.id === cityId ? { ...c, id } : c)),
      routes: renamed.routes.map((r) => {
        if (r.from !== cityId && r.to !== cityId) return r;
        const newId = swapInId(r.id);
        return {
          ...r,
          id: routeIds.has(newId) && newId !== r.id ? r.id : newId,
          from: swap(r.from),
          to: swap(r.to),
          ...(r.parallelGroup ? { parallelGroup: swapInId(r.parallelGroup) } : {}),
        };
      }),
      tickets: renamed.tickets.map((t) =>
        t.from === cityId || t.to === cityId ? { ...t, id: swapInId(t.id), from: swap(t.from), to: swap(t.to) } : t,
      ),
    },
  };
}

export function setCityMajor(doc: MapDoc, cityId: string, major: boolean): MapDoc {
  return updateCity(doc, cityId, (c) => ({ ...c, major }));
}

/** Delete a city with its routes and tickets. */
export function deleteCity(doc: MapDoc, cityId: string): { doc: MapDoc; routes: number; tickets: number } {
  const routes = doc.routes.filter((r) => r.from === cityId || r.to === cityId).map((r) => r.id);
  let next: MapDoc = { ...doc, cities: doc.cities.filter((c) => c.id !== cityId) };
  for (const id of routes) next = deleteRoute(next, id);
  const tickets = next.tickets.filter((t) => t.from === cityId || t.to === cityId).length;
  next = { ...next, tickets: next.tickets.filter((t) => t.from !== cityId && t.to !== cityId) };
  return { doc: next, routes: routes.length, tickets };
}

// --- Routes ---------------------------------------------------------------------------------

/** A sensible length for a new route: its distance over the map's typical distance per train. */
export function estimateLength(doc: MapDoc, from: string, to: string, maxLength: number): number {
  const at = new Map(doc.cities.map((c) => [c.id, c]));
  const perTrain = doc.routes
    .filter((r) => !r.slots && !r.path)
    .map((r) => {
      const a = at.get(r.from);
      const b = at.get(r.to);
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) / r.length : 0;
    })
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const median = perTrain[Math.floor(perTrain.length / 2)] ?? 24;
  const a = at.get(from)!;
  const b = at.get(to)!;
  return Math.max(1, Math.min(maxLength, Math.round(Math.hypot(a.x - b.x, a.y - b.y) / median)));
}

/**
 * Connect two cities. If they are already connected, this adds a lane next to the existing route
 * (up to MAX_LANES). Returns the new route id, or null when nothing was added.
 */
export function addRoute(doc: MapDoc, from: string, to: string, maxLength: number): { doc: MapDoc; id: string | null } {
  if (from === to) return { doc, id: null };
  const existing = doc.routes.find((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
  if (existing) return addLane(doc, existing.id);
  const id = uniqueId(`${from}-${to}`, new Set(doc.routes.map((r) => r.id)));
  const route: Route = { id, from, to, length: estimateLength(doc, from, to, maxLength), color: 'gray', kind: 'normal', ferryLocomotives: 0 };
  return { doc: { ...doc, routes: [...doc.routes, route] }, id };
}

/** Add a lane beside a route: same cities, length and kind; gray. */
export function addLane(doc: MapDoc, routeId: string): { doc: MapDoc; id: string | null } {
  const route = doc.routes.find((r) => r.id === routeId);
  if (!route || lanesOf(doc, routeId).length >= MAX_LANES) return { doc, id: null };
  const group = route.parallelGroup ?? route.id;
  const taken = new Set(doc.routes.map((r) => r.id));
  let n = lanesOf(doc, routeId).length + 1;
  while (taken.has(`${group}-${n}`)) n++;
  const lane: Route = {
    id: `${group}-${n}`,
    from: route.from,
    to: route.to,
    length: route.length,
    color: 'gray',
    kind: route.kind,
    ferryLocomotives: route.ferryLocomotives,
    parallelGroup: group,
  };
  const grouped = updateRoute(doc, routeId, (r) => ({ ...r, parallelGroup: group }));
  return { doc: { ...grouped, routes: [...grouped.routes, lane] }, id: lane.id };
}

/** Delete one route (one lane). A lane left alone in its group stops being a group. */
export function deleteRoute(doc: MapDoc, routeId: string): MapDoc {
  const route = doc.routes.find((r) => r.id === routeId);
  if (!route) return doc;
  let next: MapDoc = { ...doc, routes: doc.routes.filter((r) => r.id !== routeId) };
  if (route.parallelGroup) {
    const left = next.routes.filter((r) => r.parallelGroup === route.parallelGroup);
    if (left.length === 1) next = updateRoute(next, left[0]!.id, ({ parallelGroup: _g, ...r }) => r);
  }
  return next;
}

// --- Map-wide -------------------------------------------------------------------------------

export function setDisplay(doc: MapDoc, display: NonNullable<MapDoc['display']>): MapDoc {
  return { ...doc, display: { ...doc.display, ...display } };
}

/** Set every ticket's points to the shortest path between its cities, in trains. */
export function recalcTicketPoints(doc: MapDoc): MapDoc {
  const index = indexDoc(doc);
  return {
    ...doc,
    tickets: doc.tickets.map((t) => {
      const points = suggestTicketPoints(index, t.from, t.to);
      return points === null ? t : { ...t, points: Math.max(1, points) };
    }),
  };
}

/** Undo history: past and future maps around the current one. */
export interface History {
  past: MapDoc[];
  present: MapDoc;
  future: MapDoc[];
}

const LIMIT = 200;

export function commit(h: History, next: MapDoc): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
}

export function redo(h: History): History {
  const next = h.future[0];
  return next ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) } : h;
}
