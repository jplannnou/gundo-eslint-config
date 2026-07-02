// Preset librería React — gundo-ui (design system), feedback-sdk, support-sdk.
// Como react-vite pero SIN react-refresh (una lib no es una app con HMR).
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import base from './base.js'

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
]
