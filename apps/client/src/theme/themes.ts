import { ThemeSchema, type Theme } from '@rails/shared';
import classic from './themes/classic.json';

/** Validate a theme file; fall back to the default theme when it is broken (R17). */
export function loadTheme(raw: unknown, fallback?: Theme): Theme {
  const parsed = ThemeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!fallback) throw new Error(`default theme is invalid: ${parsed.error.message}`);
  console.warn('Theme is invalid, using the default theme instead.', parsed.error.issues);
  return fallback;
}

export const DEFAULT_THEME = loadTheme(classic);
/**
 * The dark "night" theme (themes/night.json) is switched off for now: only the default theme is offered.
 * To bring it back, import night.json and add `loadTheme(night, DEFAULT_THEME)` here.
 */
export const THEMES: Theme[] = [DEFAULT_THEME];

export function themeById(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** Display color for a player color id, with a stable fallback for ids a theme does not know. */
/** A palette color from the theme, or a color the player mixed themselves (`#rrggbb`). */
export function playerHex(theme: Theme, colorId: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(colorId)) return colorId;
  return theme.playerColors[colorId] ?? '#888888';
}
