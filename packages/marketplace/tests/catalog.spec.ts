import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogService } from '../src/host/catalog.js'

const sha = '0123456789abcdef0123456789abcdef01234567'
const repositoryUrl = 'https://github.com/hrhgit/deepseek-harness-plugin-manager'
const plugin = {
  packageName: 'dsh-plugin-manager', version: '0.1.0',
  displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' },
  summary: { 'zh-CN': '管理插件。', en: 'Manage plugins.' }, category: 'plugin-management', keywords: ['dsh-plugin'], license: 'MIT',
  repositoryUrl, repositoryDirectory: 'packages/manager', homepage: repositoryUrl,
  manifestUrl: `${repositoryUrl}/blob/main/packages/manager/package.json`,
}
const packageManifest = {
  name: plugin.packageName, version: plugin.version, license: 'MIT', keywords: ['dsh-plugin'], homepage: repositoryUrl,
  repository: { type: 'git', url: `${repositoryUrl}.git`, directory: 'packages/manager' },
  dsh: {
    plugin: { schemaVersion: 1, displayName: plugin.displayName, summary: plugin.summary, category: plugin.category },
    bundle: { patch: './cordis.patch.yml' },
  },
}
const marketplaceManifest = {
  ...packageManifest,
  name: 'dsh-plugin-marketplace',
  repository: { ...packageManifest.repository, directory: 'packages/marketplace' },
  dsh: {
    ...packageManifest.dsh,
    plugin: {
      ...packageManifest.dsh.plugin,
      displayName: { 'zh-CN': '插件市场', en: 'Plugin Marketplace' },
      summary: { 'zh-CN': '发现和安装插件。', en: 'Discover and install plugins.' },
    },
  },
}

