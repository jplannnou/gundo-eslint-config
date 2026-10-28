#!/usr/bin/env node
// Política de versión de Node para el fleet GUNDO.
//
// Por qué existe: al preparar la migración a Node 26 (oct-2026) la versión de
// Node aparecía escrita a mano en decenas de sitios del fleet, con casos de
// `.nvmrc` y Dockerfile en majors distintos (lo probado en local no era lo que
// corría en producción), apps sin versión fijada que dejaban elegir al
// buildpack, y dependencia de corepack, que Node 26 ya no distribuye.
//
// La regla: el `.nvmrc` es la ÚNICA fuente de la versión. Todo lo demás
// (Dockerfile, engines, workflows, @types/node) tiene que coincidir con él o
// leerlo. Una línea con `node-policy: allow` se salta, para las excepciones
// justificadas, que así quedan a la vista en el diff.
//
// Uso: node scripts/node-policy.mjs [dir]   → sale con 1 si hay violaciones.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.gundo-node-policy'])
const ALLOW = 'node-policy: allow'

// Sólo lo versionado: en un checkout local hay worktrees anidados
// (`.claude/worktrees/*`) con Dockerfiles propios que no son de esta rama.
// Fuera de git (los fixtures de los tests) se recorre el disco.
function listFiles(root) {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean).map((f) => join(root, f)).filter((f) => existsSync(f))
  } catch {
    return walk(root)
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

// --- semver mínimo: lo justo para los rangos que usa el fleet en `engines` ---

function parsePartial(v) {
  const m = String(v).trim().replace(/^v/, '').match(/^(\d+|[x*])(?:\.(\d+|[x*]))?(?:\.(\d+|[x*]))?/i)
  if (!m) return null
  const n = (s) => (s === undefined || /[x*]/i.test(s) ? null : Number(s))
  return [n(m[1]), n(m[2]), n(m[3])]
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

function comparatorToBounds(token) {
  const m = token.match(/^(\^|~|>=|<=|>|<|=)?\s*(.*)$/)
  const op = m[1] ?? ''
  const p = parsePartial(m[2])
  if (!p) return m[2] === '' || m[2] === '*' ? [] : null
  const [ma, mi, pa] = p
  if (ma === null) return []
  const lo = [ma, mi ?? 0, pa ?? 0]
  const nextOf = () => (mi === null ? [ma + 1, 0, 0] : pa === null ? [ma, mi + 1, 0] : null)
  switch (op) {
    case '^': return [['>=', lo], ['<', ma > 0 || mi === null ? [ma + 1, 0, 0] : [0, mi + 1, 0]]]
    case '~': return [['>=', lo], ['<', mi === null ? [ma + 1, 0, 0] : [ma, mi + 1, 0]]]
    case '>=': return [['>=', lo]]
    case '>': return nextOf() ? [['>=', nextOf()]] : [['>', lo]]
    case '<': return [['<', lo]]
    case '<=': return nextOf() ? [['<', nextOf()]] : [['<=', lo]]
    default: return nextOf() ? [['>=', lo], ['<', nextOf()]] : [['=', lo]]
  }
}

export function satisfies(version, range) {
  const v = parsePartial(version)
  return String(range).split('||').some((set) => {
    const tokens = set.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean)
    return tokens.every((t) => {
      const bounds = comparatorToBounds(t)
      if (bounds === null) return false
      return bounds.every(([op, b]) => {
        const c = cmp(v, b)
        return op === '>=' ? c >= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : op === '<=' ? c <= 0 : c === 0
      })
    })
  })
}

// --- reglas ---

export function checkRepo(root) {
  const errors = []
  const rel = (f) => relative(root, f).replaceAll('\\', '/')
  const nvmrcPath = join(root, '.nvmrc')
  if (!existsSync(nvmrcPath)) {
    return ['.nvmrc: no existe. Es la fuente única de la versión de Node; créalo con la versión exacta (p. ej. 26.13.0).']
  }
  const raw = readFileSync(nvmrcPath, 'utf8').trim()
  const parsed = parsePartial(raw)
  if (!parsed || parsed[0] === null) return [`.nvmrc: "${raw}" no es una versión (se espera p. ej. 26.13.0).`]
  const major = parsed[0]
  // Con un .nvmrc parcial ("26") se prueba el extremo alto del major, para que
  // un `^26.12.1` en engines no salte en falso.
  const probe = [parsed[0], parsed[1] ?? 999, parsed[2] ?? 999].join('.')

  const files = listFiles(root)
  const lines = (f) => readFileSync(f, 'utf8').split(/\r?\n/)
  const isCode = (l) => !l.trim().startsWith('#') && !l.includes(ALLOW)

  for (const f of files.filter((f) => /^Dockerfile(\..+)?$|\.Dockerfile$/.test(basename(f)))) {
    lines(f).forEach((l, i) => {
      if (!isCode(l)) return
      const from = l.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(?:\S+\/)?node:(\S+)/i)
      if (from) {
        const tagMajor = from[1].match(/^(\d+)/)?.[1]
        if (!tagMajor) errors.push(`${rel(f)}:${i + 1}: \`node:${from[1]}\` no fija el major. Usa node:${raw}-<variante>.`)
        else if (Number(tagMajor) !== major) errors.push(`${rel(f)}:${i + 1}: FROM node:${from[1]} es Node ${tagMajor}, pero .nvmrc dice ${raw}.`)
      }
      if (/\bcorepack\b/.test(l)) errors.push(`${rel(f)}:${i + 1}: usa corepack, que Node 26 ya no distribuye. Instala pnpm con npm leyendo packageManager.`)
    })
  }

  for (const f of files.filter((f) => /[\\/]\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/.test(f))) {
    lines(f).forEach((l, i) => {
      if (!isCode(l)) return
      if (/\bcorepack\b/.test(l)) errors.push(`${rel(f)}:${i + 1}: usa corepack, que Node 26 ya no distribuye. Usa pnpm/action-setup.`)
      const nv = l.match(/^\s*-?\s*node-version:\s*(.*?)\s*$/)
      if (!nv || nv[1] === '' || nv[1].startsWith('${{')) return
      if (nv[1].startsWith('[')) {
        const majors = [...nv[1].matchAll(/(\d+)(?:\.\d+)*/g)].map((m) => Number(m[1]))
        if (!majors.includes(major)) errors.push(`${rel(f)}:${i + 1}: la matriz ${nv[1]} no incluye Node ${major} (.nvmrc).`)
        return
      }
      errors.push(`${rel(f)}:${i + 1}: node-version ${nv[1]} escrito a mano. Usa \`node-version-file: .nvmrc\`.`)
    })
  }

  const rootPkg = join(root, 'package.json')
  for (const f of files.filter((f) => basename(f) === 'package.json')) {
    let pkg
    try { pkg = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
    const engines = pkg.engines?.node
    if (engines && !satisfies(probe, engines)) errors.push(`${rel(f)}: engines.node "${engines}" no admite ${raw} (.nvmrc).`)
    for (const sec of ['dependencies', 'devDependencies']) {
      const t = pkg[sec]?.['@types/node']
      const tMajor = t && Number(String(t).match(/(\d+)/)?.[1])
      if (tMajor && tMajor > major) errors.push(`${rel(f)}: @types/node ${t} tipa Node ${tMajor}, pero el runtime es ${major}: permitiría usar APIs que no existen en producción.`)
    }
    if (f === rootPkg && !engines && files.some((x) => /^apphosting(\..+)?\.ya?ml$/.test(basename(x)))) {
      errors.push('package.json: hay apphosting.yaml pero no engines.node. Sin él, el buildpack elige la versión de Node por su cuenta.')
    }
  }
  return errors
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.argv[2] ?? '.'
  const errors = checkRepo(root)
  if (errors.length) {
    console.error(`node-policy: ${errors.length} violación(es)\n`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exit(1)
  }
  console.info(`node-policy: OK (.nvmrc ${readFileSync(join(root, '.nvmrc'), 'utf8').trim()})`)
}
