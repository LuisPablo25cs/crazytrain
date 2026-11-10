import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HAZARDS,
  type HazardLevel,
  maxScoredLength,
  MapSchema,
  resolveRules,
  ROUTE_COLORS,
  validateMap,
  type RouteColor,
  type RouteKind,
} from '@rails/shared';
import { slotArtKey, slotArtUrl } from '../board/Routes.js';
import {
  arcMiddle,
  chordNormal,
  clampBend,
  MAX_BEND_RATIO,
  slotOptionsFor,
  slotTransforms,
  TRAIN_LENGTH_RATIO,
  TRAIN_WIDTH_RATIO,
  type SlotTransform,
} from '../board/geometry.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { PlayerPreview } from './PlayerPreview.js';
import { playerHex } from '../theme/themes.js';
import { CARD_NAMES, HAZARD_NAMES } from '../ui/strings.js';
import {
  addCity,
  addLane,
  addRoute,
  commit,
  deleteCity,
  deleteRoute,
  indexDoc,
  lanesOf,
  MAX_LANES,
  moveCity,
  moveSlots,
  recalcTicketPoints,
  redo,
  renameCity,
  renameCityWithId,
  resetSlots,
  resizeSlots,
  restoreRouteProps,
  rotateSlots,
  setCityHazard,
  setCityMajor,
  setDisplay,
  setFerryLocomotives,
  setRouteBend,
  setRouteColor,
  setRouteKind,
  setRouteLength,
  straightenRoute,
  undo,
  type History,
  type MapDoc,
  type Target,
  HISTORY_LIMIT,
} from './mapOps.js';

/**
 * Temporary map editor for the default map (dev only, served at /editor). Everything in the map is
 * editable: cities, routes, lanes, slots. Save validates the whole map and writes the map file.
 */

type Mode = 'select' | 'addCity' | 'addRoute';
type Selection = { kind: 'route'; routeId: string; index: number } | { kind: 'city'; cityId: string } | null;
type Drag =
  | { kind: 'slot'; target: Target; start: Point; from: MapDoc }
  | { kind: 'city'; cityId: string; start: Point; origin: Point; from: MapDoc }
  | { kind: 'bend'; routeId: string; from: MapDoc }
  | { kind: 'pan'; start: { x: number; y: number }; view: View };

interface Point {
  x: number;
  y: number;
}
interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEG = Math.PI / 180;
const KINDS: RouteKind[] = ['normal', 'tunnel', 'ferry'];

function maxLengthOf(doc: MapDoc): number {
  try {
    return maxScoredLength(resolveRules(doc.rules));
  } catch {
    return 10;
  }
}

