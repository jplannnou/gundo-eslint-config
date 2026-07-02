// Preset Next.js (App Router, Next 16) — plataform-ui, admin-fitness-ui,
// internal-dashboard-ui.
//
// Nota Next 16: `next lint` fue REMOVIDO (no solo deprecado). El repo debe
// usar `eslint .` como script de lint y este preset. Usa el flat config
// nativo de @next/eslint-plugin-next (sin FlatCompat / shim legacy).
import globals from 'globals'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import base from './base.js'

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
]
