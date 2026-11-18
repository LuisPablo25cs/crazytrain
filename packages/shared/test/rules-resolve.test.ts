import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, openLanes, resolveRules, RulesError } from '../src/index.js';

describe('resolveRules', () => {
  it('returns the defaults when nothing overrides them', () => {
    expect(resolveRules()).toEqual(DEFAULT_RULES);
  });

  it('applies map overrides, then lobby toggles', () => {
    const rules = resolveRules(
      { trainsPerPlayer: 40, expansions: { stations: true, ferries: false } },
      { stations: false },
    );
    expect(rules.trainsPerPlayer).toBe(40);
    expect(rules.expansions).toEqual({ tunnels: true, ferries: false, stations: false, longTickets: true });
    expect(rules.deck).toEqual(DEFAULT_RULES.deck);
  });

  it('merges nested objects without dropping sibling keys', () => {
    const rules = resolveRules({ tickets: { drawCount: 4 } });
    expect(rules.tickets.drawCount).toBe(4);
    expect(rules.tickets.initialKeepMin).toBe(DEFAULT_RULES.tickets.initialKeepMin);
  });

  it('freezes the resolved rules', () => {
    const rules = resolveRules();
    expect(Object.isFrozen(rules)).toBe(true);
    expect(Object.isFrozen(rules.expansions)).toBe(true);
  });

  it('rejects min players above max players', () => {
    expect(() => resolveRules({ players: { min: 5, max: 3 } })).toThrow(RulesError);
    expect(() => resolveRules({ players: { min: 5, max: 3 } })).toThrow(/players.min/);
  });

  it('rejects fewer player colors than max players', () => {
    expect(() => resolveRules({ players: { max: 9 } })).toThrow(/player colors/);
  });
});

describe('openLanes', () => {
  it('opens one lane for 2 to 3 players and all lanes for 4 or more by default', () => {
    expect(openLanes(DEFAULT_RULES, 2)).toBe(1);
    expect(openLanes(DEFAULT_RULES, 3)).toBe(1);
    expect(openLanes(DEFAULT_RULES, 4)).toBeGreaterThanOrEqual(3);
    expect(openLanes(DEFAULT_RULES, 7)).toBeGreaterThanOrEqual(3);
  });

  it('follows a custom table', () => {
    const rules = resolveRules({
      parallelLanes: [
        { minPlayers: 1, lanes: 1 },
        { minPlayers: 4, lanes: 2 },
        { minPlayers: 6, lanes: 3 },
      ],
    });
    expect(openLanes(rules, 5)).toBe(2);
    expect(openLanes(rules, 6)).toBe(3);
  });
});

describe('double routes lobby choice', () => {
  it('keeps the lane table by default: one lane with 3 players, both with 4', () => {
    const rules = resolveRules(undefined, undefined, undefined, { doubleRoutes: 'rule' });
    expect(openLanes(rules, 3)).toBe(1);
    expect(openLanes(rules, 4)).toBeGreaterThan(1);
  });

  it('opens every lane at any player count when the host picks "both"', () => {
    const rules = resolveRules(undefined, undefined, undefined, { doubleRoutes: 'both' });
    expect(openLanes(rules, 2)).toBeGreaterThan(1);
    expect(openLanes(rules, 3)).toBeGreaterThan(1);
  });
});
