import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEvent, MapIndex } from '@rails/shared';
import { setUi, store } from '../state/store.js';
import { T } from '../ui/strings.js';
import { SLOT_Y, type Slot } from './Routes.js';

/** How long a rival claim is pointed out: the ring pings twice, the edge arrow stays a little longer. */
const RING_MS = 2400;
const ARROW_MS = 5000;
/** Screen margins the HUD covers in Classic mode; a claim behind them counts as off screen. */
const EDGE = { left: 280, right: 300, top: 96, bottom: 190 };

export interface Ping {
  routeId: string;
  /** Map-space middle of the route. */
  x: number;
  y: number;
  color: string;
  name: string;
  at: number;
}

/** The latest claim by someone other than the viewer, with where it is on the map. */
export function useRivalPing(
  lastEvents: GameEvent[],
  viewer: number | null,
  slots: Slot[],
  map: MapIndex,
  colorOf: (player: number) => string,
  enabled: boolean,
): Ping | null {
  const [ping, setPing] = useState<Ping | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const claim = [...lastEvents].reverse().find((e) => e.type === 'claimedRoute' && e.player !== viewer);
    if (!claim || claim.type !== 'claimedRoute') return;
    const own = slots.filter((s) => s.routeId === claim.routeId);
    if (own.length === 0) return;
    const r = map.routes.get(claim.routeId);
    setPing({
      routeId: claim.routeId,
      x: own.reduce((n, s) => n + s.x, 0) / own.length,
      y: own.reduce((n, s) => n + s.y, 0) / own.length,
      color: colorOf(claim.player),
      name: r ? `${map.cities.get(r.from)?.name ?? r.from} – ${map.cities.get(r.to)?.name ?? r.to}` : claim.routeId,
      at: performance.now(),
    });
    // Only new events start a ping; the viewer changing in hot-seat play must not.
  }, [lastEvents]);
  return ping;
}

/** A brass ring that grows and fades over a rival's new route, twice. The camera stays where it is. */
export function PingRing({ ping }: { ping: Ping | null }) {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useMemo(() => new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), []);
  useFrame(() => {
    const m = mesh.current;
    const mat = material.current;
    if (!m || !mat) return;
    const t = ping ? (performance.now() - ping.at) / RING_MS : 1;
    if (!ping || t >= 1) {
      m.visible = false;
      return;
    }
    const u = (t * 2) % 1;
    m.visible = true;
    m.position.set(ping.x, SLOT_Y + 3, ping.y);
    // Sized in screen pixels (18 → 70 px radius) so it reads at any zoom.
    m.scale.setScalar((18 + u * 52) / camera.zoom);
    mat.opacity = 1 - u;
  });
  return (
    <mesh ref={mesh} geometry={ring} visible={false} renderOrder={10} raycast={() => null}>
      <meshBasicMaterial ref={material} color="#e2c377" transparent depthTest={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Inside the canvas: each frame, puts the edge arrow on the screen edge in the direction of an
 * off-screen rival claim, or hides it when the claim is in view (or old).
 */
export function PingProjector({ ping, arrow }: { ping: Ping | null; arrow: RefObject<HTMLButtonElement | null> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const el = arrow.current;
    if (!el) return;
    if (!ping || performance.now() - ping.at > ARROW_MS) {
      el.style.display = 'none';
      return;
    }
    v.set(ping.x, SLOT_Y, ping.y).project(camera);
    const sx = ((v.x + 1) / 2) * size.width;
    const sy = ((1 - v.y) / 2) * size.height;
    const box = { l: EDGE.left, r: size.width - EDGE.right, t: EDGE.top, b: size.height - EDGE.bottom };
    if (sx >= box.l && sx <= box.r && sy >= box.t && sy <= box.b) {
      el.style.display = 'none';
      return;
    }
    // Where the line from the middle of the free area to the claim leaves that area.
    const cx = (box.l + box.r) / 2;
    const cy = (box.t + box.b) / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min(Math.abs((box.r - cx) / (dx || 1e-6)), Math.abs((box.b - cy) / (dy || 1e-6)));
    const x = cx + dx * Math.min(1, k);
    const y = cy + dy * Math.min(1, k);
    el.style.display = '';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    el.style.setProperty('--ping-angle', `${Math.atan2(dy, dx)}rad`);
  });
  return null;
}

/** The edge arrow itself (outside the canvas). Clicking it looks at the claim; ignoring it is fine. */
export function PingArrow({ ping, arrow }: { ping: Ping | null; arrow: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={arrow}
      className="ping-arrow"
      style={{ display: 'none' }}
      aria-label={ping ? T.activity.lookAt(ping.name) : undefined}
      onClick={() => {
        if (!ping) return;
        const nonce = (store.getState().ui.focus?.nonce ?? 0) + 1;
        setUi({ focus: { x: ping.x, y: ping.y, zoom: 320, nonce } });
      }}
    >
      <span className="ping-swatch" style={{ background: ping?.color }} />
      <span>{ping?.name}</span>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="ping-pointer">
        <path d="M3 9h12M10 4l5 5-5 5" />
      </svg>
    </button>
  );
}
