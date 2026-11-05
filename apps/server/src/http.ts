import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface HttpOptions {
  /** Built client, served with an SPA fallback. */
  clientDist?: string;
  /** Map background images, served at /maps (terrain.image). */
  mapImagesDir?: string;
  /** Web-sized game art (slot images and so on), served at /art. */
  artDir?: string;
  /** Extra routes registered before the SPA fallback (the dev-only map editor). */
  extraRoutes?: (app: express.Express) => void;
}

/** Express app: health check, static assets, optional extra routes, and the built client. */
export function createHttpApp(options: HttpOptions = {}): express.Express {
  const { clientDist, mapImagesDir, artDir, extraRoutes } = options;
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  if (mapImagesDir && existsSync(mapImagesDir)) {
    app.use('/maps', express.static(mapImagesDir, { maxAge: '1d', fallthrough: false }));
  }
  if (artDir && existsSync(artDir)) {
    app.use('/art', express.static(artDir, { maxAge: '1d', fallthrough: false }));
  }
  extraRoutes?.(app);
  if (clientDist && existsSync(join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/socket.io') || req.path.startsWith('/api/')) return next();
      res.sendFile(join(clientDist, 'index.html'));
    });
  }
  return app;
}
