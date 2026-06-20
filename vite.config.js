import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/garnet.ts'),
      name: 'GarnetJs',
      // the proper extensions will be added
      fileName: 'garnet',
      formats: ['es'],
    },
  },
});
