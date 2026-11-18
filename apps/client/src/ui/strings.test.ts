import { afterEach, describe, expect, it } from 'vitest';
import { en } from './i18n/en.js';
import { es } from './i18n/es.js';
import { describeEvent, NX, S, setLang, T, tr } from './strings.js';

/** Every key path in a dictionary, with functions and arrays counted as leaves. */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

afterEach(() => setLang('en'));

describe('strings', () => {
  it('has every English string in Spanish too', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('swaps every export when the language changes', () => {
    setLang('es');
    expect(S.drawTickets).toBe('Robar boletos');
    expect(NX.claim(7)).toBe('Reclamar · +7');
    expect(T.zoom.in).toBe('Acercar');
    setLang('en');
    expect(S.drawTickets).toBe('Draw tickets');
  });

  it('translates engine and server messages, numbers and colors included', () => {
    setLang('es');
    expect(tr('you have 3 trains left, this route needs 5')).toBe('te quedan 3 trenes y esta ruta necesita 5');
    expect(tr('this route needs purple cards or locomotives')).toBe('esta ruta necesita cartas rosas o locomotoras');
    expect(tr('only 1 lane(s) of this route can be used with 3 players')).toBe('con 3 jugadores solo se puede usar 1 carril de esta ruta');
    expect(tr('something new')).toBe('something new');
    setLang('en');
    expect(tr('it is not your turn')).toBe('it is not your turn');
  });

  it('writes log lines with Spanish card agreement', () => {
    setLang('es');
    expect(describeEvent({ type: 'drewFaceUp', player: 0, card: 'red', slot: 0 }, ['Ana'], null)).toBe('Ana tomó una carta roja descubierta.');
    expect(describeEvent({ type: 'drewFaceUp', player: 0, card: 'locomotive', slot: 0 }, ['Ana'], null)).toBe('Ana tomó una locomotora descubierta.');
  });
});
