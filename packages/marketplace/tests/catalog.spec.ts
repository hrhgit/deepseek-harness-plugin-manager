import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogService, snapshotWithProfile } from '../src/host/catalog.js'

const entry = {
  id: 'hrhgit/deepseek-harness-plugin-manager:packages/manager',
  repositoryFullName: 'hrhgit/deepseek-harness-plugin-manager',
  repositoryUrl: 'https://github.com/hrhgit/deepseek-harness-plugin-manager',
  packageName: 'dsh-plugin-manager',
  version: '0.1.0',
  displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' },
  summary: { 'zh-CN': '管理插件。', en: 'Manage plugins.' },
  keywords: ['dsh-plugin'],
  license: 'MIT',
  repositoryDirectory: 'packages/manager',
  homepage: null,
  manifestUrl: 'https://example.test/package.json',
  availability: 'installable' as const,
  compatibility: 'declared' as const,
  issueCode: null,
  issue: null,
}
const document = { schemaVersion: 2 as const, generatedAt: '2026-08-14T00:00:00.000Z', entries: [entry], warnings: [] }

describe('generated marketplace catalog', () => {
  let server: Server
  let origin: string
  let directory: string
  let requests = 0

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dsh-marketplace-catalog-'))
    server = createServer((request, response) => {
      requests += 1
      response.setHeader('content-type', 'application/json')
      if (request.headers['if-none-match'] === 'fixture-etag') {
        response.statusCode = 304
        response.end()
        return
      }
      response.setHeader('etag', 'fixture-etag')
      response.end(JSON.stringify(document))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture server did not bind')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  })

  it('loads one generated document, uses ETag, and persists a last-known-good cache', async () => {
    const cacheFile = join(directory, 'catalog.json')
    const catalog = new CatalogService({ catalogUrl: origin, cacheFile, requestTimeoutMs: 2_000 })
    const first = await catalog.list(true)
    expect(first.entries.map(item => item.packageName)).toEqual(['dsh-plugin-manager'])
    expect(first.generatedAt).toBe(document.generatedAt)
    const second = await catalog.list(true)
    expect(second.entries).toHaveLength(1)
    expect(requests).toBe(2)
    expect(JSON.parse(await readFile(cacheFile, 'utf8')).document.entries).toHaveLength(1)
  })

  it('falls back to the cache and keeps installation projection separate from catalog data', async () => {
    const cacheFile = join(directory, 'catalog.json')
    await new CatalogService({ catalogUrl: origin, cacheFile }).list(true)
    const offline = new CatalogService({
      catalogUrl: 'http://127.0.0.1:1/catalog', cacheFile, requestTimeoutMs: 100,
    })
    const state = await offline.list(true)
    expect(state.stale).toBe(true)
    expect(state.warnings.at(-1)?.code).toBe('catalog-unavailable')
    const snapshot = snapshotWithProfile(state, 'web', { 'dsh-plugin-manager': '0.1.0' })
    expect(snapshot.entries[0]?.installedVersion).toBe('0.1.0')
  })

  it('keeps the first run usable when the generated catalog is unavailable', async () => {
    const offline = new CatalogService({
      catalogUrl: 'http://127.0.0.1:1/catalog', cacheFile: join(directory, 'empty.json'), requestTimeoutMs: 100,
    })
    const state = await offline.list(true)
    expect(state.entries).toEqual([])
    expect(state.generatedAt).toBeNull()
    expect(state.stale).toBe(false)
    expect(state.warnings[0]?.code).toBe('catalog-unavailable')
  })
})
