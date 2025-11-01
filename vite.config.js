import { defineConfig } from 'vite';

// Vite configuration keeps the project lightweight while enabling module imports
// in the browser during development. The production build outputs to /dist.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
