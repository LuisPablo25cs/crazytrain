import express from 'express';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { formatIssues, validateMap, type MapDefinition } from '@rails/shared';

/**
 * Temporary map editor endpoints (development only, enabled with --editor):
 * - GET /api/editor      the default map file
 * - PUT /api/editor/map  validate a whole map and write it as the default map
 * The map file is the design: the editor changes anything in it (cities, routes, slots, display).
 */
export interface EditorOptions {
  /** The default map file the game loads. */
  mapFile: string;
  /** Called with the saved map, so new rooms use it. */
  onSaved: (map: MapDefinition) => void;
}

export function editorRoutes(options: EditorOptions): (app: express.Express) => void {
  return (app) => {
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
