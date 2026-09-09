import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig says jsx: "preserve" because Next compiles the JSX itself, and
  // vite's transformer honours that and leaves the JSX in place — which vite
  // then cannot parse. Overriding it here is what lets a test import anything
  // that renders, the guide bodies in particular.
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
