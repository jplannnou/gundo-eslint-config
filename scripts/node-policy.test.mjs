import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { checkRepo, satisfies } from './node-policy.mjs'

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'node-policy-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  return dir
}

function check(files) {
  const dir = repo(files)
  try { return checkRepo(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

const OK = {
  '.nvmrc': '26.13.0\n',
  'package.json': { engines: { node: '>=26 <27' }, devDependencies: { '@types/node': '^26.6.6' } },
  Dockerfile: 'FROM node:26.13.0-bookworm-slim AS build\nRUN npm i -g pnpm@10.30.1\nFROM node:26.13.0-bookworm-slim\n',
  '.github/workflows/ci.yml': 'jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version-file: .nvmrc\n',
}

test('un repo alineado pasa', () => {
  assert.deepEqual(check(OK), [])
})

test('sin .nvmrc falla', () => {
  const { '.nvmrc': _, ...rest } = OK
  assert.match(check(rest)[0], /\.nvmrc: no existe/)
})

test('Dockerfile en otro major que .nvmrc falla', () => {
  const errs = check({ ...OK, '.nvmrc': '24.22.1', 'package.json': {}, Dockerfile: 'FROM node:22-bookworm-slim AS builder\n' })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /Dockerfile:1: FROM node:22-bookworm-slim es Node 22, pero \.nvmrc dice 24\.22\.1/)
})

test('node:lts sin major fijo falla', () => {
  assert.match(check({ ...OK, Dockerfile: 'FROM node:lts-slim\n' })[0], /no fija el major/)
})

test('corepack en Dockerfile y en workflow falla, en comentario no', () => {
  const errs = check({
    ...OK,
    Dockerfile: 'FROM node:26-slim\n# antes: corepack enable\nRUN corepack enable && corepack prepare pnpm@10.30.1 --activate\n',
    '.github/workflows/x.yml': 'steps:\n  - run: corepack enable\n',
  })
  assert.equal(errs.length, 2)
  assert.ok(errs.every((e) => /corepack/.test(e)))
})

test('node-version escrito a mano falla; expresiones y node-version-file no', () => {
  const errs = check({
    ...OK,
    '.github/workflows/a.yml': "      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n",
    '.github/workflows/b.yml': '          node-version: ${{ matrix.node }}\n',
    '.github/workflows/c.yml': "          node-version: '24' # node-policy: allow (Renovate exige 24)\n",
  })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /a\.yml:3: node-version 22 escrito a mano/)
})

test('matriz sin el major de .nvmrc falla; con él pasa', () => {
  assert.match(check({ ...OK, '.github/workflows/m.yml': "        node-version: ['22.23.4', '24.22.1']\n" })[0], /no incluye Node 26/)
  assert.deepEqual(check({ ...OK, '.github/workflows/m.yml': "        node-version: ['22.23.4', '26.13.0']\n" }), [])
})

test('engines que no admite .nvmrc falla', () => {
  assert.match(check({ ...OK, 'package.json': { engines: { node: '^22.23.4 || ^24.22.1' } } })[0], /no admite 26\.13\.0/)
})

test('@types/node por encima del runtime falla (tipar APIs que prod no tiene)', () => {
  const errs = check({ ...OK, '.nvmrc': '22.23.4', Dockerfile: 'FROM node:22-slim\n', 'package.json': { devDependencies: { '@types/node': '^25.0.3' } } })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /@types\/node \^25\.0\.3 tipa Node 25, pero el runtime es 22/)
})

test('apphosting.yaml sin engines.node falla', () => {
  const errs = check({ '.nvmrc': '24.22.2', 'package.json': {}, 'apphosting.yaml': 'runConfig:\n  cpu: 2\n' })
  assert.match(errs[0], /apphosting\.yaml pero no engines\.node/)
})

test('node_modules no se inspecciona', () => {
  assert.deepEqual(check({ ...OK, 'node_modules/x/Dockerfile': 'FROM node:18\n' }), [])
})

test('satisfies cubre los rangos reales del fleet', () => {
  for (const [v, r, want] of [
    ['26.13.0', '>=22', true],
    ['26.13.0', '>=22.12.0', true],
    ['26.13.0', '^22.23.4 || ^24.22.1 || ^26.12.1', true],
    ['26.13.0', '^22.23.4 || ^24.22.1', false],
    ['26.13.0', '>=26 <27', true],
    ['27.0.0', '>=26 <27', false],
    ['26.999.999', '22.x', false],
    ['22.23.4', '22.x', true],
    ['26.13.0', '>= 18.18.0', true],
    ['26.13.0', '~26.13.0', true],
    ['26.14.0', '~26.13.0', false],
  ]) assert.equal(satisfies(v, r), want, `${v} vs ${r}`)
})
