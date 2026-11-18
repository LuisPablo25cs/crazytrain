import { useEffect } from 'react';
import { camera, useZoomLimits } from '../../../board/cameraControl.js';
import { T } from '../../strings.js';

/** Keys that type into a field must not zoom the map. */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Zoom in, out and fit the whole map, on the right edge of the board (fix B). Keys: + and − zoom,
 * 0 fits. The wheel, trackpad pinch and double-click still work on the map itself.
 */
export function ZoomControl() {
  const { atMin, atMax } = useZoomLimits();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === '+' || e.key === '=') camera.zoomIn();
      else if (e.key === '-' || e.key === '_') camera.zoomOut();
      else if (e.key === '0') camera.fit();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const Z = T.zoom;
  return (
    <div className="nx-zoom" role="group" aria-label={Z.group}>
      <button className="nx-zoom-btn" onClick={camera.zoomIn} disabled={atMax} aria-label={Z.in} title={`${Z.in} (+)`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 3v12M3 9h12" />
        </svg>
      </button>
      <button className="nx-zoom-btn" onClick={camera.zoomOut} disabled={atMin} aria-label={Z.out} title={`${Z.out} (−)`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3 9h12" />
        </svg>
      </button>
      <button className="nx-zoom-btn fit" onClick={camera.fit} disabled={atMin} aria-label={Z.fit} title={`${Z.fit} (0)`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M2 6V2h4M16 6V2h-4M2 12v4h4M16 12v4h-4" />
        </svg>
      </button>
    </div>
  );
}
