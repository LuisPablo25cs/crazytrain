import { build } from 'esbuild';

// Bundle the server and @rails/shared (TypeScript source) into one ESM file.
// Runtime dependencies stay external and load from node_modules.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['express', 'socket.io'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
