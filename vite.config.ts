import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` inlines everything into one index.html (handy for sharing/hosting anywhere).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
}));
