import { z } from 'zod';
import { RulesOverrideSchema } from '../rules/schema.js';

export const CARD_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'black',
  'white',
] as const;
export type CardColor = (typeof CARD_COLORS)[number];
export const LOCOMOTIVE = 'locomotive' as const;
/** Seasons mode: needed to build on ground a disaster tore up, and to repair tsunami damage. Never a color or wild card. */
export const EXCAVATOR = 'excavator' as const;
export type Card = CardColor | typeof LOCOMOTIVE | typeof EXCAVATOR;
export const ALL_CARDS: readonly Card[] = [...CARD_COLORS, LOCOMOTIVE, EXCAVATOR];

export const ROUTE_COLORS = [...CARD_COLORS, 'gray'] as const;
export type RouteColor = (typeof ROUTE_COLORS)[number];

export const MAP_SCHEMA_VERSION = 1;

const id = () =>
  z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'ids use lowercase letters, digits and dashes');

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

/** A polygon ring as [x, y] pairs in map space. */
export const RingSchema = z.array(z.tuple([z.number(), z.number()])).min(3);
export type Ring = z.infer<typeof RingSchema>;

/** Natural disasters (Seasons mode). Snow storms are a season, not a random event. */
export const HAZARDS = ['earthquake', 'volcano', 'tsunami', 'hurricane', 'tornado', 'snow'] as const;
export type Hazard = (typeof HAZARDS)[number];
export const HazardLevelSchema = z.enum(['high', 'medium']);
export type HazardLevel = z.infer<typeof HazardLevelSchema>;
export const CityHazardsSchema = z.strictObject(
  Object.fromEntries(HAZARDS.map((h) => [h, HazardLevelSchema.optional()])) as Record<Hazard, z.ZodOptional<typeof HazardLevelSchema>>,
);
export type CityHazards = z.infer<typeof CityHazardsSchema>;

export const CitySchema = z.object({
  id: id(),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
  country: z.string().optional(),
  major: z.boolean().default(false),
  /** How likely each natural disaster is here (Seasons mode). Missing means never. */
  hazards: CityHazardsSchema.optional(),
});
export type City = z.infer<typeof CitySchema>;

/**
 * One train slot placed by hand (map editor): center in map space, direction in radians (map space,
 * y down), and optional size. Missing sizes use the map's display defaults.
 */
export const RouteSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  angle: z.number(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
});
export type RouteSlot = z.infer<typeof RouteSlotSchema>;

export const RouteKindSchema = z.enum(['normal', 'tunnel', 'ferry']);
export type RouteKind = z.infer<typeof RouteKindSchema>;

