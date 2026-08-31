import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogCollector } from '../src/host/collector.js'

const sha = '0123456789abcdef0123456789abcdef01234567'
const repositoryUrl = 'https://github.com/hrhgit/deepseek-harness-plugin-manager'
const pluginManifest = {
  name: 'dsh-plugin-manager', version: '0.1.0', description: 'Manage plugins.', license: 'MIT', keywords: ['dsh-plugin'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}

describe('catalog collector', () => {
  let server: Server
  let origin: string
  let requestPaths: string[]

  beforeEach(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://fixture')
      requestPaths.push(url.pathname)
      response.setHeader('content-type', 'application/json')
      if (url.pathname === '/github/search/repositories') {
        const incremental = url.searchParams.get('q')?.includes('updated:>=') ?? false
        response.end(JSON.stringify({
          total_count: incremental ? 1 : 2,
          items: incremental ? [
            {
              full_name: 'example/legacy-manager', name: 'legacy-manager', html_url: 'https://github.com/example/legacy-manager',
              default_branch: 'main', description: 'Legacy plugin', topics: ['dsh-plugin'], license: { spdx_id: 'MIT' }, archived: false, fork: false,
            },
          ] : [
            {
              full_name: 'hrhgit/deepseek-harness-plugin-manager', name: 'deepseek-harness-plugin-manager', html_url: repositoryUrl,
              default_branch: 'main', description: 'Plugin workspace', topics: ['dsh-plugin'], license: { spdx_id: 'MIT' }, archived: false, fork: false,
            },
            {
              full_name: 'example/legacy-manager', name: 'legacy-manager', html_url: 'https://github.com/example/legacy-manager',
              default_branch: 'main', description: 'Legacy plugin', topics: ['dsh-plugin'], license: { spdx_id: 'MIT' }, archived: false, fork: false,
            },
          ],
        }))
        return
      }
      if (url.pathname.endsWith('/commits/main')) {
        response.end(JSON.stringify({ sha }))
        return
      }
      if (url.pathname.endsWith(`/git/trees/${sha}`)) {
        response.end(JSON.stringify({
          truncated: false,
          tree: url.pathname.includes('hrhgit/')
            ? [
                { path: 'package.json', type: 'blob' },
                { path: 'packages/manager/package.json', type: 'blob' },
                { path: 'packages/marketplace/package.json', type: 'blob' },
                { path: 'packages/shared/package.json', type: 'blob' },
              ]
            : [{ path: 'package.json', type: 'blob' }],
        }))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/package.json') {
        response.end(JSON.stringify({ private: true, workspaces: ['packages/*'] }))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/packages/manager/package.json') {
        response.end(JSON.stringify(pluginManifest))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/packages/marketplace/package.json') {
        response.end(JSON.stringify({ ...pluginManifest, name: 'dsh-plugin-marketplace' }))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/packages/shared/package.json') {
        response.end(JSON.stringify({ name: '@example/shared', version: '1.0.0' }))
        return
      }
      if (url.pathname === '/github/repos/example/legacy-manager/contents/package.json') {
        response.end(JSON.stringify({
          name: 'dsh-legacy-manager', version: '1.0.0', description: 'Legacy plugin', license: 'MIT',
        }))
        return
      }
      if (url.pathname === '/npm/dsh-plugin-manager') {
        response.end(JSON.stringify({ versions: { '0.1.0': { repository: `${repositoryUrl}.git`, dsh: { bundle: { patch: './cordis.patch.yml' } } } } }))
        return
      }
      if (url.pathname === '/npm/dsh-plugin-marketplace') {
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      if (url.pathname === '/npm/dsh-legacy-manager') {
        response.end(JSON.stringify({ versions: { '1.0.0': { repository: 'https://github.com/example/legacy-manager.git' } } }))
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ error: 'not found' }))
    })
    requestPaths = []
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture server did not bind')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  function collector(limit = 10): CatalogCollector {
    return new CatalogCollector({
      githubApiUrl: `${origin}/github`, rawGithubUrl: `${origin}/raw`, npmRegistryUrl: `${origin}/npm`,
      requestTimeoutMs: 2_000, githubRepositoryBatchSize: 1, githubRepositoryLimit: limit,
    })
  }

  it('discovers package manifests without a manager-owned catalog declaration and reports installability', async () => {
    const catalog = await collector().collect()
    expect(catalog.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ packageName: 'dsh-plugin-manager', availability: 'installable', compatibility: 'declared' }),
      expect.objectContaining({ packageName: 'dsh-plugin-marketplace', availability: 'unavailable', issueCode: 'package-unpublished' }),
      expect.objectContaining({ packageName: 'dsh-legacy-manager', availability: 'installable', compatibility: 'unverified' }),
    ]))
    expect(catalog.entries.find(entry => entry.packageName === '@example/shared')).toBeUndefined()
    expect(requestPaths).toContain(`/github/repos/hrhgit/deepseek-harness-plugin-manager/git/trees/${sha}`)
  })

  it('records a deterministic warning when the configured scan limit truncates GitHub results', async () => {
    const catalog = await collector(1).collect()
    expect(catalog.entries.every(entry => entry.repositoryFullName === 'hrhgit/deepseek-harness-plugin-manager')).toBe(true)
    expect(catalog.warnings).toEqual([
      expect.objectContaining({ code: 'github-results-truncated' }),
    ])
  })

  it('reuses unchanged catalog entries and only revalidates repositories updated after the checkpoint', async () => {
    const previous = await collector().collect()
    requestPaths = []
    const next = await new CatalogCollector({
      githubApiUrl: `${origin}/github`, rawGithubUrl: `${origin}/raw`, npmRegistryUrl: `${origin}/npm`,
      requestTimeoutMs: 2_000, githubRepositoryBatchSize: 1, githubRepositoryLimit: 10,
      previousCatalog: previous, incrementalSince: previous.generatedAt,
    }).collect()
    expect(next.entries.map(entry => entry.repositoryFullName)).toEqual(expect.arrayContaining([
      'hrhgit/deepseek-harness-plugin-manager', 'example/legacy-manager',
    ]))
    expect(requestPaths).not.toContain('/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/package.json')
  })
})
