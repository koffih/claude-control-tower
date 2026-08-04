import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageSrc = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    /**
     * Tests run against source, not against `dist`.
     *
     * Without these aliases the workspace symlinks resolve to compiled output,
     * which has two consequences: a stale build silently changes what the tests
     * exercise, and coverage instrumentation never sees the source files at all
     * (every cross-package module reports 0%). Pointing at `src` fixes both and
     * removes the need to build before testing.
     */
    alias: {
      '@cct/core': packageSrc('core'),
      '@cct/render': packageSrc('render'),
      '@cct/collectors': packageSrc('collectors'),
      '@cct/plugin-sdk': packageSrc('plugin-sdk'),
      '@cct/plugins-builtin': packageSrc('plugins-builtin'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/status-input.ts',
        '**/testing/**',
        // Command entry points are covered by their own tests where they carry
        // logic; `init` and `doctor` are interactive and filesystem-mutating, and
        // are exercised end to end rather than unit tested.
        'packages/cli/src/commands/init.ts',
        'packages/cli/src/commands/doctor.ts',
        'packages/cli/src/commands/statusline.ts',
        'packages/cli/src/cli.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
