import { z } from 'zod';
import { CARD_COLORS } from '../map/schema.js';

const hex = () => z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colors use #rrggbb');

const cardColorShape = Object.fromEntries(
  [...CARD_COLORS, 'locomotive', 'gray'].map((c) => [c, hex()]),
) as Record<(typeof CARD_COLORS)[number] | 'locomotive' | 'gray', ReturnType<typeof hex>>;

export const ThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Colors for train cards and route slots. `gray` is the color of gray routes. */
  cardColors: z.object(cardColorShape),
  /** Player color ids (from the rules config) to display colors. */
  playerColors: z.record(z.string(), hex()),
  terrain: z.object({
    background: hex(),
    water: hex(),
    land: hex(),
    landVariation: z.number().min(0).max(1),
    lake: hex(),
    /** Multiplies a map's background image, so dark themes can dim it. White leaves it unchanged. */
    imageTint: hex().optional(),
  }),
  board: z.object({
    city: hex(),
    majorCity: hex(),
    label: hex(),
    labelOutline: hex(),
    highlight: hex(),
    blocked: hex(),
  }),
  ui: z.object({
    panel: hex(),
    panelText: hex(),
    accent: hex(),
    muted: hex(),
  }),
  lighting: z.object({
    ambient: z.number().min(0),
    sun: z.number().min(0),
    sunColor: hex(),
  }),
});
export type Theme = z.infer<typeof ThemeSchema>;
