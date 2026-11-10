import express from 'express';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatIssues, validateMap, type MapDefinition } from '@rails/shared';

/**
 * Temporary map editor endpoints (development only, enabled with --editor):
 * - GET /api/editor      the default map file
 * - PUT /api/editor/map  validate a whole map and write it as the default map
 * - GET /api/editor/animations        the animations saved so far
 * - PUT /api/editor/animations/:name  write <name>.gif and its settings, <name>.json
 * The map file is the design: the editor changes anything in it (cities, routes, slots, display).
 */
export interface EditorOptions {
  /** The default map file the game loads. */
  mapFile: string;
  /** Called with the saved map, so new rooms use it. */
  onSaved: (map: MapDefinition) => void;
  /** Where the /animations page saves GIFs. */
  animationsDir?: string;
}

/** Write to a temp file first so a crash never leaves half a file. */
function writeAtomic(file: string, data: string | Buffer): void {
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

function animationRoutes(app: express.Express, dir: string): void {
  app.get('/api/editor/animations', (_req, res) => {
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    const animations = files.flatMap((f) => {
      try {
        const settings = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
        return [{ ...settings, name: f.slice(0, -'.json'.length) }];
      } catch {
        return [];
      }
    });
    res.json({ animations });
  });

  app.put('/api/editor/animations/:name', express.json({ limit: '120mb' }), (req, res) => {
    // The name becomes a file name, so it may never contain a path.
    const { name } = req.params;
    const body = req.body as { effect?: unknown; output?: unknown; params?: unknown; gif?: unknown };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      res.status(422).json({ ok: false, error: 'names use lowercase letters, digits and dashes' });
      return;
    }
    const gif = typeof body.gif === 'string' ? Buffer.from(body.gif, 'base64') : null;
    if (!gif || gif.subarray(0, 6).toString('latin1') !== 'GIF89a') {
      res.status(422).json({ ok: false, error: 'that is not a GIF' });
      return;
    }
    if (typeof body.effect !== 'string' || typeof body.output !== 'object' || typeof body.params !== 'object') {
      res.status(422).json({ ok: false, error: 'the settings are missing' });
      return;
    }
    mkdirSync(dir, { recursive: true });
    writeAtomic(join(dir, `${name}.gif`), gif);
    writeAtomic(join(dir, `${name}.json`), JSON.stringify({ effect: body.effect, output: body.output, params: body.params }, null, 1) + '\n');
    res.json({ ok: true });
  });
}

export function editorRoutes(options: EditorOptions): (app: express.Express) => void {
  return (app) => {
    if (options.animationsDir) animationRoutes(app, options.animationsDir);

    app.get('/api/editor', (_req, res) => {
      res.json({ map: JSON.parse(readFileSync(options.mapFile, 'utf8')) });
    });

    app.put('/api/editor/map', express.json({ limit: '10mb' }), (req, res) => {
      const result = validateMap(req.body);
      if (!result.ok) {
        res.status(422).json({ ok: false, error: formatIssues(result.errors.slice(0, 40)) });
        return;
      }
      const map: MapDefinition = { ...result.map, edited: true };
      // Write to a temp file first so a crash never leaves a half-written map.
      const temp = `${options.mapFile}.tmp`;
      writeFileSync(temp, JSON.stringify(map, null, 1) + '\n');
      renameSync(temp, options.mapFile);
      options.onSaved(map);
      res.json({ ok: true, stats: result.stats });
    });
  };
}
