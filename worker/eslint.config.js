import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['coverage/', 'dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        Blob: 'readonly',
        BodyInit: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        performance: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        btoa: 'readonly',
      },
    },
  },
)
