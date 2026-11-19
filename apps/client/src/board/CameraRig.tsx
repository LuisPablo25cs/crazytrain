import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { registerCamera, reportZoomLimits } from './cameraControl.js';

/** Height of the top-down camera above the board. Any value above the tallest model works. */
const CAMERA_HEIGHT = 500;
/** How far past the "whole map" view players can zoom in. */
const MAX_ZOOM_FACTOR = 8;
/** Screen pixels covered by the HUD on each side (see .hud-* in styles.css). */
// The bottom dock is outside the board area, so the map may reach the bottom edge.
const DESKTOP_HUD = { left: 280, right: 305, top: 64, bottom: 0 };
/** The phone layout (ui/hud/classic/phone.tsx): player chips left, rail right, status top, hand strip bottom. */
const PHONE_HUD = { left: 60, right: 92, top: 48, bottom: 78 };
const hudFor = (w: number, h: number) => (w <= 900 || h <= 500 ? PHONE_HUD : DESKTOP_HUD);

export interface CameraFocus {
  x: number;
  y: number;
  /** Map units to show from top to bottom of the screen. */
  zoom: number;
  nonce: number;
}

interface CameraRigProps {
  width: number;
  height: number;
  focus: CameraFocus | null;
  onZoomChange: (zoomedIn: boolean) => void;
}

/**
 * A flat 2D view: an orthographic camera looking straight down, north up. Players pan and zoom
 * within limits: zoomed out, the whole map fits between the HUD panels; panning stops when a map
 * edge reaches a panel, so every part of the map can be brought into the clear area.
 */
export function CameraRig({ width, height, focus, onZoomChange }: CameraRigProps) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const { camera, size } = useThree();
  const HUD = hudFor(size.width, size.height);
  const goal = useRef<{ x: number; z: number; zoom: number } | null>(null);
  const zoomedIn = useRef<boolean | null>(null);
  // The smallest zoom shows the whole map in the area the HUD leaves free.
  const freeW = Math.max(200, size.width - HUD.left - HUD.right);
  const freeH = Math.max(150, size.height - HUD.top - HUD.bottom);
  const minZoom = Math.min(freeW / width, freeH / height);

  useEffect(() => {
    camera.up.set(0, 0, -1);
    camera.position.set(width / 2, CAMERA_HEIGHT, height / 2);
    camera.lookAt(width / 2, 0, height / 2);
    camera.zoom = minZoom;
    camera.updateProjectionMatrix();
    controls.current?.target.set(width / 2, 0, height / 2);
    controls.current?.update();
    // Only on a new map; resizing keeps the player's view and is clamped below.
  }, [camera, width, height]);

  useEffect(() => {
    if (focus) goal.current = { x: focus.x, z: focus.y, zoom: size.height / focus.zoom };
  }, [focus, size.height]);

  // Zoom buttons and keys (cameraControl), and double-click to zoom in on the point under the cursor.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const zoomAt = (factor: number, at?: { x: number; z: number }) => {
      const c = controls.current;
      if (!c) return;
      const from = goal.current?.zoom ?? camera.zoom;
      const to = THREE.MathUtils.clamp(from * factor, c.minZoom, c.maxZoom);
      const tx = goal.current?.x ?? c.target.x;
      const tz = goal.current?.z ?? c.target.z;
      // Keep the chosen point where it is on screen while zooming toward it.
      const keep = at ? 1 - from / to : 0;
      goal.current = { x: tx + ((at?.x ?? tx) - tx) * keep, z: tz + ((at?.z ?? tz) - tz) * keep, zoom: to };
    };
    registerCamera({
      zoomBy: (factor) => zoomAt(factor),
      fit: () => {
        goal.current = { x: width / 2, z: height / 2, zoom: controls.current?.minZoom ?? camera.zoom };
      },
    });
    const el = gl.domElement;
    const onDouble = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const p = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0).unproject(camera);
      zoomAt(1.6, { x: p.x, z: p.z });
    };
    el.addEventListener('dblclick', onDouble);
    return () => {
      el.removeEventListener('dblclick', onDouble);
      registerCamera(null);
    };
  }, [camera, gl, width, height]);

  useFrame(() => {
    const c = controls.current;
    if (!c || !(camera instanceof THREE.OrthographicCamera)) return;
    c.minZoom = minZoom;
    c.maxZoom = minZoom * MAX_ZOOM_FACTOR;
    if (goal.current) {
      const g = goal.current;
      c.target.x += (g.x - c.target.x) * 0.18;
      c.target.z += (g.z - c.target.z) * 0.18;
      const want = THREE.MathUtils.clamp(g.zoom, c.minZoom, c.maxZoom);
      camera.zoom += (want - camera.zoom) * 0.18;
      // Done once both the center and the zoom have arrived (a zoom alone keeps the same center).
      const arrived = Math.abs(g.x - c.target.x) < 0.5 && Math.abs(g.z - c.target.z) < 0.5 && Math.abs(want - camera.zoom) < want * 0.002;
      if (arrived) goal.current = null;
    }
    camera.zoom = THREE.MathUtils.clamp(camera.zoom, c.minZoom, c.maxZoom);
    camera.updateProjectionMatrix();
    // Map edges may come no further than the HUD panels. When the map is smaller than the free
    // area, it stays centered in it.
    const z = camera.zoom;
    const t = c.target;
    t.x = clampAxis(t.x, width, size.width / 2 / z, HUD.left / z, HUD.right / z);
    t.z = clampAxis(t.z, height, size.height / 2 / z, HUD.top / z, HUD.bottom / z);
    t.y = 0;
    camera.position.set(t.x, CAMERA_HEIGHT, t.z);
    c.update();
    reportZoomLimits({ atMin: camera.zoom <= minZoom * 1.01, atMax: camera.zoom >= minZoom * MAX_ZOOM_FACTOR * 0.99 });
    const zoomed = camera.zoom > minZoom * 1.8;
    if (zoomed !== zoomedIn.current) {
      zoomedIn.current = zoomed;
      onZoomChange(zoomed);
    }
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      dampingFactor={0.15}
      screenSpacePanning
      zoomToCursor
    />
  );
}

/**
 * Clamp a view center on one axis. `half` is half the screen in map units; `padStart` and `padEnd`
 * are the HUD widths on each side, in map units.
 */
export function clampAxis(center: number, size: number, half: number, padStart: number, padEnd: number): number {
  const lo = half - padStart;
  const hi = size - half + padEnd;
  return lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(center, lo, hi);
}

/** Focus that shows the whole map again. */
export function resetViewFocus(width: number, height: number, nonce: number): CameraFocus {
  return { x: width / 2, y: height / 2, zoom: height * 4, nonce };
}
