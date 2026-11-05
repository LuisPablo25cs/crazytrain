import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRailsServer, loadMap } from './app.js';

// Works from both src/ (dev) and dist/ (production): both sit two levels below the repo root.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const clientDist = process.env.CLIENT_DIST ?? resolve(repoRoot, 'apps/client/dist');
const starterMapPath = process.env.STARTER_MAP ?? resolve(repoRoot, 'assets/maps/north-america.map.json');
const mapImagesDir = process.env.MAP_IMAGES ?? resolve(repoRoot, 'assets/maps/images');
const artDir = process.env.ART_DIR ?? resolve(repoRoot, 'assets/web');
// The map editor writes files on this machine, so it is only on when asked for (npm run dev does).
const editorEnabled = process.argv.includes('--editor') || process.env.RAILS_EDITOR === '1';
const port = Number(process.env.PORT ?? 3001);

const server = createRailsServer({
  starterMap: loadMap(starterMapPath),
  clientDist,
  mapImagesDir,
  artDir,
  editor: editorEnabled ? { mapFile: starterMapPath } : undefined,
});
server.httpServer.listen(port, () => {
  console.log(`Rails server listening on http://localhost:${port}`);
  if (editorEnabled) console.log('Map editor is on: open /editor (in dev, http://localhost:5173/editor)');
});

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
