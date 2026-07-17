import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'worker/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      enabled: false,
      thresholds: {
        lines: 80,
        branches: 75,
      },
      include: [
        'worker/services/**/*.ts',
        'worker/middleware/**/*.ts',
        'worker/db/**/*.ts',
        'worker/auth/**/*.ts',
        'worker/http/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        'worker/test/**',
        'worker/db/migrations/**',
        'worker/db/client.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
