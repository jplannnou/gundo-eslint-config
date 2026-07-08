// Preset NestJS — backends hexagonales (genie-api, nut-engine, payments,
// mastra-*, product-pipeline, internal-dashboard-api, etc).
//
// Extiende `base` con globals de Node. Las reglas de CAPAS específicas de cada
// repo (ej. `core/` no importa cloud SDKs en products-v2) NO viven acá — se
// añaden en el eslint.config.mjs del repo, encima de este preset.
//
// NOTA: NO incluye eslint-plugin-import. Ese plugin (v2.x) no soporta ESLint
// 10, y varios repos de la org tienen overrides de seguridad de
// `brace-expansion` que rompen el minimatch@3 del core de ESLint 9 → esos
// repos DEBEN correr en ESLint 10. Sin import, el preset funciona en 9 y 10.
import globals from "globals";
import base from "./base.js";

export default [
  ...base,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // consistent-type-imports (error en base) se APAGA para NestJS. Su autofix
      // convierte una clase @Injectable() inyectada por constructor a
      // `import type`, que se borra en el JS emitido → en runtime NestJS resuelve
      // la dependencia a `undefined` y la app crashea al arrancar
      // ("Nest can't resolve dependencies of X (?)"). tsc pasa; el fallo es solo
      // en runtime (se ve al bootear en Cloud Run, no en CI de tipos). El linter
      // no puede distinguir de forma fiable un tipo usado para metadata de DI de
      // un import type-only real, así que la regla es incompatible con la DI de
      // NestJS y se desactiva a nivel preset (los presets react-vite/next/lib la
      // conservan: ahí no hay DI por constructor y el hint de type-only sí aporta).
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
