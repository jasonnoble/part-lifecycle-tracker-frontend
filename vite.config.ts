import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    // Don't pick up test files inside transient agent git worktrees.
    exclude: [...configDefaults.exclude, '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        'src/main.tsx',
        'src/test/**',
        '**/*.test.{ts,tsx}',
      ],
      // Global floor (JAS-64). Initial suite achieves ~85% lines / 87% stmts /
      // 90% branches+funcs; floor set just under that to gate regressions
      // without being brittle on small line counts. Ratchet up as screens gain
      // tests; the per-PR diff gate is JAS-65.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
