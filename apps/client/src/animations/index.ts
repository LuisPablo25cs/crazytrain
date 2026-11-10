import { earthquake } from './earthquake.js';
import { hurricane } from './hurricane.js';
import type { Effect } from './model.js';
import { snowstorm } from './snowstorm.js';
import { tsunami } from './tsunami.js';
import { tornado } from './tornado.js';
import { volcano } from './volcano.js';

/** Every animation on the /animations page. A new one needs its own file and a line here. */
export const EFFECTS: readonly Effect[] = [hurricane, snowstorm, tsunami, earthquake, volcano, tornado];
