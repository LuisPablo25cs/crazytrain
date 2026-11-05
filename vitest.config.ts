import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './apps/server',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          root: './apps/client',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'tools',
          root: './tools',
          include: ['**/*.test.ts'],
        },
      },
    ],
  },
});
