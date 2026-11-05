import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { MapSchema, ThemeSchema } from '@rails/shared';

// Export JSON Schemas so editors (VS Code, a future map editor) can validate files without the game.
const outDir = resolve(process.argv[2] ?? 'assets/maps');
const targets = [
  { name: 'map.schema.json', schema: MapSchema, title: 'Rails map' },
  { name: 'theme.schema.json', schema: ThemeSchema, title: 'Rails theme' },
];
for (const t of targets) {
  const json = { title: t.title, ...z.toJSONSchema(t.schema, { io: 'input' }) };
  const path = resolve(outDir, t.name);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`wrote ${path}`);
}
