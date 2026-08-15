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

process.exit(failed ? 1 : 0)
