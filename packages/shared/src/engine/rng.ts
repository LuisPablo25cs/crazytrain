/** Mulberry32 step: returns a float in [0, 1) and the next state. Deterministic and serializable. */
export function nextRandom(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Holds RNG state on a mutable game-state draft. */
export interface RngHolder {
  rng: number;
}

export function randomInt(holder: RngHolder, maxExclusive: number): number {
  const [value, next] = nextRandom(holder.rng);
  holder.rng = next;
  return Math.floor(value * maxExclusive);
}

/** Fisher-Yates shuffle in place, using the holder's RNG. */
export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
