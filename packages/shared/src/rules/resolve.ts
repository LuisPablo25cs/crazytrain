import { DEFAULT_RULES } from './defaults.js';
import {
  RulesConfigSchema,
  type ExpansionToggles,
  type GameMode,
  type RulesConfig,
  type RulesOverride,
} from './schema.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge for plain objects. Arrays and scalars in `override` replace the base value. */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

export class RulesError extends Error {}

/** What the lobby picks besides the expansion toggles. */
export interface LobbyChoices {
  mode?: GameMode;
  years?: number;
}

/**
 * Resolve the rules for one game (KTD14): defaults, then map overrides, then lobby toggles.
 * The result is validated and frozen.
 */
export function resolveRules(
  mapOverride?: RulesOverride,
  toggles?: Partial<ExpansionToggles>,
  base: RulesConfig = DEFAULT_RULES,
  lobby?: LobbyChoices,
): Readonly<RulesConfig> {
  let merged = deepMerge(base, mapOverride ?? {});
  if (toggles) merged = deepMerge(merged, { expansions: toggles });
  if (lobby?.mode) merged = deepMerge(merged, { mode: lobby.mode });
  if (lobby?.years) merged = deepMerge(merged, { seasons: { years: lobby.years } });
  const parsed = RulesConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new RulesError(`Invalid rules: ${detail}`);
  }
  return deepFreeze(parsed.data);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Number of lanes of a parallel group that can be claimed with `playerCount` players. */
export function openLanes(rules: RulesConfig, playerCount: number): number {
  let lanes = 1;
  let best = -1;
  for (const row of rules.parallelLanes) {
    if (row.minPlayers <= playerCount && row.minPlayers > best) {
      best = row.minPlayers;
      lanes = row.lanes;
    }
  }
  return lanes;
}

export function routePoints(rules: RulesConfig, length: number): number {
  return rules.routeScoring[String(length)] ?? 0;
}

export function maxScoredLength(rules: RulesConfig): number {
  return Math.max(...Object.keys(rules.routeScoring).map(Number));
}
