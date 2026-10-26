import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repository>/.
export default defineConfig({
  base: '/spacesim/',
  build: { target: 'es2022' },
});
