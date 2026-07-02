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

process.exit(failed ? 1 : 0)
