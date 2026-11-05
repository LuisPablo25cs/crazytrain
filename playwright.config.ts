import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4310);

// Runs against the production build (npm run build), the same thing Render serves.
export default defineConfig({
  testDir: 'apps/client/e2e',
  timeout: 60_000,
  retries: 0,
  // Each test renders WebGL in software; running them in parallel starves them all.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1366, height: 768 },
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Headless machines often have no GPU; SwiftShader gives WebGL in software.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'node apps/server/dist/server.js',
    url: `http://localhost:${port}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