export function EditorScreen() {
  const [saved, setSaved] = useState<MapDoc | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [dragDoc, setDragDoc] = useState<MapDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [routeStart, setRouteStart] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [playerView, setPlayerView] = useState(false);
  const [autosave, setAutosave] = useState(true);
  // Claimed preview: editor-only, never saved. Shows train cars as if a player owned the route.
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set());
  const [allClaimed, setAllClaimed] = useState(false);
  const [trainColor, setTrainColor] = useState('red');
  const { theme } = useTheme();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    fetch('/api/editor')
      .then(async (res) => {
        if (!res.ok) throw new Error('The map editor is off. Start the game with "npm run dev" (it turns the editor on).');
        const data = (await res.json()) as { map: unknown };
        const doc = MapSchema.parse(data.map);
        setSaved(doc);
        setHistory({ past: [], present: doc, future: [] });
        setView({ x: 0, y: 0, w: doc.width, h: doc.height });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const doc = dragDoc ?? history?.present ?? null;
  const index = useMemo(() => (doc ? indexDoc(doc) : null), [doc]);
  const slots = useMemo(() => {
    if (!index) return [];
    const options = slotOptionsFor(index);
    return index.map.routes.flatMap((r) =>
      slotTransforms(r, index, options).map((t, i) => ({ ...t, route: r, index: i, art: slotArtUrl(slotArtKey(r)) })),
    );
  }, [index]);
  const check = useMemo(() => (history ? validateMap(history.present) : null), [history]);
  const dirty = !!history && !!saved && history.present !== saved;
  const maxLength = doc ? maxLengthOf(doc) : 10;
  // Lines (routes, one per lane) and total trains per color, for balancing the board.
  const colorCounts = useMemo(() => {
    const counts = new Map<RouteColor, { lines: number; trains: number }>(ROUTE_COLORS.map((c) => [c, { lines: 0, trains: 0 }]));
    for (const r of doc?.routes ?? []) {
      const entry = counts.get(r.color)!;
      entry.lines += 1;
      entry.trains += r.length;
    }
    return counts;
  }, [doc]);

  const apply = useCallback((change: (d: MapDoc) => MapDoc) => {
    setHistory((h) => (h ? commit(h, change(h.present)) : h));
  }, []);

  const toggleClaimed = useCallback((routeId: string) => {
    setClaimed((c) => {
      const next = new Set(c);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (!history || !selection) return;
    if (selection.kind === 'route') {
      apply((d) => deleteRoute(d, selection.routeId));
      setStatus(`Deleted route ${selection.routeId}.`);
    } else {
      const result = deleteCity(history.present, selection.cityId);
      apply(() => result.doc);
      setStatus(`Deleted ${selection.cityId} with ${result.routes} routes and ${result.tickets} tickets.`);
    }
    setSelection(null);
  }, [history, selection, apply]);

  const addLaneTo = useCallback(
    (routeId: string) => {
      if (!history) return;
      const result = addLane(history.present, routeId);
      if (!result.id) return setStatus(`A route can have at most ${MAX_LANES} lanes.`);
      apply(() => result.doc);
      setSelection({ kind: 'route', routeId: result.id, index: 0 });
    },
    [history, apply],
  );

  const save = useCallback(async () => {
    if (!history) return;
    const target = history.present;
    setStatus('Saving…');
    const res = await fetch('/api/editor/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (body.ok) {
      setSaved(target);
      setStatus('Saved. New rooms use this map.');
    } else {
      setStatus(`Not saved:\n${body.error ?? 'unknown error'}`);
    }
  }, [history]);

  // Autosave: a moment after the last change, if the map is valid. Undo history keeps the last 30 changes.
  useEffect(() => {
    if (!autosave || !dirty || !check?.ok) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [autosave, dirty, check, save]);

  // Keyboard shortcuts. Typing in a field never triggers them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (ctrl && (k === 'y' || (e.shiftKey && k === 'z'))) {
        e.preventDefault();
        setHistory((h) => (h ? redo(h) : h));
        return;
      }
      if (ctrl && k === 'z') {
        e.preventDefault();
        setHistory((h) => (h ? undo(h) : h));
        return;
      }
      if (ctrl || !index) return;
      if (e.key === 'Escape') {
        setMode('select');
        setRouteStart(null);
        setSelection(null);
        return;
      }
      if (k === 'n') return setMode('addCity');
      if (k === 'l') {
        setRouteStart(selection?.kind === 'city' ? selection.cityId : null);
        return setMode('addRoute');
      }
      if (e.key === 'Delete') return deleteSelected();
      if (selection?.kind !== 'route') return;
      const route = index.routes.get(selection.routeId);
      if (!route) return;
      const target: Target = { routeId: route.id, index: e.shiftKey ? 'all' : selection.index };
      const fine = e.altKey;
      const step = fine ? 0.25 : 1;
      const turn = (fine ? 1 : 5) * DEG;
      const digit = e.key === '0' ? 10 : /^[1-9]$/.test(e.key) ? Number(e.key) : null;
      let change: ((d: MapDoc) => MapDoc) | null = null;
      if (digit !== null && digit <= maxLength) change = (d) => setRouteLength(d, route.id, digit);
      else if (k === 'c') {
        const i = ROUTE_COLORS.indexOf(route.color);
        const next = ROUTE_COLORS[(i + (e.shiftKey ? ROUTE_COLORS.length - 1 : 1)) % ROUTE_COLORS.length]!;
        change = (d) => setRouteColor(d, route.id, next);
      } else if (k === 'k') {
        const next = KINDS[(KINDS.indexOf(route.kind) + 1) % KINDS.length]!;
        change = (d) => setRouteKind(d, route.id, next);
      } else if (k === 'a') {
        e.preventDefault();
        return addLaneTo(route.id);
      } else if (k === 't') {
        e.preventDefault();
        return toggleClaimed(route.id);
      } else if (k === 'q') change = (d) => rotateSlots(d, index, target, -turn);
      else if (k === 'e') change = (d) => rotateSlots(d, index, target, turn);
      else if (e.key === 'ArrowLeft') change = (d) => moveSlots(d, index, target, -step, 0);
      else if (e.key === 'ArrowRight') change = (d) => moveSlots(d, index, target, step, 0);
      else if (e.key === 'ArrowUp') change = (d) => moveSlots(d, index, target, 0, -step);
      else if (e.key === 'ArrowDown') change = (d) => moveSlots(d, index, target, 0, step);
      else if (e.key === '[') change = (d) => resizeSlots(d, index, target, -step, 0);
      else if (e.key === ']') change = (d) => resizeSlots(d, index, target, step, 0);
      else if (e.key === '-') change = (d) => resizeSlots(d, index, target, 0, -step / 2);
      else if (e.key === '=' || e.key === '+') change = (d) => resizeSlots(d, index, target, 0, step / 2);
      else if (k === 's') change = (d) => straightenRoute(d, index, route.id);
      else if (k === 'r') change = (d) => resetSlots(d, route.id);
      if (change) {
        e.preventDefault();
        apply(change);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [selection, index, apply, save, toggleClaimed, deleteSelected, addLaneTo, maxLength]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const toMap = (clientX: number, clientY: number): Point => {
    const s = svg.current!;
    const pt = s.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!history || !view || !index) return;
    const el = (e.target as Element).closest('[data-route], [data-city]') as SVGElement | null;
    const start = toMap(e.clientX, e.clientY);
    const cityId = el?.dataset.city;
    const routeId = el?.dataset.route;

    if (mode === 'addCity' && !cityId) {
      const result = addCity(history.present, start.x, start.y);
      apply(() => result.doc);
      setSelection({ kind: 'city', cityId: result.id });
      setMode('select');
      return;
    }
    if (mode === 'addRoute') {
      if (!cityId) {
        setRouteStart(null);
        return;
      }
      if (!routeStart) {
        setRouteStart(cityId);
        return;
      }
      if (cityId !== routeStart) {
        const result = addRoute(history.present, routeStart, cityId, maxLength);
        if (result.id) {
          apply(() => result.doc);
          setSelection({ kind: 'route', routeId: result.id, index: 0 });
        } else {
          setStatus(`Those cities already have ${MAX_LANES} lanes.`);
        }
        setRouteStart(null);
        setMode('select');
      }
      return;
    }

    svg.current!.setPointerCapture(e.pointerId);
    const bendEl = (e.target as Element).closest('[data-bend]') as SVGElement | null;
    if (bendEl?.dataset.bend) {
      drag.current = { kind: 'bend', routeId: bendEl.dataset.bend, from: history.present };
      return;
    }
    if (cityId) {
      const city = index.cities.get(cityId)!;
      setSelection({ kind: 'city', cityId });
      drag.current = { kind: 'city', cityId, start, origin: { x: city.x, y: city.y }, from: history.present };
    } else if (routeId) {
      const slot = Number(el!.dataset.slot);
      setSelection({ kind: 'route', routeId, index: slot });
      drag.current = { kind: 'slot', target: { routeId, index: e.shiftKey ? 'all' : slot }, start, from: history.present };
    } else {
      drag.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, view };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const rect = svg.current!.getBoundingClientRect();
      const scale = d.view.w / rect.width;
      setView({ ...d.view, x: d.view.x - (e.clientX - d.start.x) * scale, y: d.view.y - (e.clientY - d.start.y) * scale });
      return;
    }
    const p = toMap(e.clientX, e.clientY);
    if (d.kind === 'bend') {
      // The handle follows the pointer's distance from the straight line between the cities.
      const route = d.from.routes.find((r) => r.id === d.routeId);
      const a = d.from.cities.find((c) => c.id === route?.from);
      const b = d.from.cities.find((c) => c.id === route?.to);
      if (!route || !a || !b) return;
      const n = chordNormal(a, b);
      const side = (p.x - (a.x + b.x) / 2) * n.x + (p.y - (a.y + b.y) / 2) * n.y;
      setDragDoc(setRouteBend(d.from, d.routeId, clampBend(a, b, side)));
      return;
    }
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (d.kind === 'city') setDragDoc(moveCity(d.from, d.cityId, d.origin.x + dx, d.origin.y + dy));
    else setDragDoc(moveSlots(d.from, indexDoc(d.from), d.target, dx, dy));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (dragDoc && d && d.kind !== 'pan') apply(() => dragDoc);
    setDragDoc(null);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!view || !doc) return;
    const p = toMap(e.clientX, e.clientY);
    const factor = Math.exp(e.deltaY * 0.0015);
    const w = Math.min(doc.width * 1.5, Math.max(40, view.w * factor));
    const h = (w / view.w) * view.h;
    setView({ x: p.x - ((p.x - view.x) * w) / view.w, y: p.y - ((p.y - view.y) * h) / view.h, w, h });
  };

  if (error) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>Map editor</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }
  if (!doc || !index || !view || !history || !saved || !check) return <main className="center-screen">Loading the map…</main>;

  const selectedRoute = selection?.kind === 'route' ? index.routes.get(selection.routeId) : undefined;
  const selectedCity = selection?.kind === 'city' ? index.cities.get(selection.cityId) : undefined;
  const display = slotOptionsFor(index);
  const bendLimit = selectedRoute
    ? Math.hypot(
        (index.cities.get(selectedRoute.to)?.x ?? 0) - (index.cities.get(selectedRoute.from)?.x ?? 0),
        (index.cities.get(selectedRoute.to)?.y ?? 0) - (index.cities.get(selectedRoute.from)?.y ?? 0),
      ) * MAX_BEND_RATIO
    : 0;
  const image = doc.terrain.image;
  const carFill = playerHex(theme, trainColor);
  const canRestore = selectedRoute ? saved.routes.some((r) => r.id === selectedRoute.id) : false;
  const modeHint =
    mode === 'addCity'
      ? 'Click the map where the new city goes.'
      : mode === 'addRoute'
        ? routeStart
          ? `From ${index.cities.get(routeStart)?.name}: click the city to connect.`
          : 'Click the first city of the new route.'
        : null;

  if (playerView) return <PlayerPreview doc={doc} onClose={() => setPlayerView(false)} />;

  return (
    <div className="editor">
      <svg
        ref={svg}
        className={`editor-canvas mode-${mode}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{ background: image?.surround ?? '#5169a3' }}
      >
        {image && <image href={image.src} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio="none" />}
        {slots.map((s) => {
          const inRoute = selection?.kind === 'route' && selection.routeId === s.route.id;
          const inSlot = inRoute && selection.index === s.index;
          return (
            <g key={`${s.route.id}-${s.index}`} transform={slotTransformAttr(s)} data-route={s.route.id} data-slot={s.index} className="editor-slot">
              <image href={s.art} x={-s.width / 2} y={-s.length / 2} width={s.width} height={s.length} preserveAspectRatio="none" transform="rotate(90)" />
              {(allClaimed || claimed.has(s.route.id)) && (
                // Preview of a claimed slot: the same proportions as the game's train cars.
                <rect
                  className="editor-car"
                  x={(-s.length * TRAIN_LENGTH_RATIO) / 2}
                  y={(-s.width * TRAIN_WIDTH_RATIO) / 2}
                  width={s.length * TRAIN_LENGTH_RATIO}
                  height={s.width * TRAIN_WIDTH_RATIO}
                  rx={Math.min(1.2, s.width * 0.15)}
                  fill={carFill}
                  stroke="#1d1d1d"
                  strokeWidth={0.45}
                />
              )}
              {inRoute && (
                <rect
                  x={-s.length / 2}
                  y={-s.width / 2}
                  width={s.length}
                  height={s.width}
                  fill="none"
                  stroke={inSlot ? '#ff1744' : '#ffeb3b'}
                  strokeWidth={inSlot ? 0.9 : 0.6}
                />
              )}
            </g>
          );
        })}
        {doc.cities.map((c) => {
          const active = (selection?.kind === 'city' && selection.cityId === c.id) || routeStart === c.id;
          return (
            <g key={c.id} data-city={c.id} className="editor-city" transform={`translate(${c.x} ${c.y})`}>
              {active && <circle r={(c.major ? 5 : 3.8) + 2.6} fill="none" stroke="#ff1744" strokeWidth={1.2} />}
              <circle r={c.major ? 5 : 3.8} fill="#5a3c2c" stroke="#f5e9d0" strokeWidth={1} />
              {showLabels && (
                <text y={c.major ? -7 : -5.5} textAnchor="middle" fontSize={c.major ? 7 : 5.5}>
                  {c.name}
                </text>
              )}
            </g>
          );
        })}
        {selectedRoute && mode === 'select' && (() => {
          const a = index.cities.get(selectedRoute.from)!;
          const b = index.cities.get(selectedRoute.to)!;
          const middle = arcMiddle(a, b, selectedRoute.bend ?? 0);
          return (
            <g data-bend={selectedRoute.id} className="editor-bend" transform={`translate(${middle.x} ${middle.y})`}>
              <circle r={6} fill="transparent" />
              <circle r={3.4} fill="#ffffff" stroke="#ff1744" strokeWidth={1.1} />
              <circle r={1} fill="#ff1744" />
            </g>
          );
        })()}
      </svg>

      <aside className="editor-panel panel">
        <h1>Map editor</h1>
        <div className="row">
          <button className="primary" disabled={!dirty || !check.ok} onClick={() => void save()}>
            Save{dirty ? ' *' : ''}
          </button>
          <button className="secondary small" disabled={history.past.length === 0} onClick={() => setHistory(undo(history))}>
            Undo
          </button>
          <button className="secondary small" disabled={history.future.length === 0} onClick={() => setHistory(redo(history))}>
            Redo
          </button>
        </div>
        <label className="small-print">
          <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} /> Autosave
          {autosave && dirty && !check.ok ? ' (paused: fix the problems below)' : ''}
          {' · '}undo keeps the last {HISTORY_LIMIT} changes ({history.past.length} stored)
        </label>
        <button className="secondary" disabled={!check.ok} title={check.ok ? undefined : 'Fix the map problems first'} onClick={() => setPlayerView(true)}>
          Player view
        </button>
        {check.ok ? (
          <p className="small-print editor-ok">
            ✓ Map is valid: {doc.cities.length} cities, {doc.routes.length} routes, {doc.tickets.length} tickets.
          </p>
        ) : (
          <div className="editor-problems">
            <strong>Fix before saving ({check.errors.length}):</strong>
            <ul className="small-print">
              {check.errors.slice(0, 8).map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          </div>
        )}
        {status && <pre className="editor-status">{status}</pre>}

        <h2>Tools</h2>
        <div className="editor-segmented">
          <button className={mode === 'select' ? 'primary small' : 'secondary small'} onClick={() => setMode('select')}>
            Select
          </button>
          <button className={mode === 'addCity' ? 'primary small' : 'secondary small'} onClick={() => setMode('addCity')}>
            Add city (N)
          </button>
          <button
            className={mode === 'addRoute' ? 'primary small' : 'secondary small'}
            onClick={() => {
              setRouteStart(selection?.kind === 'city' ? selection.cityId : null);
              setMode('addRoute');
            }}
          >
            Add route (L)
          </button>
        </div>
        {modeHint && <p className="hint">{modeHint} Esc cancels.</p>}

        {selectedRoute && (
          <section>
            <h2>
              Route: {index.cities.get(selectedRoute.from)?.name} – {index.cities.get(selectedRoute.to)?.name}
            </h2>
            <p className="muted small-print">
              {selectedRoute.id} · slot {selection!.kind === 'route' ? selection!.index + 1 : 1} ·{' '}
              {selectedRoute.slots ? 'placed by hand' : 'automatic'} · lane {lanesOf(doc, selectedRoute.id).indexOf(selectedRoute.id) + 1} of{' '}
              {lanesOf(doc, selectedRoute.id).length}
            </p>
            <div className="editor-field">
              <span>Color (C)</span>
              <div className="editor-swatches">
                {ROUTE_COLORS.map((c: RouteColor) => (
                  <button
                    key={c}
                    className={`swatch ${selectedRoute.color === c ? 'selected' : ''}`}
                    style={{ background: theme.cardColors[c] }}
                    title={CARD_NAMES[c]}
                    aria-label={CARD_NAMES[c]}
                    aria-pressed={selectedRoute.color === c}
                    onClick={() => apply((d) => setRouteColor(d, selectedRoute.id, c))}
                  />
                ))}
              </div>
            </div>
            <div className="editor-field">
              <span>Length in trains (keys 1–9, 0 = 10)</span>
              <div className="editor-segmented">
                {Array.from({ length: maxLength }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={selectedRoute.length === n ? 'primary small' : 'secondary small'}
                    aria-pressed={selectedRoute.length === n}
                    onClick={() => apply((d) => setRouteLength(d, selectedRoute.id, n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="editor-field">
              <span>Kind (K)</span>
              <div className="editor-segmented">
                {KINDS.map((kind) => (
                  <button
                    key={kind}
                    className={selectedRoute.kind === kind ? 'primary small' : 'secondary small'}
                    aria-pressed={selectedRoute.kind === kind}
                    onClick={() => apply((d) => setRouteKind(d, selectedRoute.id, kind))}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </div>
            {selectedRoute.kind === 'ferry' && (
              <div className="editor-field">
                <span>Locomotives needed</span>
                <div className="editor-segmented">
                  {Array.from({ length: selectedRoute.length }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      className={selectedRoute.ferryLocomotives === n ? 'primary small' : 'secondary small'}
                      onClick={() => apply((d) => setFerryLocomotives(d, selectedRoute.id, n))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label>
              Bend ({(selectedRoute.bend ?? 0).toFixed(1)}) — or drag the circle on the route
              <input
                type="range"
                min={-Math.round(bendLimit)}
                max={Math.round(bendLimit)}
                step={0.5}
                value={selectedRoute.bend ?? 0}
                onChange={(e) => apply((d) => setRouteBend(d, selectedRoute.id, Number(e.target.value)))}
              />
            </label>
            {selectedRoute.slots && <p className="muted small-print">Bending re-flows hand-placed slots along the curve.</p>}
            {lanesOf(doc, selectedRoute.id).length > 1 && (
              <p className="muted small-print">Length and kind apply to every lane; color is per lane.</p>
            )}
            <div className="row">
              <button
                className={claimed.has(selectedRoute.id) ? 'primary small' : 'secondary small'}
                aria-pressed={claimed.has(selectedRoute.id)}
                onClick={() => toggleClaimed(selectedRoute.id)}
              >
                {claimed.has(selectedRoute.id) ? 'Shown as claimed (T)' : 'Show as claimed (T)'}
              </button>
              <button
                className="secondary small"
                disabled={lanesOf(doc, selectedRoute.id).length >= MAX_LANES}
                onClick={() => addLaneTo(selectedRoute.id)}
              >
                Add lane (A)
              </button>
            </div>
            <div className="row">
              <button className="secondary small" disabled={!selectedRoute.bend} onClick={() => apply((d) => setRouteBend(d, selectedRoute.id, 0))}>
                Remove bend
              </button>
              <button className="secondary small" onClick={() => apply((d) => straightenRoute(d, index, selectedRoute.id))}>
                Straighten (S)
              </button>
              <button className="secondary small" disabled={!selectedRoute.slots} onClick={() => apply((d) => resetSlots(d, selectedRoute.id))}>
                Automatic slots (R)
              </button>
            </div>
            <div className="row">
              <button className="secondary small" disabled={!canRestore} onClick={() => apply((d) => restoreRouteProps(d, saved, selectedRoute.id))}>
                Undo property changes since save
              </button>
              <button className="small danger" onClick={deleteSelected}>
                Delete route (Del)
              </button>
            </div>
          </section>
        )}

        {selectedCity && (
          <section>
            <h2>City</h2>
            <CityNameField
              key={selectedCity.id}
              name={selectedCity.name}
              onCommit={(name) => {
                // A city added since the last save also takes its id from the new name.
                if (saved.cities.some((c) => c.id === selectedCity.id)) {
                  apply((d) => renameCity(d, selectedCity.id, name));
                } else {
                  const result = renameCityWithId(history.present, selectedCity.id, name);
                  apply(() => result.doc);
                  setSelection({ kind: 'city', cityId: result.id });
                }
              }}
            />
            <label className="theme-picker">
              <input
                type="checkbox"
                checked={selectedCity.major}
                onChange={(e) => apply((d) => setCityMajor(d, selectedCity.id, e.target.checked))}
              />{' '}
              Major city (bigger marker, name always shown)
            </label>
            <fieldset className="editor-hazards">
              <legend>Natural disasters (Seasons mode)</legend>
              {HAZARDS.map((h) => (
                <label key={h} className="editor-hazard">
                  <span>{HAZARD_NAMES[h]}</span>
                  <select
                    value={selectedCity.hazards?.[h] ?? ''}
                    onChange={(e) => apply((d) => setCityHazard(d, selectedCity.id, h, (e.target.value || null) as HazardLevel | null))}
                  >
                    <option value="">Never</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              ))}
            </fieldset>
            <p className="muted small-print">
              id {selectedCity.id} · {(index.routesByCity.get(selectedCity.id) ?? []).length} routes ·{' '}
              {doc.tickets.filter((t) => t.from === selectedCity.id || t.to === selectedCity.id).length} tickets
            </p>
            <div className="row">
              <button
                className="secondary small"
                onClick={() => {
                  setRouteStart(selectedCity.id);
                  setMode('addRoute');
                }}
              >
                New route from here (L)
              </button>
              <button className="small danger" onClick={deleteSelected}>
                Delete city (Del)
              </button>
            </div>
          </section>
        )}
        {!selectedRoute && !selectedCity && <p className="muted">Click a slot or a city to edit it.</p>}

        <h2>Disaster cities</h2>
        <table className="editor-counts">
          <thead>
            <tr>
              <th />
              <th>High</th>
              <th>Medium</th>
            </tr>
          </thead>
          <tbody>
            {HAZARDS.map((h) => (
              <tr key={h}>
                <td>{HAZARD_NAMES[h]}</td>
                <td>{doc.cities.filter((c) => c.hazards?.[h] === 'high').length}</td>
                <td>{doc.cities.filter((c) => c.hazards?.[h] === 'medium').length}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Lines per color</h2>
        <table className="editor-counts">
          <thead>
            <tr>
              <th />
              <th>Lines</th>
              <th>Trains</th>
            </tr>
          </thead>
          <tbody>
            {ROUTE_COLORS.map((c) => (
              <tr key={c}>
                <td>
                  <span className="editor-dot" style={{ background: theme.cardColors[c] }} /> {CARD_NAMES[c]}
                </td>
                <td>{colorCounts.get(c)!.lines}</td>
                <td>{colorCounts.get(c)!.trains}</td>
              </tr>
            ))}
            <tr className="editor-counts-total">
              <td>Total</td>
              <td>{doc.routes.length}</td>
              <td>{doc.routes.reduce((n, r) => n + r.length, 0)}</td>
            </tr>
          </tbody>
        </table>

        <h2>View</h2>
        <label className="theme-picker">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> City names
        </label>
        <label className="theme-picker">
          <input type="checkbox" checked={allClaimed} onChange={(e) => setAllClaimed(e.target.checked)} /> Trains on every route
        </label>
        <label className="theme-picker">
          Train color
          <select value={trainColor} onChange={(e) => setTrainColor(e.target.value)}>
            {Object.keys(theme.playerColors).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small-print">The train preview is never saved.</p>

        <h2>Defaults for automatic routes</h2>
        <label>
          Slot width ({display.slotWidth.toFixed(1)})
          <input
            type="range"
            min={2}
            max={14}
            step={0.2}
            value={display.slotWidth}
            onChange={(e) => apply((d) => setDisplay(d, { slotWidth: Number(e.target.value) }))}
          />
        </label>
        <label>
          Lane spacing ({display.laneSpacing.toFixed(1)})
          <input
            type="range"
            min={2}
            max={16}
            step={0.2}
            value={display.laneSpacing}
            onChange={(e) => apply((d) => setDisplay(d, { laneSpacing: Number(e.target.value) }))}
          />
        </label>

        <h2>Tickets</h2>
        <button className="secondary small" onClick={() => apply(recalcTicketPoints)}>
          Recalculate all ticket points
        </button>
        <p className="muted small-print">Sets every ticket to its shortest path in trains, replacing hand-set values.</p>

        <h2>Controls</h2>
        <ul className="editor-help small-print">
          <li>N add city · L add route (click two cities) · A add lane · Del delete.</li>
          <li>Drag a slot to move it, Shift-drag for the whole route. Drag a city to move it.</li>
          <li>1–9, 0 = 10 length · C / Shift+C color · K kind · T show as claimed.</li>
          <li>Q / E rotate · [ ] slot length · - = slot width · arrows nudge (Shift: whole route, Alt: fine).</li>
          <li>S straighten · R automatic slots · Esc cancel.</li>
          <li>Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save. Drag empty space to pan, wheel to zoom.</li>
        </ul>
        <a href="/">Back to the game</a>
      </aside>
    </div>
  );
}

/** City name input: saves on Enter or when leaving the field, so typing is one undo step. */
function CityNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const commitIfChanged = () => {
    if (value.trim() && value.trim() !== name) onCommit(value);
    else setValue(name);
  };
  return (
    <label>
      Name
      <input
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

function slotTransformAttr(s: SlotTransform): string {
  return `translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`;
}
