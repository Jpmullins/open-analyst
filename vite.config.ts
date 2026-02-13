import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';

const disableElectron = process.env.OPEN_ANALYST_NO_ELECTRON === '1';
const isHeadlessLinux =
  process.platform === 'linux' &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY;

const electronPlugins = disableElectron
  ? []
  : electron([
      {
        entry: 'src/main/index.ts',
        onstart(args) {
          if (isHeadlessLinux) {
            console.warn(
              '[dev] No DISPLAY/WAYLAND_DISPLAY detected; skipping Electron startup and serving renderer only.',
            );
            return;
          }
          args.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'better-sqlite3',
                'ws',
                'bufferutil',
                'utf-8-validate',
              ],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(args) {
          if (isHeadlessLinux) {
            return;
          }
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]);

export default defineConfig({
  plugins: [
    react(),
    ...electronPlugins,
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      'react-i18next': resolve(__dirname, 'src/renderer/shims/react-i18next.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
