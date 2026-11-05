import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CARD_COLORS, formatIssues, validateMap } from '@rails/shared';

// Validate every *.map.json under the given folders and print balance stats.
const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('assets/maps');

function findMaps(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return path.endsWith('.map.json') ? [path] : [];
  return readdirSync(path).flatMap((name) => (name === 'sources' ? [] : findMaps(join(path, name))));
}

let failed = 0;
const files = roots.flatMap((r) => findMaps(resolve(r)));
for (const file of files) {
  const result = validateMap(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.ok) {
    failed += 1;
    console.error(`\n✗ ${file}\n${formatIssues(result.errors)}`);
    continue;
  }
  const { stats } = result;
  console.log(`\n✓ ${file}`);
  console.log(`  ${stats.cityCount} cities, ${stats.routeCount} routes, ${stats.totalTrains} trains`);
  console.log(`  kinds: ${stats.byKind.normal} normal, ${stats.byKind.tunnel} tunnel, ${stats.byKind.ferry} ferry`);
  console.log(`  tickets: ${stats.tickets.regular} regular, ${stats.tickets.long} long, points ${stats.tickets.minPoints}-${stats.tickets.maxPoints}`);
  const colored = CARD_COLORS.map((c) => stats.byColor[c].trains);
  const min = Math.min(...colored);
  const max = Math.max(...colored);
  console.log(`  trains per color: ${CARD_COLORS.map((c) => `${c} ${stats.byColor[c].trains}`).join(', ')}, gray ${stats.byColor.gray.trains}`);
  console.log(`  color spread: max/min = ${(max / Math.max(1, min)).toFixed(2)}`);
}
if (files.length === 0) {
  console.error('No *.map.json files found.');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
