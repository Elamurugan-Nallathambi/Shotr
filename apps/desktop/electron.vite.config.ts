import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: r('src/main/main.ts') },
        // Bundle the engine into main; only the native deps stay external and
        // are packed as real node_modules.
        external: ['playwright', 'playwright-core', 'sharp'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: r('src/preload/preload.ts') } },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          control: r('src/renderer/control.html'),
          overlay: r('src/renderer/overlay.html'),
          editor: r('src/renderer/editor.html'),
          picker: r('src/renderer/picker.html'),
          webcapture: r('src/renderer/webcapture.html'),
        },
      },
    },
  },
});
