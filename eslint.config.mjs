import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jest from 'eslint-plugin-jest';
import tsdoc from 'eslint-plugin-tsdoc';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'artifacts', '.artifacts', '.remember'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { tsdoc, import: importPlugin, 'unused-imports': unusedImports },
    settings: {
      'import/resolver': {
        node: { extensions: ['.js', '.ts'] },
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      // Project invariants — kept strict (do not relax).
      'tsdoc/syntax': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      curly: ['error', 'all'],

      // Naming conventions: I-prefixed interfaces, *Enum enums, UPPER_CASE members.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
        { selector: 'enum', format: ['PascalCase'], suffix: ['Enum'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
      ],

      // Unused-imports (replaces base no-unused-vars to avoid double-reporting).
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Import hygiene, ordering (@nestjs/** first), and dependency safety.
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'error',
      'import/newline-after-import': ['error', { count: 1 }],
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: ['**/*.spec.ts', 'test/**/*.ts', '**/*.config.ts', 'eslint.config.mjs'] },
      ],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '@nestjs/**', group: 'external', position: 'before' },
            { pattern: '@common/**', group: 'internal' },
            { pattern: '@modules/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['@nestjs/**'],
          'newlines-between': 'never',
        },
      ],
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // Jest matchers reference mocked class methods unbound; use the jest-aware rule.
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error',
    },
  },
  prettier,
  // Config and other plain JS/MJS files sit outside the TypeScript project, so
  // lint them without type information rather than excluding them entirely.
  { files: ['**/*.mjs', '**/*.cjs', '**/*.js'], ...tseslint.configs.disableTypeChecked },
);
