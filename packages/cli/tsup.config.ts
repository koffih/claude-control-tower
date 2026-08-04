import { defineConfig } from 'tsup';

/**
 * Bundling exists here for one reason: startup latency.
 *
 * Claude Code runs `cct statusline` on every render. Measured on this machine the
 * cost splits roughly into 60ms of Node process startup, which nothing can
 * recover, ~35ms resolving and loading 45 separate ESM modules, and the actual
 * work. Collapsing those modules into a single file removes almost all of the
 * middle term for free.
 *
 * The published binary therefore runs the bundle, while `dist/index.js` remains
 * the unbundled entry point for anyone importing the package as a library.
 */
export default defineConfig({
  entry: { 'cct.bundle': 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Every @cct/* workspace package is bundled in; there are no runtime
  // dependencies outside the workspace, so nothing needs to stay external.
  noExternal: [/^@cct\//],
  splitting: false,
  treeshake: true,
  minify: false,
  // Types come from `tsc --build`, which owns declaration output for the whole
  // monorepo. Emitting them twice would only create a second source of truth.
  dts: false,
  sourcemap: true,
  clean: false,
  outDir: 'dist',
});
