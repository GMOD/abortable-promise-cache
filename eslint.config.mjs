import eslint from '@eslint/js'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['esm/**/*', 'dist/**/*', '*.js', '*.mjs', 'example/*'],
  },
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.lint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginUnicorn.configs['flat/recommended'],
  {
    rules: {
      'no-underscore-dangle': 0,
      curly: 'error',
      'unicorn/no-null': 0,
      'unicorn/prevent-abbreviations': 0,
      'unicorn/filename-case': 0,
      '@typescript-eslint/filename-case': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/ban-types': 0,
      '@typescript-eslint/require-await': 0,
      '@typescript-eslint/no-empty-function': 0,
      semi: ['error', 'never'],
    },
  },
)
