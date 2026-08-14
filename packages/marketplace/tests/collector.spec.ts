import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogCollector } from '../src/host/collector.js'

const sha = '0123456789abcdef0123456789abcdef01234567'
const repositoryUrl = 'https://github.com/hrhgit/deepseek-harness-plugin-manager'
const pluginManifest = {
  name: 'dsh-plugin-manager', version: '0.1.0', description: 'Manage plugins.', license: 'MIT', keywords: ['dsh-plugin'],
  repository: { type: 'git', url: `${repositoryUrl}.git`, directory: 'packages/manager' },
  dsh: {
    plugin: {
      schemaVersion: 1,
      displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' },
      summary: { 'zh-CN': '管理插件。', en: 'Manage plugins.' },
      category: 'plugin-management',
    },
    bundle: { patch: './cordis.patch.yml' },
  },
}

describe('catalog collector', () => {
  let server: Server
  let origin: string

  beforeEach(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://fixture')
      response.setHeader('content-type', 'application/json')
      if (url.pathname === '/github/search/repositories') {
        response.end(JSON.stringify({
          total_count: 2,
          items: [
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
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/package.json') {
        response.end(JSON.stringify({ private: true, dsh: { catalog: { schemaVersion: 1, packages: ['packages/manager', 'packages/marketplace'] } } }))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/packages/manager/package.json') {
        response.end(JSON.stringify(pluginManifest))
        return
      }
      if (url.pathname === '/github/repos/hrhgit/deepseek-harness-plugin-manager/contents/packages/marketplace/package.json') {
        response.end(JSON.stringify({ ...pluginManifest, name: 'dsh-plugin-marketplace', repository: { ...pluginManifest.repository, directory: 'packages/marketplace' } }))
        return
      }
      if (url.pathname === '/github/repos/example/legacy-manager/contents/package.json') {
        response.end(JSON.stringify({
          name: 'dsh-legacy-manager', version: '1.0.0', description: 'Legacy plugin', license: 'MIT',
          repository: 'https://github.com/example/legacy-manager', dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
        return
      }
      if (url.pathname === '/npm/dsh-plugin-manager') {
        response.end(JSON.stringify({ versions: { '0.1.0': { repository: `${repositoryUrl}.git`, dsh: { bundle: { patch: './cordis.patch.yml' } } } } }))
        return
      }
      if (url.pathname === '/npm/dsh-legacy-manager') {
        response.end(JSON.stringify({ versions: { '1.0.0': { repository: 'https://github.com/example/legacy-manager.git' } } }))
        return
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
  })

  function collector(limit = 10): CatalogCollector {
    return new CatalogCollector({
      githubApiUrl: `${origin}/github`, rawGithubUrl: `${origin}/raw`, npmRegistryUrl: `${origin}/npm`,
      requestTimeoutMs: 2_000, githubRepositoryBatchSize: 1, githubRepositoryLimit: limit,
    })
  }

  it('classifies V1, npm-admitted, and rejected packages in one generated catalog', async () => {
    const catalog = await collector().collect()
    expect(catalog.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ packageName: 'dsh-plugin-manager', verification: 'verified', installable: true }),
      expect.objectContaining({ packageName: 'dsh-legacy-manager', verification: 'unverified', installable: true, issueCode: 'manifest-invalid' }),
      expect.objectContaining({ packageName: 'dsh-plugin-marketplace', verification: 'rejected', installable: false, issueCode: 'package-unpublished' }),
    ]))
  })

  it('records a deterministic warning when the configured scan limit truncates GitHub results', async () => {
    const catalog = await collector(1).collect()
    expect(catalog.entries.every(entry => entry.repositoryFullName === 'hrhgit/deepseek-harness-plugin-manager')).toBe(true)
    expect(catalog.warnings).toEqual([
      expect.objectContaining({ code: 'github-results-truncated' }),
    ])
  })
})
