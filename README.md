# @jplannnou/eslint-config

Configs ESLint (flat, ESLint 9+) compartidas para el fleet GUNDO. Fuente única
de verdad: bumpear ESLint o cambiar reglas base se hace **acá**, no en 30 repos.

## Presets

| Import | Para |
|---|---|
| `@jplannnou/eslint-config` (o `/base`) | común TS |
| `@jplannnou/eslint-config/nest` | backends NestJS |
| `@jplannnou/eslint-config/react-vite` | SPAs Vite (React 19) |
| `@jplannnou/eslint-config/next` | apps Next.js 16 (App Router) |
| `@jplannnou/eslint-config/lib` | librerías React (@gundo/ui, SDKs) |

## Instalar

El paquete vive en GitHub Packages (scope `@jplannnou`). El repo consumidor
necesita `.npmrc`:

```
@jplannnou:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
pnpm add -D @jplannnou/eslint-config eslint
```

## Usar

`eslint.config.mjs` del repo:

```js
import gundo from '@jplannnou/eslint-config/nest' // o /react-vite, /next, /lib
export default gundo
```

Con reglas propias encima (ej. contrato de capas):

```js
import gundo from '@jplannnou/eslint-config/nest'
export default [
  ...gundo,
  {
    files: ['core/**/*.ts'],
    rules: { 'no-restricted-imports': [/* … */] },
  },
]
```

Script en `package.json`: `"lint": "eslint ."` (Next 16 removió `next lint`).

## Orden de imports (`import-x/order`, sólo preset `/nest`)

El preset `/nest` trae `import-x/order` en **warn** (hueco entre grupos,
alfabético case-insensitive). El plugin es
[`eslint-plugin-import-x`](https://github.com/un-ts/eslint-plugin-import-x), el
fork mantenido — **no** `eslint-plugin-import`. Consecuencias prácticas:

- El id de la regla es `import-x/order`, no `import/order`. Un
  `// eslint-disable-next-line import/order` **no** desactiva nada.
- No instales `eslint-plugin-import` en un repo del fleet. Su 2.x llama a
  `sourceCode.getTokenOrCommentAfter()`, borrada en ESLint 10: no reporta un
  error de lint, mata el proceso con `exit 2` y tumba el lint entero.

El paquete soporta ESLint 9 **y** 10 (peer `>=9`), y el CI lo verifica en
ambas: `pnpm test` ejecuta las reglas de cada preset sobre código real, así que
un plugin que sólo carga pero no corre falla el build.

## CI (ratchet)

En `.github/workflows/ci.yml` del repo:

```yaml
jobs:
  lint:
    uses: jplannnou/gundo-eslint-config/.github/workflows/lint-reusable.yml@main
    secrets: inherit
```

Por defecto lintea **sólo archivos cambiados** (ratchet) — bloquea errores
nuevos sin exigir arreglar la deuda preexistente primero. Cuando termines el
burn-down de un repo: `with: { ratchet: false }`.

## Versionado

`semantic-release` publica en cada push a `main` (commits convencionales).
