// Base flat config — común a TODOS los arquetipos del fleet.
// Fuente única de verdad para las reglas TS transversales: cuando haya que
// bumpear ESLint (9→10) o cambiar una regla base, se toca ACÁ, no en 30 repos.
//
// Convenciones del fleet capturadas:
//   - `_`-prefix = binding intencionalmente sin usar (args, vars, catch).
//   - `consistent-type-imports` en error → imports de tipo separados.
//   - `no-console` warn salvo warn/error/info (logging estructurado igual).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Ignores compartidos. Cada repo puede AÑADIR los suyos, no quitar estos.
export const sharedIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-staging/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/out/**',
  '**/cdk.out/**',
]

export default tseslint.config(
  { ignores: sharedIgnores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // TS ya resuelve identificadores no definidos (y `no-undef` da falsos
      // positivos con globals/tipos ambientales). Recomendación oficial de
      // typescript-eslint: apagarlo. Los globals node/browser los aportan los
      // presets por arquetipo para el JS suelto (configs, scripts).
      'no-undef': 'off',
    },
  },
)
