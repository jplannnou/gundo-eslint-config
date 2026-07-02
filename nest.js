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
  },
];
