import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const workflowUrl = new URL('../.github/workflows/lint-reusable.yml', import.meta.url)
const isWindows = process.platform === 'win32'
const gitExe = isWindows
  ? execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
  : execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
const bashExe = isWindows
  ? 'C:\\Program Files\\Git\\bin\\bash.exe'
  : execFileSync('which', ['bash'], { encoding: 'utf8' }).trim()

function toMsysPath(value) {
  if (!isWindows) return value
  return value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/')
}

function extractRunStep(name) {
  const lines = readFileSync(workflowUrl, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line === `      - name: ${name}`)
  assert.notEqual(start, -1, `No existe el step ${name}`)
  const run = lines.findIndex((line, index) => index > start && line === '        run: |')
  assert.notEqual(run, -1, `El step ${name} no tiene run multilínea`)
  const body = []
  for (let index = run + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('      - name: ')) break
    assert.match(lines[index], /^(?:\s{10}|\s*$)/, `Indentación inesperada: ${lines[index]}`)
    body.push(lines[index].slice(10))
  }
  return `${body.join('\n')}\n`
}

function extractStep(name) {
  const lines = readFileSync(workflowUrl, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line === `      - name: ${name}`)
  assert.notEqual(start, -1, `No existe el step ${name}`)
  let end = lines.findIndex(
    (line, index) => index > start && line.startsWith('      - name: '),
  )
  if (end === -1) end = lines.length
  return lines.slice(start, end).join('\n')
}

function git(cwd, ...args) {
  return execFileSync(gitExe, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function createRepository(root, { unrelated = false } = {}) {
  const source = join(root, 'source')
  const remote = join(root, 'remote.git')
  const checkout = join(root, 'checkout')

  git(root, 'init', '--initial-branch=main', source)
  git(source, 'config', 'user.email', 'lint-test@gundo.invalid')
  git(source, 'config', 'user.name', 'GUNDO lint test')
  writeFileSync(join(source, 'base.txt'), 'base\n')
  git(source, 'add', 'base.txt')
  git(source, 'commit', '-m', 'base')

  if (unrelated) {
    git(source, 'checkout', '--orphan', 'feature')
    rmSync(join(source, 'base.txt'))
    git(source, 'rm', '--cached', 'base.txt')
  } else {
    git(source, 'branch', 'feature')
    writeFileSync(join(source, 'main.txt'), 'main\n')
    git(source, 'add', 'main.txt')
    git(source, 'commit', '-m', 'main advance')
    git(source, 'checkout', 'feature')
  }

  writeFileSync(join(source, 'feature.txt'), 'feature\n')
  git(source, 'add', 'feature.txt')
  git(source, 'commit', '-m', 'feature')
  git(root, 'clone', '--bare', source, remote)
  git(root, 'clone', '--depth=1', '--branch=feature', pathToFileURL(remote).href, checkout)
  return checkout
}

function installWrappers(root) {
  const bin = join(root, 'bin')
  const wrapper = join(bin, 'git')
  const sleep = join(bin, 'sleep')
  mkdirSync(bin)
  writeFileSync(
    wrapper,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" != fetch ]; then exec "$REAL_GIT" "$@"; fi

count=$(cat "$FIXTURE_FETCH_STATE")
IFS=',' read -r -a outcomes <<< "$FIXTURE_FETCH_OUTCOMES"
last=$((\${#outcomes[@]} - 1))
index=$count
if [ "$index" -gt "$last" ]; then index=$last; fi
outcome=\${outcomes[$index]}
printf '%s' "$((count + 1))" > "$FIXTURE_FETCH_STATE"
printf '%s\\t' "$@" >> "$FIXTURE_GIT_LOG"
printf '\\n' >> "$FIXTURE_GIT_LOG"

if [ "$outcome" = success ]; then exec "$REAL_GIT" "$@"; fi
if [ "$outcome" = success-without-ref ]; then exit 0; fi
if [ "$outcome" = transient-after-unshallow ]; then
  "$REAL_GIT" "$@"
  "$REAL_GIT" update-ref -d refs/remotes/origin/main
fi

case "$outcome" in
  transient|transient-after-unshallow)
    printf '%s\\n' 'fatal: unable to access remote: Failed to connect to github.com port 443: secret-marker' >&2 ;;
  auth)
    printf '%s\\n' 'remote: Invalid username or password secret-marker' 'fatal: Authentication failed' >&2 ;;
  auth-mixed)
    printf '%s\\n' 'fatal: Authentication failed secret-marker' 'Recv failure: Connection reset by peer' >&2 ;;
  ref)
    printf '%s\\n' "fatal: couldn't find remote ref main secret-marker" >&2 ;;
  ref-mixed)
    printf '%s\\n' "fatal: couldn't find remote ref main secret-marker" 'early EOF' >&2 ;;
  certificate)
    printf '%s\\n' 'fatal: unable to access remote: SSL certificate problem: secret-marker' >&2 ;;
  certificate-mixed)
    printf '%s\\n' 'SSL certificate problem: secret-marker' 'Recv failure: Connection reset by peer' >&2 ;;
