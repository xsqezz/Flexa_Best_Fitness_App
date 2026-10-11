import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { 'import.meta.env.VITE_POLISH_CATALOG_HASH': JSON.stringify('e'.repeat(64)) },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', '../supabase/functions/_tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
