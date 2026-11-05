import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatIssues } from '@rails/shared';
import { buildMap, writeMap } from './lib.js';

/**
 * Generate a map from its lat/lon sources. This seeds a new map; once the map editor has saved a
 * map, the map file is the design, so this refuses to overwrite it unless --force is given.
 * Usage: tsx tools/map-build/build.ts [source-dir] [out-file] [--force]
 */
const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const sourceDir = resolve(args[0] ?? 'assets/maps/sources/north-america');
const outFile = resolve(args[1] ?? 'assets/maps/north-america.map.json');

if (!force && existsSync(outFile) && JSON.parse(readFileSync(outFile, 'utf8')).edited === true) {
  console.error(`${outFile} was edited in the map editor; regenerating it would discard those edits.`);
  console.error('Run again with --force to overwrite it anyway.');
  process.exit(1);
}
const built = buildMap(sourceDir);
if (!built.ok) {
  console.error(`Map is invalid:\n${formatIssues(built.errors)}`);
  process.exit(1);
}
writeMap(outFile, built.map);
console.log(`wrote ${outFile} (${built.map.width} x ${built.map.height})`);
for (const line of built.report) console.log(line);
