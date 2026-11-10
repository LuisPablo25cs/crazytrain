import express from 'express';
import { existsSync, readdirSync } from 'node:fs';
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
  // Which optional art exists, so the client never asks for a file that is not there.
  app.get('/api/art', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    const fonts = artDir && existsSync(join(artDir, 'fonts')) ? readdirSync(join(artDir, 'fonts')) : [];
    const numberFont = fonts.find((f) => /rosella/i.test(f)) ?? fonts[0];
    // City label art (assets/web/cities/<city-id>.webp, from tools/assets/prepare-city-labels.py).
    const cityLabels =
      artDir && existsSync(join(artDir, 'cities'))
        ? readdirSync(join(artDir, 'cities'))
            .filter((f) => f.endsWith('.webp'))
            .map((f) => f.slice(0, -'.webp'.length))
        : [];
    res.json({
      ticketTemplate: !!artDir && existsSync(join(artDir, 'ui', 'ticket.webp')),
      numberFont: numberFont ? `/art/fonts/${numberFont}` : null,
      cityLabels,
    });
  });
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
