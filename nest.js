// Preset NestJS — backends hexagonales (genie-api, nut-engine, payments,
// mastra-*, product-pipeline, internal-dashboard-api, etc).
//
// Extiende `base` con globals de Node. Las reglas de CAPAS específicas de cada
// repo (ej. `core/` no importa cloud SDKs en products-v2) NO viven acá — se
// añaden en el eslint.config.mjs del repo, encima de este preset.
//
// ORDEN DE IMPORTS — se sirve con `eslint-plugin-import-x`, NO con
// `eslint-plugin-import`. El plugin clásico (2.x, última 2.32.0) declara peer
// `eslint` hasta ^9 y llama a `sourceCode.getTokenOrCommentAfter()`, API que
// ESLint 10 eliminó: en ESLint 10 no da un warning, CRASHEA el proceso entero
// ("TypeError: sourceCode.getTokenOrCommentAfter is not a function", exit 2) y
// tumba el lint de todo el repo. Como varios repos de la org tienen overrides
// de seguridad de `brace-expansion` que rompen el minimatch@3 del core de
// ESLint 9, esos repos DEBEN correr en ESLint 10 → el plugin clásico no es
// opción. `import-x` es el fork mantenido (peer `^8.57 || ^9 || ^10`), así que
// el preset recupera import/order y sigue funcionando en 9 y en 10.
//
// El plugin se registra bajo la clave `import-x`, no `import`: el id de la
// regla es `import-x/order`. Es deliberado — así un `eslint-disable` o un
// override apunta sin ambigüedad al plugin que realmente corre.
import globals from "globals";
import importX from "eslint-plugin-import-x";
import base from "./base.js";
import noUnsafeCorsSubdomain from "./rules/no-unsafe-cors-subdomain.js";

// Plugin local del fleet. Reglas propias que capturan bugs que ya pagamos una
// vez (ver rules/). Se registran solo en el preset donde aplican.
const gundoPlugin = {
  rules: { "no-unsafe-cors-subdomain": noUnsafeCorsSubdomain },
};

export default [
  ...base,
  {
    files: ["**/*.ts"],
    plugins: { gundo: gundoPlugin, "import-x": importX },
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Mismas opciones que tenía el `import/order` original del preset
      // (warn, hueco entre grupos, alfabético case-insensitive): esto REPONE
      // la regla que se cayó al soltar el plugin clásico, no estrena política.
      "import-x/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // Bug de CORS por subdominio (fitness/user-engine/payments, #15/#29/#32):
      // comparar `.${host}` contra un origin con protocolo nunca matchea. La
      // regla lo caza en cualquier servicio nuevo antes de que llegue a prod.
      "gundo/no-unsafe-cors-subdomain": "error",
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
