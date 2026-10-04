// Smoke test: cada preset debe cargar sin romper (imports/plugins resueltos y
// forma de flat-config válida). No corre reglas — sólo valida que el paquete
// es consumible. Falla el CI si un preset no importa o no es un array.
const presets = ['base', 'nest', 'react-vite', 'next', 'lib']
let failed = false

for (const name of presets) {
  try {
    const mod = await import(`../${name}.js`)
    const cfg = mod.default
    if (!Array.isArray(cfg) || cfg.length === 0) {
      console.error(`✗ ${name}: default export no es un flat-config array`)
      failed = true
    } else {
      console.info(`✓ ${name}: ${cfg.length} config objects`)
    }
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`)
    failed = true
  }
}

// Reglas custom del fleet: correr sus RuleTester (lanzan si un caso falla).
try {
  await import('./no-unsafe-cors-subdomain.test.mjs')
} catch (err) {
  console.error(`✗ no-unsafe-cors-subdomain: ${err.message}`)
  failed = true
}

// ─────────────────────────────────────────────────────────────────────────────
// Guarda de EJECUCIÓN, no sólo de carga.
//
// Por qué existe: `eslint-plugin-import@2.x` importaba y cargaba perfecto en
// ESLint 10 — el smoke de arriba pasaba en verde — y luego reventaba al LINTEAR
// de verdad, con un TypeError que mata el proceso (exit 2) en vez de reportar
// un error de lint. Un plugin sólo demuestra ser compatible cuando sus reglas
// corren sobre código real con el ESLint instalado. Esto lo fuerza.
const { Linter } = await import('eslint')
const linter = new Linter({ configType: 'flat' })

const sample = `import { readFile } from 'node:fs/promises'

export const run = async (p) => readFile(p)
`

for (const [name, filename] of [
  ['base', 'sample.ts'],
  ['nest', 'sample.ts'],
  ['react-vite', 'sample.tsx'],
  ['next', 'sample.tsx'],
  ['lib', 'sample.tsx'],
]) {
  try {
    const { default: cfg } = await import(`../${name}.js`)
    linter.verify(sample, cfg, filename)
    console.info(`✓ ${name}: las reglas CORREN sobre código real`)
  } catch (err) {
    console.error(`✗ ${name}: crash al lintear — ${err.message}`)
    failed = true
  }
}

// `import-x/order` tiene que REPORTAR, no sólo estar registrada: si el plugin
// desapareciera del preset el lint quedaría verde en falso, que es justo el
// modo de fallo que hay que evitar al reponer una regla.
try {
  const { default: nestCfg } = await import('../nest.js')
  const desordenado = `import base from './base.js'
import globals from 'globals'

export const x = [base, globals]
`
  const msgs = linter.verify(desordenado, nestCfg, 'sample.ts')
  const hit = msgs.find((m) => m.ruleId === 'import-x/order')
  if (hit) {
    console.info(`✓ import-x/order: reporta (${hit.message})`)
  } else {
    console.error(
      '✗ import-x/order: no reportó sobre imports desordenados — la regla no está corriendo',
    )
    failed = true
  }
} catch (err) {
  console.error(`✗ import-x/order: ${err.message}`)
  failed = true
}

// ─────────────────────────────────────────────────────────────────────────
// Guarda de COBERTURA del ratchet: el `globs` por defecto de lint-reusable.yml
// tiene que casar con TODA extensión que los presets lintean.
//
// Por qué existe: son dos listas escritas a mano que tienen que coincidir y
// nadie las comparaba. En push el reusable corre `eslint .` (lo que dicten los
// presets); en PR sólo pasa a eslint lo que case con `globs`. Con el default
// `\.(ts|tsx|js|jsx)$` los `.mjs`/`.cjs`/`.mts`/`.cts` nunca se lintaban en el
// PR y su error aparecía después del merge. Mordió cuatro veces en el fleet
// (nutritional-engine-api #417, payments-api #77, ecommerce-ui #1487,
// plataform-ui #293); en NE dejó el deploy de producción sin salir.
//
// Si no se puede leer el default, FALLA: una guarda que no puede comprobar nada
// no puede pasar en verde.
try {
  const { readFile } = await import('node:fs/promises')
  const yml = (
    await readFile(new URL('../.github/workflows/lint-reusable.yml', import.meta.url), 'utf8')
  ).replace(/\r\n/g, '\n')
  // Líneas del bloque `globs:` (inputs a 6 espacios, sus claves a 8 o más).
  const bloque = yml.match(/^ {6}globs:\n((?: {8}.*\n)+)/m)
  const def = bloque?.[1].match(/^ {8}default:\s*'(.+)'\s*$/m)
  if (!def) {
    throw new Error(
      "no encuentro el default (entre comillas simples) del input `globs` en lint-reusable.yml; sin él no se puede comprobar la cobertura",
    )
  }
  const globs = new RegExp(def[1])

  // Extensión final de cada patrón `files` de cada preset: `**/*.ts` → ts,
  // `**/*.{ts,tsx,js}` → ts,tsx,js. Incluye los de typescript-eslint, que son
  // los que meten `.mts`/`.cts`.
  const extensiones = new Set()
  for (const name of presets) {
    const { default: cfg } = await import(`../${name}.js`)
    for (const objeto of cfg) {
      for (const patron of objeto.files ?? []) {
        if (typeof patron !== 'string') continue
        const m = patron.match(/\.(?:\{([^}]+)\}|([A-Za-z0-9]+))$/)
        if (!m) continue
        for (const ext of (m[1] ?? m[2]).split(',')) extensiones.add(ext.trim())
      }
    }
  }
  if (extensiones.size === 0) throw new Error('los presets no declaran ninguna extensión en `files`')

  const sinCubrir = [...extensiones].filter((ext) => !globs.test(`ejemplo.${ext}`))
  if (sinCubrir.length === 0) {
    console.info(
      `✓ ratchet: el globs por defecto cubre las ${extensiones.size} extensiones que lintean los presets (${[...extensiones].join(', ')})`,
    )
  } else {
    console.error(
      `✗ ratchet: el globs por defecto (${def[1]}) NO cubre .${sinCubrir.join(', .')}, que los presets sí lintean en push. ` +
        'Un error ahí pasa el PR en verde y revienta después del merge. Amplía `globs` en lint-reusable.yml.',
    )
    failed = true
  }
} catch (err) {
  console.error(`✗ ratchet: ${err.message}`)
  failed = true
}

// ─────────────────────────────────────────────────────────────────────────
// Guarda del RELEASE: ningún plugin de semantic-release puede escribir en `main`.
//
// Por qué existe: `main` está protegida (PR obligatorio + check `validate`) y el
// GITHUB_TOKEN del workflow no puede saltarse esa protección. `@semantic-release/git`
// crea un commit `chore(release)` y lo empuja a `main`: GitHub lo rechaza con
// GH006 y el release revienta en `prepare`, ANTES de publicar. Estuvo en rojo en
// cada push a `main` desde 2026-09-03, con el último release en v1.4.3.
// La versión sale de los tags y del registro; el `version` de package.json es un
// marcador y no se commitea de vuelta. El núcleo sólo empuja tags (`git push --tags`).
//
// Si no se puede leer la config, FALLA: una guarda que no puede comprobar nada
// no puede pasar en verde.
try {
  const { readFile } = await import('node:fs/promises')
  const leer = async (ruta) =>
    JSON.parse(await readFile(new URL(`../${ruta}`, import.meta.url), 'utf8'))
  const pkg = await leer('package.json')
  const rc = await leer('.releaserc.json')

  // Una clave `release` en package.json gana a `.releaserc.json` (cosmiconfig) y
  // dejaría esta guarda comprobando una config que semantic-release ni mira.
  if (pkg.release !== undefined) {
    throw new Error(
      'package.json tiene una clave `release`: semantic-release la usaría en vez de .releaserc.json y esta guarda no vería los plugins reales',
    )
  }
  if (!Array.isArray(rc.plugins)) throw new Error('.releaserc.json no declara `plugins`')

  const nombres = rc.plugins.map((p) => (Array.isArray(p) ? p[0] : p))
  const escribenEnMain = nombres.filter((n) => n === '@semantic-release/git')
  if (escribenEnMain.length === 0) {
    console.info(`✓ release: ningún plugin empuja commits a main (${nombres.join(', ')})`)
  } else {
    console.error(
      `✗ release: ${escribenEnMain.join(', ')} empuja un commit a \`main\`, que está protegida: ` +
        'GitHub lo rechaza (GH006) y el release falla antes de publicar. Quita el plugin; la versión sale de los tags.',
    )
    failed = true
  }
} catch (err) {
  console.error(`✗ release: ${err.message}`)
  failed = true
}

process.exit(failed ? 1 : 0)
