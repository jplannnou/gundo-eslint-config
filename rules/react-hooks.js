// Reglas de react-hooks del fleet: SOLO las dos clásicas.
//
// `eslint-plugin-react-hooks` >= 7 (la primera línea con soporte de ESLint 10)
// amplió `configs.recommended` con 14 reglas del React Compiler
// (`set-state-in-effect`, `refs`, `purity`, `immutability`, …) en `error`.
// Subir de la 5.x a la 7.x con `...configs.recommended.rules` habría metido
// esas reglas en todos los consumidores sin que nadie lo decidiera, mezclando
// la migración a ESLint 10 con una política nueva de lint.
//
// Aquí se fija el conjunto que el fleet ya tenía con la 5.x (idéntico a su
// `recommended`): `rules-of-hooks` en error y `exhaustive-deps` en warn.
// Adoptar las reglas del Compiler es una decisión aparte, repo a repo; cuando
// se tome, se hace aquí (o con `reactHooks.configs.recommended`) en un PR propio.
export const reactHooksRules = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
}
