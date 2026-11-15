import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', '.astro/', '.wrangler/', 'node_modules/', 'public/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // ADR 0001: content is read only through src/lib/content.
    files: ['src/**/*.{ts,tsx,astro}'],
    ignores: ['src/lib/content/**', 'src/content.config.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'astro:content',
              message: 'Read content through "@/lib/content" (see docs/adr/0001-content-access-module.md).',
            },
          ],
        },
      ],
    },
  },
);
