import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs/promises';
import path from 'node:path';

// Library mode emits a classic script: ES modules cannot be loaded reliably from
// the device's file:// origin. All runtime dependencies are bundled locally.
export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls: false } }),
    {
      name: 'device-assets',
      async closeBundle() {
        await Promise.all(['css', 'fonts', 'images'].map(dir => fs.cp(path.join('ui', dir), path.join('dist/ui', dir), { recursive: true })));
        await fs.copyFile('ui/index.html', 'dist/ui/index.html');
      }
    }
  ],
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false },
  build: {
    target: 'chrome69', outDir: 'dist/ui', emptyOutDir: true,
    lib: { entry: 'ui/src/main.js', name: 'CarThing', formats: ['iife'], fileName: () => 'app.js' }
  }
});
