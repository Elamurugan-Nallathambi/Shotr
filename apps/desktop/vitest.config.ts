import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only the pure, headless-safe modules are covered. Electron-touching
      // code (main, capture, region-overlay, renderer Fabric wiring) cannot run
      // in a headless test environment and is intentionally excluded.
      include: [
        'src/main/crop.ts',
        'src/main/naming.ts',
        'src/main/config.ts',
        'src/main/hotkey.ts',
        'src/renderer/editor-tools.ts',
        'src/main/ipc.ts',
      ],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
