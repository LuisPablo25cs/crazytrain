import { useEffect, useMemo, useRef, useState } from 'react';
import { EFFECTS } from './index.js';
import { DEFAULT_OUTPUT, defaultValues, frameCount, mergeValues, type Effect, type Output, type ParamDef, type Values } from './model.js';
import { encodeGif, renderFrame } from './render.js';

interface Saved {
  name: string;
  effect: string;
  output: Output;
  params: Values;
}

const OUTPUT_FIELDS: { key: 'width' | 'height' | 'seconds' | 'fps' | 'seed'; label: string; min: number; max: number; step: number }[] = [
  { key: 'width', label: 'Width (px)', min: 80, max: 1280, step: 10 },
  { key: 'height', label: 'Height (px)', min: 80, max: 1280, step: 10 },
  { key: 'seconds', label: 'Length (seconds)', min: 1, max: 12, step: 0.5 },
  { key: 'fps', label: 'Frames per second', min: 5, max: 50, step: 1 },
  { key: 'seed', label: 'Variation (seed)', min: 0, max: 9999, step: 1 },
];

const startValues = () => Object.fromEntries(EFFECTS.map((e) => [e.id, defaultValues(e)])) as Record<string, Values>;

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function Control({ def, value, onChange }: { def: ParamDef; value: Values[string]; onChange: (v: Values[string]) => void }) {
  if (def.kind === 'flag') {
    return (
      <label className="anim-flag">
        <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} /> {def.label}
      </label>
    );
  }
  if (def.kind === 'color') {
    return (
      <label className="anim-color">
        <input type="color" value={value as string} onChange={(e) => onChange(e.target.value)} /> {def.label}
      </label>
    );
  }
  return (
    <label className="tuning-row anim-row">
      <span>{def.label}</span>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value as number} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" min={def.min} max={def.max} step={def.step} value={value as number} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
    </label>
  );
}

/**
 * Hidden page (/animations, only while the editor is on): tune a code-drawn disaster animation with
 * a live preview and save it as a looping GIF in assets/animations.
 */
export function AnimationsPage() {
  const [effectId, setEffectId] = useState(EFFECTS[0]!.id);
  const [values, setValues] = useState(startValues);
  const [output, setOutput] = useState<Output>(DEFAULT_OUTPUT);
  const [name, setName] = useState(EFFECTS[0]!.id);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const effect = useMemo<Effect>(() => EFFECTS.find((e) => e.id === effectId) ?? EFFECTS[0]!, [effectId]);
  const current = values[effect.id]!;
  const frames = frameCount(output);
  const validName = /^[a-z0-9][a-z0-9-]*$/.test(name);

  const refresh = async () => {
    const res = await fetch('/api/editor/animations');
    if (!res.ok) return setAvailable(false);
    setAvailable(true);
    setSaved(((await res.json()) as { animations: Saved[] }).animations);
  };
  useEffect(() => {
    refresh().catch(() => setAvailable(false));
  }, []);

  // Preview: draws the same frames the GIF will contain.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    el.width = output.width;
    el.height = output.height;
    const ctx = el.getContext('2d')!;
    if (!playing) {
      renderFrame(ctx, effect, current, output, frame / frames);
      return;
    }
    let id = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const index = Math.floor(((now - started) / 1000) * output.fps) % frames;
      renderFrame(ctx, effect, current, output, index / frames);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [effect, current, output, playing, frame, frames, available]);

  const chooseEffect = (id: string) => {
    setEffectId(id);
    setName(id);
    setStatus('');
  };
  const setValue = (key: string, value: Values[string]) => setValues({ ...values, [effect.id]: { ...current, [key]: value } });
  const load = (s: Saved) => {
    const target = EFFECTS.find((e) => e.id === s.effect);
    if (!target) return setStatus(`"${s.name}" uses an animation that no longer exists.`);
    setValues({ ...values, [target.id]: mergeValues(target, s.params) });
    setOutput({ ...DEFAULT_OUTPUT, ...s.output });
    setEffectId(target.id);
    setName(s.name);
    setStatus(`Loaded ${s.name}.`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const bytes = await encodeGif(effect, current, output, (done) => setStatus(`Rendering… ${Math.round(done * 100)}%`));
      setStatus('Saving…');
      const res = await fetch(`/api/editor/animations/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effect: effect.id, output, params: current, gif: toBase64(bytes) }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      setStatus(body.ok ? `Saved assets/animations/${name}.gif (${(bytes.length / 1048576).toFixed(1)} MB, ${frames} frames).` : `Not saved: ${body.error ?? 'unknown error'}`);
      if (body.ok) await refresh();
    } catch (e) {
      setStatus(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (available === false) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>Animations</h1>
          <p>The map editor is off. Start the game with "npm run dev" (it turns the editor on).</p>
        </div>
      </main>
    );
  }

  const groups = [...new Set(effect.params.map((d) => d.group))];
  return (
    <div className="anim-page">
      <aside className="panel anim-panel">
        <h1>Animations</h1>
        <div className="editor-segmented anim-tabs">
          {EFFECTS.map((e) => (
            <button key={e.id} className={e.id === effect.id ? 'primary small' : 'secondary small'} onClick={() => chooseEffect(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
        {groups.map((group) => (
          <fieldset key={group} className={group === 'Colors' ? 'anim-colors' : undefined}>
            <legend>{group}</legend>
            {effect.params
              .filter((d) => d.group === group)
              .map((d) => (
                <Control key={d.key} def={d} value={current[d.key]!} onChange={(v) => setValue(d.key, v)} />
              ))}
          </fieldset>
        ))}
        <button className="secondary" onClick={() => setValues({ ...values, [effect.id]: defaultValues(effect) })}>
          Reset this animation
        </button>
      </aside>

      <main className="anim-stage">
        <div className={`anim-canvas ${output.transparent ? 'checker' : ''}`}>
          <canvas ref={canvas} />
        </div>
        <div className="anim-transport">
          <button className="secondary small" onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={frames - 1}
            value={Math.min(frame, frames - 1)}
            aria-label="Frame"
            onChange={(e) => {
              setPlaying(false);
              setFrame(Number(e.target.value));
            }}
          />
          <span className="muted">{playing ? `${frames} frames` : `Frame ${Math.min(frame, frames - 1) + 1} of ${frames}`}</span>
        </div>

        <section className="panel anim-export">
          <h2>GIF</h2>
          {OUTPUT_FIELDS.map((f) => (
            <label key={f.key} className="tuning-row anim-row">
              <span>{f.label}</span>
              <input type="range" min={f.min} max={f.max} step={f.step} value={output[f.key]} onChange={(e) => setOutput({ ...output, [f.key]: Number(e.target.value) })} />
              <input type="number" min={f.min} max={f.max} step={f.step} value={output[f.key]} onChange={(e) => e.target.value !== '' && setOutput({ ...output, [f.key]: Number(e.target.value) })} />
            </label>
          ))}
          <label className="anim-flag">
            <input type="checkbox" checked={output.transparent} onChange={(e) => setOutput({ ...output, transparent: e.target.checked })} /> Transparent background (hides the scenery)
          </label>
          <label>
            File name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!validName && <p className="error">Use lowercase letters, digits and dashes.</p>}
          <button className="primary" disabled={busy || !validName || available !== true} onClick={() => void save()}>
            Save GIF
          </button>
          {status && <pre className="editor-status">{status}</pre>}
          {saved.length > 0 && (
            <>
              <h2>Saved</h2>
              <div className="anim-saved">
                {saved.map((s) => (
                  <button key={s.name} className="secondary small" onClick={() => load(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