describe('marketplace catalog sources', () => {
  let server: Server
  let origin: string
  let directory: string
  let catalogRequests = 0

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dsh-marketplace-catalog-'))
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://fixture')
      response.setHeader('content-type', 'application/json')
      if (url.pathname === '/catalog') {
        catalogRequests += 1
        if (request.headers['if-none-match'] === 'fixture-etag') { response.statusCode = 304; response.end(); return }
        response.setHeader('etag', 'fixture-etag')
        response.end(JSON.stringify({ schemaVersion: 1, plugins: [plugin] })); return
      }
      if (url.pathname === '/github/search/repositories') {
        if (url.searchParams.get('page') === '1') {
          response.setHeader('link', `<${origin}/github/search/repositories?page=2>; rel="next"`)
          response.end(JSON.stringify({ items: [
            { full_name: 'example/archived-plugin', default_branch: 'main', archived: true, fork: false },
            { full_name: 'example/forked-plugin', default_branch: 'main', archived: false, fork: true },
          ] })); return
        }
        response.end(JSON.stringify({ items: [
          { full_name: 'hrhgit/deepseek-harness-plugin-manager', default_branch: 'main', description: 'Plugin manager workspace', archived: false, fork: false },
          { full_name: 'example/legacy-manager', default_branch: 'main', description: 'Legacy DSH manager', archived: false, fork: false },
        ] })); return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/commits/main') {
        response.end(JSON.stringify({ sha })); return
      }
      if (url.pathname === '/github/repos/example/legacy-manager/commits/main') {
        response.end(JSON.stringify({ sha })); return
      }
      if (url.pathname === `/raw/hrhgit/deepseek-harness-plugin-manager/${sha}/package.json`) {
        response.end(JSON.stringify({ private: true, dsh: { catalog: { schemaVersion: 1, packages: ['packages/manager', 'packages/marketplace'] } } })); return
      }
      if (url.pathname === `/raw/hrhgit/deepseek-harness-plugin-manager/${sha}/packages/manager/package.json`) {
        response.end(JSON.stringify(packageManifest)); return
      }
      if (url.pathname === `/raw/hrhgit/deepseek-harness-plugin-manager/${sha}/packages/marketplace/package.json`) {
        response.end(JSON.stringify(marketplaceManifest)); return
      }
      if (url.pathname === `/raw/example/legacy-manager/${sha}/package.json`) {
        response.end(JSON.stringify({
          name: 'dsh-legacy-manager', version: '1.0.0', description: 'Legacy DSH manager', license: 'MIT',
          repository: 'https://github.com/example/legacy-manager', dsh: { bundle: { patch: './cordis.patch.yml' } },
        })); return
      }
      if (url.pathname === '/npm/dsh-plugin-manager') {
        response.end(JSON.stringify({
          'dist-tags': { latest: '0.1.0' },
          versions: { '0.1.0': { repository: { url: `${repositoryUrl}.git` }, dsh: { bundle: { patch: './cordis.patch.yml' } } } },
        })); return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ error: 'not found' }))
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

  function service(catalogUrl = `${origin}/catalog`): CatalogService {
    return new CatalogService({
      catalogUrl, githubApiUrl: `${origin}/github`, rawGithubUrl: `${origin}/raw`, npmRegistryUrl: `${origin}/npm`,
      cacheFile: join(directory, 'catalog.json'), requestTimeoutMs: 2_000,
    })
  }

  it('loads the curated catalog, uses ETag, and persists a normalized cache', async () => {
    const catalog = service()
    const first = await catalog.list(true)
    expect(first.plugins.map(item => item.packageName)).toEqual(['dsh-plugin-manager'])
    expect(first.plugins[0]?.sources).toEqual(['catalog'])
    const second = await catalog.list(true)
    expect(second.plugins).toHaveLength(1)
    expect(catalogRequests).toBe(2)
    expect(JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8')).plugins).toHaveLength(1)
  })

  it('keeps valid monorepo packages when an unpublished sibling is rejected', async () => {
    const catalog = service(`${origin}/missing-catalog`)
    const snapshot = await catalog.searchGithub('manager')
    expect(snapshot.plugins).toHaveLength(1)
    expect(snapshot.plugins[0]?.packageName).toBe('dsh-plugin-manager')
    expect(snapshot.plugins[0]?.sources).toEqual(['github-topic'])
    expect(snapshot.plugins[0]?.manifestUrl).toContain(`/${sha}/packages/manager/package.json`)
    expect(snapshot.warnings.every(item => !item.message.includes('example/'))).toBe(true)
    expect(snapshot.warnings).toEqual([])
    expect(snapshot.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ packageName: 'dsh-plugin-marketplace', issueCode: 'package-unpublished' }),
      expect.objectContaining({ packageName: 'dsh-legacy-manager', issueCode: 'manifest-invalid' }),
    ]))
    expect(snapshot.candidates.find(item => item.packageName === 'dsh-legacy-manager')?.issue).toContain('dsh.plugin')
  })

  it('falls back to the persistent cache when the catalog source fails', async () => {
    await service().list(true)
    const offline = new CatalogService({
      catalogUrl: 'http://127.0.0.1:1/catalog', cacheFile: join(directory, 'catalog.json'), requestTimeoutMs: 100,
      githubApiUrl: `${origin}/github`, rawGithubUrl: `${origin}/raw`, npmRegistryUrl: `${origin}/npm`,
    })
    const snapshot = await offline.list(true)
    expect(snapshot.stale).toBe(true)
    expect(snapshot.plugins[0]?.packageName).toBe('dsh-plugin-manager')
    expect(snapshot.warnings[0]?.code).toBe('catalog-unavailable')
  })

  it('restores cached community candidates even when the curated catalog is available', async () => {
    await service(`${origin}/missing-catalog`).searchGithub('manager')
    const restarted = service()
    const snapshot = await restarted.list(false)
    expect(snapshot.stale).toBe(false)
    expect(snapshot.plugins[0]?.packageName).toBe('dsh-plugin-manager')
    expect(snapshot.candidates.map(item => item.packageName)).toEqual(expect.arrayContaining([
      'dsh-plugin-marketplace', 'dsh-legacy-manager',
    ]))
  })
})
