// Preset NestJS — backends hexagonales (genie-api, nut-engine, payments,
// mastra-*, product-pipeline, internal-dashboard-api, etc).
//
// Extiende `base` con: globals de Node + import/order. Las reglas de CAPAS
// específicas de cada repo (ej. `core/` no importa cloud SDKs en products-v2)
// NO viven acá — se añaden en el eslint.config.mjs del repo, encima de este
// preset, porque son contrato de esa arquitectura y no del fleet.
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import base from './base.js'

export default [
  ...base,
  {
    files: ['**/*.ts'],
    plugins: { import: importPlugin },
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
]
