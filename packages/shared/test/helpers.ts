import { indexMap, MapSchema, resolveRules, type MapIndex, type RulesConfig, type RulesOverride } from '../src/index.js';
import tiny from './fixtures/tiny.map.json' with { type: 'json' };

/** A loosely typed copy of the tiny fixture, for tests that break it on purpose. */
export type LooseMap = {
  [key: string]: unknown;
  cities: Record<string, unknown>[];
  routes: Record<string, unknown>[];
  tickets: Record<string, unknown>[];
};

export function looseTiny(): LooseMap {
  return structuredClone(tiny) as unknown as LooseMap;
}

export function tinyIndex(): MapIndex {
  return indexMap(MapSchema.parse(structuredClone(tiny)));
}

export function rules(override?: RulesOverride): RulesConfig {
  return resolveRules(override);
}
