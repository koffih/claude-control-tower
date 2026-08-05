// @ts-check
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Architectural boundaries are enforced by the linter, not by convention.
 *
 * `@cct/core` is the domain layer: it must stay pure so that every rule in it is
 * trivially testable and instant to run. Forbidding Node's I/O modules there is
 * what keeps that promise honest as the project grows and contributors arrive.
 */
const NODE_IO_MODULES = [
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:os',
  'node:process',
  'fs',
  'child_process',
  'os',
];

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // A dedicated lint-only project, so that tests, build configs and the bin
        // shim are all type-aware without being dragged into the build graph.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_IO_MODULES.map((name) => ({
            name,
            message:
              '@cct/core is the pure domain layer. Move I/O into @cct/collectors and pass the result in as data.',
          })),
        },
      ],
    },
  },
  {
    // The CLI is the only layer allowed to talk to stdout/stderr.
    files: ['packages/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    /**
     * The bin shim is plain JS running under Node, so the Node globals it uses
     * have to be declared; TypeScript files get them from @types/node instead.
     *
     * Type-aware linting is switched off here on purpose. Its only import is
     * `dist/cct.bundle.js`, a build artifact that does not exist on a fresh
     * clone, so every type in the file would resolve to `any` and the rules
     * would report noise rather than defects. The file is a twenty-line
     * dispatcher; there is nothing for type-aware rules to find.
     */
    files: ['**/bin/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/bench/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