esac
exit 128
`,
  )
  writeFileSync(sleep, '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(wrapper, 0o755)
  chmodSync(sleep, 0o755)
  return bin
}

function runFetch(outcomes, { baseRef = 'main', ...repositoryOptions } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gundo-lint-fetch-'))
  try {
    const checkout = createRepository(root, repositoryOptions)
    const bin = installWrappers(root)
    const script = join(root, 'fetch.sh')
    const state = join(root, 'state.txt')
    const log = join(root, 'git.log')
    writeFileSync(script, extractRunStep('Traer la rama base'))
    writeFileSync(state, '0')
    writeFileSync(log, '')
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'path') delete env[key]
    }
    env.FIXTURE_BIN = toMsysPath(bin)
    const gitProbe = spawnSync(
      bashExe,
      ['-c', 'export PATH="$FIXTURE_BIN:$PATH"; command -v git'],
      { encoding: 'utf8', env },
    )
    assert.equal(gitProbe.stdout.trim(), `${toMsysPath(bin)}/git`, gitProbe.stderr)
    const result = spawnSync(
      bashExe,
      ['-c', 'export PATH="$FIXTURE_BIN:$PATH"; exec "$1"', 'bash', toMsysPath(script)],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: {
          ...env,
          BASE_REF: baseRef,
          FIXTURE_FETCH_OUTCOMES: outcomes.join(','),
          FIXTURE_FETCH_STATE: state,
          FIXTURE_GIT_LOG: log,
          REAL_GIT: toMsysPath(gitExe),
          RUNNER_TEMP: toMsysPath(root),
        },
      },
    )
    const attempts = Number(readFileSync(state, 'utf8'))
    const calls = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').filter(Boolean))
    const shallow = git(checkout, 'rev-parse', '--is-shallow-repository').trim()
    const residualErrorFiles = readdirSync(root).filter((name) =>
      name.startsWith('gundo-lint-fetch.'),
    )
    return { ...result, attempts, calls, shallow, residualErrorFiles }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function assertExactFetch(call) {
  assert.ok(call.includes('--no-tags'))
  assert.ok(call.includes('+refs/heads/main:refs/remotes/origin/main'))
  assert.equal(call.includes('--all'), false)
  assert.equal(call.includes('--tags'), false)
}

test('reintenta un fallo transitorio de red y conserva el refspec acotado', () => {
  const result = runFetch(['transient', 'success'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.attempts, 2)
  result.calls.forEach(assertExactFetch)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-marker/)
  assert.deepEqual(result.residualErrorFiles, [])
})

test('recalcula --unshallow después de cada intento', () => {
  const result = runFetch(['transient-after-unshallow', 'success'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.attempts, 2)
  assert.ok(result.calls[0].includes('--unshallow'))
  assert.equal(result.calls[1].includes('--unshallow'), false)
  assert.equal(result.shallow, 'false')
})

for (const kind of [
  'auth',
  'ref',
  'certificate',
  'auth-mixed',
  'ref-mixed',
  'certificate-mixed',
]) {
  test(`no reintenta un fallo permanente de ${kind}`, () => {
    const result = runFetch([kind, 'success'])
    assert.notEqual(result.status, 0)
    assert.equal(result.attempts, 1)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-marker/)
    assert.deepEqual(result.residualErrorFiles, [])
  })
}

test('agota exactamente tres intentos ante fallos transitorios', () => {
  const result = runFetch(['transient'])
  assert.notEqual(result.status, 0)
  assert.equal(result.attempts, 3)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-marker/)
})

test('rechaza un fetch con exit 0 que no crea la referencia remota', () => {
  const result = runFetch(['success-without-ref'])
  assert.notEqual(result.status, 0)
  assert.equal(result.attempts, 1)
})

test('rechaza una rama base sin ancestro común con HEAD', () => {
  const result = runFetch(['success'], { unrelated: true })
  assert.notEqual(result.status, 0)
  assert.equal(result.attempts, 1)
})

test('rechaza una referencia base inválida antes de invocar fetch', () => {
  const result = runFetch(['success'], { baseRef: 'main..invalid' })
  assert.notEqual(result.status, 0)
  assert.equal(result.attempts, 0)
})

test('crea el diagnóstico temporal con permisos restrictivos y cleanup', () => {
  const source = extractRunStep('Traer la rama base')
  assert.match(source, /\bumask 077\b/)
  assert.match(source, /trap 'rm -f "\$FETCH_ERROR"' EXIT/)
  assert.match(source, /\bLC_ALL=C git fetch\b/)
  assert.match(extractStep('Traer la rama base'), /^\s{8}timeout-minutes: 5$/m)
})
