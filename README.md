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
