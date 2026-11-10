import { resolveRules, maxScoredLength, RulesError } from '../rules/resolve.js';
import type { RulesConfig } from '../rules/schema.js';
import { components, indexMap, type MapIndex } from './graph.js';
import { MapSchema, ROUTE_COLORS, ticketCities, type MapDefinition, type RouteColor } from './schema.js';

export interface ValidationIssue {
  /** Dotted path to the bad item, for example `routes[3].to` or `routes.denver-omaha`. */
  path: string;
  message: string;
}

export interface MapStats {
  cityCount: number;
  routeCount: number;
  totalTrains: number;
  byColor: Record<RouteColor, { routes: number; trains: number }>;
  byKind: { normal: number; tunnel: number; ferry: number };
  tickets: { regular: number; long: number; minPoints: number; maxPoints: number };
}

export type MapValidationResult =
  | { ok: true; map: MapDefinition; index: MapIndex; rules: RulesConfig; stats: MapStats; errors: [] }
  | { ok: false; errors: ValidationIssue[]; stats?: MapStats };

function formatPath(path: PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out || '(root)';
}

function computeStats(map: MapDefinition): MapStats {
  const byColor = Object.fromEntries(ROUTE_COLORS.map((c) => [c, { routes: 0, trains: 0 }])) as MapStats['byColor'];
  const byKind = { normal: 0, tunnel: 0, ferry: 0 };
  let totalTrains = 0;
  for (const r of map.routes) {
    byColor[r.color].routes += 1;
    byColor[r.color].trains += r.length;
    byKind[r.kind] += 1;
    totalTrains += r.length;
  }
  const points = map.tickets.map((t) => t.points);
  return {
    cityCount: map.cities.length,
    routeCount: map.routes.length,
    totalTrains,
    byColor,
    byKind,
    tickets: {
      regular: map.tickets.filter((t) => t.deck === 'regular').length,
      long: map.tickets.filter((t) => t.deck === 'long').length,
      minPoints: points.length ? Math.min(...points) : 0,
      maxPoints: points.length ? Math.max(...points) : 0,
    },
  };
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
}

/**
 * Validate a map document: schema first, then the semantic checks a schema cannot express.
 * Every problem is reported with a path, so authors can fix them all in one pass.
 */
export function validateMap(input: unknown): MapValidationResult {
  const parsed = MapSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
    };
  }
  const map = parsed.data;
  const errors: ValidationIssue[] = [];
  const stats = computeStats(map);

  let rules: RulesConfig | undefined;
  try {
    rules = resolveRules(map.rules);
  } catch (e) {
    errors.push({ path: 'rules', message: e instanceof RulesError ? e.message : String(e) });
  }

  for (const id of duplicates(map.cities.map((c) => c.id))) {
    errors.push({ path: `cities.${id}`, message: `duplicate city id "${id}"` });
  }
  for (const id of duplicates(map.routes.map((r) => r.id))) {
    errors.push({ path: `routes.${id}`, message: `duplicate route id "${id}"` });
  }
  for (const id of duplicates(map.tickets.map((t) => t.id))) {
    errors.push({ path: `tickets.${id}`, message: `duplicate ticket id "${id}"` });
  }

  const cityIds = new Set(map.cities.map((c) => c.id));
  const maxLength = rules ? maxScoredLength(rules) : Infinity;

  for (const r of map.routes) {
    const p = `routes.${r.id}`;
    for (const end of [r.from, r.to]) {
      if (!cityIds.has(end)) errors.push({ path: p, message: `route "${r.id}" points to missing city "${end}"` });
    }
    if (r.from === r.to) errors.push({ path: p, message: `route "${r.id}" connects "${r.from}" to itself` });
    if (r.length > maxLength) {
      errors.push({ path: `${p}.length`, message: `route "${r.id}" has length ${r.length}, but the scoring table stops at ${maxLength}` });
    }
    if (r.kind === 'ferry') {
      if (r.ferryLocomotives < 1) {
        errors.push({ path: `${p}.ferryLocomotives`, message: `ferry "${r.id}" needs at least 1 locomotive` });
      }
      if (r.ferryLocomotives > r.length) {
        errors.push({ path: `${p}.ferryLocomotives`, message: `ferry "${r.id}" needs ${r.ferryLocomotives} locomotives but is only ${r.length} long` });
      }
    }
    if (r.slots && r.slots.length !== r.length) {
      errors.push({ path: `${p}.slots`, message: `route "${r.id}" has ${r.slots.length} placed slots but length ${r.length}` });
    }
    if (r.kind !== 'ferry' && r.ferryLocomotives > 0) {
      errors.push({ path: `${p}.ferryLocomotives`, message: `route "${r.id}" is not a ferry but sets ferryLocomotives` });
    }
  }

  const index = indexMap(map);
  for (const [group, lanes] of index.groups) {
    const p = `parallelGroup.${group}`;
    if (lanes.length < 2) {
      errors.push({ path: p, message: `parallel group "${group}" has only one lane (${lanes[0]!.id})` });
      continue;
    }
    const first = lanes[0]!;
    const key = (a: string, b: string) => [a, b].sort().join('|');
    for (const lane of lanes.slice(1)) {
      if (key(lane.from, lane.to) !== key(first.from, first.to)) {
        errors.push({ path: p, message: `lanes "${first.id}" and "${lane.id}" of group "${group}" connect different cities` });
      }
      if (lane.length !== first.length) {
        errors.push({ path: p, message: `lanes "${first.id}" (${first.length}) and "${lane.id}" (${lane.length}) of group "${group}" have different lengths` });
      }
    }
  }

  const parts = components(index);
  if (parts.length > 1) {
    const unreachable = parts.slice(1).flat();
    errors.push({ path: 'cities', message: `the map is not connected; unreachable from the main network: ${unreachable.join(', ')}` });
  }
  const mainPart = new Set(parts[0] ?? []);

  for (const t of map.tickets) {
    const p = `tickets.${t.id}`;
    for (const end of ticketCities(t)) {
      if (!cityIds.has(end)) errors.push({ path: p, message: `ticket "${t.id}" points to missing city "${end}"` });
    }
    if (new Set(ticketCities(t)).size !== ticketCities(t).length) {
      errors.push({ path: p, message: `ticket "${t.id}" names the same city twice` });
    }
    const named = ticketCities(t).filter((c) => cityIds.has(c));
    if (named.some((c) => mainPart.has(c) !== mainPart.has(named[0]!))) {
      errors.push({ path: p, message: `ticket "${t.id}" connects cities that cannot reach each other` });
    }
  }

  if (rules) {
    const maxPlayers = rules.players.max;
    if (rules.expansions.longTickets && rules.tickets.initialLong > 0) {
      const needed = maxPlayers * rules.tickets.initialLong;
      if (stats.tickets.long < needed) {
        errors.push({ path: 'tickets', message: `needs at least ${needed} long tickets for ${maxPlayers} players, has ${stats.tickets.long}` });
      }
    }
    const neededRegular = maxPlayers * rules.tickets.initialRegular;
    if (stats.tickets.regular < neededRegular) {
      errors.push({ path: 'tickets', message: `needs at least ${neededRegular} regular tickets for ${maxPlayers} players, has ${stats.tickets.regular}` });
    }
  }

  if (errors.length > 0 || !rules) return { ok: false, errors, stats };
  return { ok: true, map, index, rules, stats, errors: [] };
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
}
