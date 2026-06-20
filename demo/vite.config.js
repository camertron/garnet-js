import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  assetsInclude: ['**/*.wasm', '**/*.woff', '**/*.woff2'],
  build: {
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
  },
});
