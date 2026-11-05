import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = process.env.SERVER_PORT ?? '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
      '/maps': `http://localhost:${serverPort}`,
      '/art': `http://localhost:${serverPort}`,
      '/api': `http://localhost:${serverPort}`,
      '/healthz': `http://localhost:${serverPort}`,
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
