import { useState } from 'react';
import type { MapIndex } from '@rails/shared';
import { setUi, store } from '../../state/store.js';
import { S } from '../strings.js';

/** Find a city by name; the camera moves there and the city is ringed. */
export function CitySearch({ map }: { map: MapIndex }) {
  const [text, setText] = useState('');
  const go = (value: string) => {
    const needle = value.trim().toLowerCase();
    if (!needle) return;
    const city =
      map.map.cities.find((c) => c.name.toLowerCase() === needle) ??
      map.map.cities.find((c) => c.name.toLowerCase().startsWith(needle)) ??
      map.map.cities.find((c) => c.name.toLowerCase().includes(needle));
    if (!city) return;
    const nonce = (store.getState().ui.focus?.nonce ?? 0) + 1;
    setUi({ focus: { x: city.x, y: city.y, zoom: 200, nonce }, highlightCities: [city.id] });
    setText('');
  };
  return (
    <form
      className="city-search"
      onSubmit={(e) => {
        e.preventDefault();
        go(text);
      }}
    >
      <input
        list="city-names"
        placeholder={S.searchCity}
        aria-label={S.searchCity}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (map.map.cities.some((c) => c.name === e.target.value)) go(e.target.value);
        }}
      />
      <datalist id="city-names">
        {[...map.map.cities]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <option key={c.id} value={c.name} />
          ))}
      </datalist>
    </form>
  );
}
