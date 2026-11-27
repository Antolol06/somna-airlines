import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The presentation is its own app. It shares the website's node_modules and imports a few of
// its modules read-only (the capsule model, brand data) through the `@site` alias — the
// website itself is never modified or rebuilt by this config.
const here = fileURLToPath(new URL('.', import.meta.url));
const project = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-deck', import.meta.url)),
  resolve: { alias: { '@site': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { port: 5180, strictPort: true, fs: { allow: [project] } },
  preview: { port: 5181, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