export const RouteSchema = z.object({
  id: id(),
  from: id(),
  to: id(),
  length: z.number().int().min(1),
  color: z.enum(ROUTE_COLORS),
  kind: RouteKindSchema.default('normal'),
  /** Locomotives required in the payment when the route is a ferry. */
  ferryLocomotives: z.number().int().min(0).default(0),
  /** Lanes between the same two cities share this id (double and triple routes). */
  parallelGroup: id().optional(),
  /** Optional bend points between the two cities, in map space. */
  path: z.array(PointSchema).optional(),
  /** Hand-placed slots, one per train. Without them, slots are spaced evenly along the route. */
  slots: z.array(RouteSlotSchema).optional(),
  /**
   * Bends the route into a circular arc. The value is how far the arc's middle sits from the
   * straight line between the cities, in map units; its sign picks the side (positive is to the
   * left of the way from `from` to `to`, with y pointing down). Takes precedence over `path`.
   */
  bend: z.number().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

export const TicketDeckSchema = z.enum(['regular', 'long']);
export type TicketDeck = z.infer<typeof TicketDeckSchema>;

export const TicketSchema = z.object({
  id: id(),
  from: id(),
  to: id(),
  points: z.number().int().min(1),
  deck: TicketDeckSchema.default('regular'),
  /** A third city for a triple ticket: done once the player's network joins all three cities. */
  via: id().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** The cities a ticket needs connected, in reading order: from, via (if any), to. */
export function ticketCities(t: Pick<Ticket, 'from' | 'to' | 'via'>): string[] {
  return t.via ? [t.from, t.via, t.to] : [t.from, t.to];
}

/**
 * A picture drawn as the ground under the board, placed in map space. The source is a file the
 * server hosts under /maps/ or an inline data URI, so a map never makes browsers fetch other sites.
 */
export const TerrainImageSchema = z.object({
  src: z
    .string()
    .regex(
      // Path segments are words joined by single dots, so ".." can never appear.
      /^(\/maps\/(?:[\w-]+(?:\.[\w-]+)*\/)*[\w-]+(?:\.[\w-]+)*\.(png|jpe?g|webp)|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/,
      'image src must be a /maps/... file or a data:image URI',
    ),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Color drawn around the image, usually its ocean color. */
  surround: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type TerrainImage = z.infer<typeof TerrainImageSchema>;

export const TerrainSchema = z.object({
  land: z.array(RingSchema).default([]),
  lakes: z.array(RingSchema).default([]),
  image: TerrainImageSchema.optional(),
});
export type Terrain = z.infer<typeof TerrainSchema>;

/**
 * How ticket text sits on the ticket artwork. Positions and sizes are in the artwork's drawing
 * space, 1000 units wide. Missing values use DEFAULT_TICKET_STYLE.
 */
export const TicketStyleSchema = z.object({
  /** The curved city line: where its middle sits, size, longest width, bend and letter spacing. */
  cityX: z.number().optional(),
  cityY: z.number().optional(),
  citySize: z.number().positive().optional(),
  cityMaxWidth: z.number().positive().optional(),
  /** Degrees of arc the city line spans. 0 is straight; larger bends it more. */
  cityCurve: z.number().min(0).max(180).optional(),
  citySpacing: z.number().optional(),
  numberX: z.number().optional(),
  numberY: z.number().optional(),
  numberSize: z.number().positive().optional(),
  numberAngle: z.number().optional(),
});
export type TicketStyle = z.infer<typeof TicketStyleSchema>;
export type ResolvedTicketStyle = Required<TicketStyle>;

export const DEFAULT_TICKET_STYLE: ResolvedTicketStyle = {
  cityX: 443,
  cityY: 291,
  citySize: 18,
  cityMaxWidth: 215,
  cityCurve: 55,
  citySpacing: 1,
  numberX: 791,
  numberY: 369,
  numberSize: 68,
  numberAngle: -33,
};

export function resolveTicketStyle(style?: TicketStyle): ResolvedTicketStyle {
  const out = { ...DEFAULT_TICKET_STYLE };
  for (const [key, value] of Object.entries(style ?? {})) {
    if (typeof value === 'number') (out as Record<string, number>)[key] = value;
  }
  return out;
}

/** How the board draws slots when a route has no hand-placed ones. */
export const MapDisplaySchema = z.object({
  slotWidth: z.number().positive().optional(),
  laneSpacing: z.number().positive().optional(),
});
export type MapDisplay = z.infer<typeof MapDisplaySchema>;

export const MapSchema = z.object({
  schemaVersion: z.literal(MAP_SCHEMA_VERSION),
  id: id(),
  name: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  /** Map-space size. Cities and terrain use these units. */
  width: z.number().positive().default(1000),
  height: z.number().positive(),
  cities: z.array(CitySchema).min(2),
  routes: z.array(RouteSchema).min(1),
  tickets: z.array(TicketSchema).min(1),
  terrain: TerrainSchema.default({ land: [], lakes: [] }),
  /** Optional rules overrides for this map (KTD14). */
  rules: RulesOverrideSchema.optional(),
  display: MapDisplaySchema.optional(),
  /** Where ticket text sits on the ticket artwork (set in the hidden /tickets page). */
  ticketStyle: TicketStyleSchema.optional(),
  /** Set by the map editor. `npm run build:map` will not overwrite an edited map without --force. */
  edited: z.boolean().optional(),
});
export type MapDefinition = z.infer<typeof MapSchema>;
export type MapInput = z.input<typeof MapSchema>;
