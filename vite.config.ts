import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from 'vite';
import { resolve } from 'path';

const ignoredWatchGlobs = [
  '**/services/**',
  '**/build/**',
  '**/test-results/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/.venv/**',
];

export default defineConfig({
  plugins: [reactRouter()],
  server: {
    watch: {
      ignored: ignoredWatchGlobs,
    },
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'src'),
    },
  },
});
