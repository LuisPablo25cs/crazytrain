import { useSyncExternalStore } from 'react';

/**
 * The HUD's handle on the board camera (zoom buttons and keys). CameraRig registers the live
 * camera here; the zoom control calls these and reads whether it is at either limit.
 */
export interface CameraHandle {
  zoomBy(factor: number): void;
  fit(): void;
}

export interface ZoomLimits {
  atMin: boolean;
  atMax: boolean;
}

let handle: CameraHandle | null = null;
let limits: ZoomLimits = { atMin: true, atMax: false };
const listeners = new Set<() => void>();

export function registerCamera(h: CameraHandle | null): void {
  handle = h;
}

export function reportZoomLimits(next: ZoomLimits): void {
  if (next.atMin === limits.atMin && next.atMax === limits.atMax) return;
  limits = next;
  for (const l of listeners) l();
}

/** How much one press of + or − zooms. */
export const ZOOM_STEP = 1.5;

export const camera = {
  zoomIn: () => handle?.zoomBy(ZOOM_STEP),
  zoomOut: () => handle?.zoomBy(1 / ZOOM_STEP),
  fit: () => handle?.fit(),
};

export function useZoomLimits(): ZoomLimits {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => limits,
    () => limits,
  );
}
