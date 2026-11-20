/**
 * Each player has a sign as well as a color, so a train's owner never depends on color alone.
 * The client draws each sign (apps/client/src/board/playerMarks.ts); the server only checks the id.
 */
export const PLAYER_SIGNS = [
  'dot',
  'bar',
  'diamond',
  'twin',
  'triangle',
  'ring',
  'plus',
  'star',
  'heart',
  'moon',
  'bolt',
  'cross',
  'square',
  'hexagon',
  'chevron',
  'crown',
  'frame',
  'trio',
  'drop',
  'clover',
  'pentagon',
  'octagon',
  'sparkle',
  'star6',
  'burst',
  'target',
  'half',
  'hourglass',
  'bowtie',
  'arrow',
  'double',
  'house',
  'shield',
  'flag',
  'tree',
  'spade',
  'leaf',
  'gear',
  'gem',
  'stripes',
] as const;

export type PlayerSign = (typeof PLAYER_SIGNS)[number];

export const isPlayerSign = (v: string): v is PlayerSign => (PLAYER_SIGNS as readonly string[]).includes(v);

/** A sign the player typed: `char:` and one character (a letter, a number, a symbol or an emoji). */
export const CHAR_SIGN = 'char:';
export const isCharSign = (v: string): boolean => v.startsWith(CHAR_SIGN);
export const signChar = (v: string): string => v.slice(CHAR_SIGN.length);

type Segmenter = new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> };

/** The user-perceived characters of a text (an emoji with modifiers counts as one). */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: Segmenter }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (g) => g.segment);
  return Array.from(text);
}

export const firstGrapheme = (text: string): string => graphemes(text)[0] ?? '';
export const lastGrapheme = (text: string): string => graphemes(text).at(-1) ?? '';

/** Visible characters only: letters, numbers, marks, punctuation, symbols and emoji joiners. */
const VISIBLE = /^[\p{L}\p{N}\p{M}\p{P}\p{S}\u200d\ufe0f]+$/u;

/** A shape from PLAYER_SIGNS, or one typed character. */
export function isValidSign(v: string): boolean {
  if (isPlayerSign(v)) return true;
  if (!isCharSign(v)) return false;
  const c = signChar(v);
  return c.length > 0 && c.length <= 16 && VISIBLE.test(c) && firstGrapheme(c) === c;
}

/** A color a player mixed themselves (`#rrggbb`, lower case), as opposed to a palette color id. */
export const isHexColor = (v: string): boolean => /^#[0-9a-f]{6}$/.test(v);
