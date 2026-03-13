import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/rr7/global-setup.ts'],
    setupFiles: ['./tests/rr7/tc-env-setup.ts', 'dotenv/config'],
    include: ['app/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', '.claude', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
'**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
      ],
    },
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
