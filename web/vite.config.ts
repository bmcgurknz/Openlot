import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds from one codebase:
//   npm run build         → server edition UI (served by the Node app)
//   npm run build:static  → static edition: ONE self-contained index.html
//                           with all code inlined, so it runs from a
//                           double-click (file://), a USB stick, an email
//                           attachment, or any web host / WordPress upload.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'static' ? [react(), viteSingleFile()] : [react()],
  base: mode === 'static' ? './' : '/',
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // domain engine lives in ../src
    proxy: {
      '/api': 'http://localhost:4400',
      '/auth': 'http://localhost:4400'
    }
  },
  build: {
    outDir: mode === 'static' ? 'dist-static' : 'dist',
    sourcemap: mode === 'static' ? false : true
  }
}));
