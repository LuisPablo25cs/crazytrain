import { describe, expect, it } from 'vitest';
import { DEFAULT_TICKET_STYLE, resolveTicketStyle } from '@rails/shared';
import { cityPath, cityText, fittedCitySize } from './TicketArt.js';

describe('ticket text layout', () => {
  it('writes city names in capitals joined by a dot', () => {
    expect(cityText(['London', 'Madrid'])).toBe('LONDON · MADRID');
  });

  it('shrinks long lines to fit and never grows past the chosen size', () => {
    const s = resolveTicketStyle();
    const short = fittedCitySize(cityText(['Rome', 'Oslo']), s);
    const long = fittedCitySize(cityText(['Prince Rupert', 'Ciudad de México', 'Saint John']), s);
    expect(short).toBe(s.citySize);
    expect(long).toBeLessThan(short);
  });

  it('draws a straight line at zero curve and an arc otherwise', () => {
    const straight = cityPath({ ...DEFAULT_TICKET_STYLE, cityCurve: 0 }, 200);
    expect(straight).toBe('M 343.00 291 H 543.00');
    expect(cityPath(DEFAULT_TICKET_STYLE, 200)).toMatch(/ A /);
  });

  it('merges a partial style over the defaults', () => {
    expect(resolveTicketStyle({ cityCurve: 90 })).toEqual({ ...DEFAULT_TICKET_STYLE, cityCurve: 90 });
  });
});
