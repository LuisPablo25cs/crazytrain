import { useEffect, useState } from 'react';

/** City label art (Canva lettering from assets/city_labels, made web-sized by tools/assets/prepare-city-labels.py). */
export function cityLabelUrl(cityId: string): string {
  return `/art/cities/${cityId}.webp`;
}

/**
 * Seasons-mode city art (assets/city_placeholders, made by tools/assets/prepare-city-pins.py): the name
 * lettering, and the colors of the round marker the board draws on the city under it.
 */
export interface CityPin {
  /** Size of the name picture, in its own pixels. */
  name: [number, number];
  /** Marker fill and ring colors, as in the Canva design. */
  fill: string;
  ring: string;
}

export function cityPinUrl(cityId: string): string {
  return `/art/city-pins/${cityId}-name.webp`;
}

// One probe per page: which cities have label art. The server lists the files it has, so no image is asked for in vain.
interface ArtInfo {
  cityLabels?: string[];
  cityPins?: boolean;
}

let probe: Promise<ArtInfo> | null = null;
function loadArtInfo(): Promise<ArtInfo> {
  probe ??= fetch('/api/art')
    .then((res) => (res.ok ? (res.json() as Promise<ArtInfo>) : ({} as ArtInfo)))
    .catch(() => ({}) as ArtInfo);
  return probe;
}

let pins: Promise<Map<string, CityPin>> | null = null;
function loadCityPins(): Promise<Map<string, CityPin>> {
  pins ??= loadArtInfo()
    .then((art) => (art.cityPins ? fetch('/art/city-pins/index.json').then((r) => (r.ok ? (r.json() as Promise<Record<string, CityPin>>) : {})) : {}))
    .catch(() => ({}))
    .then((index) => new Map(Object.entries(index)));
  return pins;
}

/** City ids that have label art; empty until the server answers. */
export function useCityLabelArt(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    void loadArtInfo().then((art) => alive && setIds(new Set(art.cityLabels ?? [])));
    return () => {
      alive = false;
    };
  }, []);
  return ids;
}

/** Seasons-mode city pins by city id; empty until loaded, or when `enabled` is false. */
export function useCityPins(enabled: boolean): Map<string, CityPin> {
  const [map, setMap] = useState<Map<string, CityPin>>(() => new Map());
  useEffect(() => {
    if (!enabled) {
      setMap(new Map());
      return;
    }
    let alive = true;
    void loadCityPins().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return map;
}
