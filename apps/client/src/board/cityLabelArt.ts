import { useEffect, useState } from 'react';

/** City label art (Canva lettering from assets/city_labels, made web-sized by tools/assets/prepare-city-labels.py). */
export function cityLabelUrl(cityId: string): string {
  return `/art/cities/${cityId}.webp`;
}

// One probe per page: which cities have label art. The server lists the files it has, so no image is asked for in vain.
interface ArtInfo {
  cityLabels?: string[];
}

let probe: Promise<Set<string>> | null = null;
function loadCityLabelArt(): Promise<Set<string>> {
  probe ??= fetch('/api/art')
    .then((res) => (res.ok ? (res.json() as Promise<ArtInfo>) : ({} as ArtInfo)))
    .catch(() => ({}) as ArtInfo)
    .then((art) => new Set(art.cityLabels ?? []));
  return probe;
}

/** City ids that have label art; empty until the server answers. */
export function useCityLabelArt(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    void loadCityLabelArt().then((s) => alive && setIds(s));
    return () => {
      alive = false;
    };
  }, []);
  return ids;
}
