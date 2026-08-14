import { describe, expect, it } from 'vitest'
import {
  canonicalGithubRepository, dshCatalogRootSchema, isSafePackagePath, packageManifestSchema,
} from '../src/manifest.js'

describe('dsh.plugin V1 manifest', () => {
  it('accepts explicit monorepo package paths and rejects traversal or duplicates', () => {
    expect(dshCatalogRootSchema.parse({ schemaVersion: 1, packages: ['packages/manager', 'packages/marketplace'] }).packages).toHaveLength(2)
    for (const path of ['../plugin', '/plugin', 'C:/plugin', 'packages\\plugin', 'packages/a/../b']) {
      expect(isSafePackagePath(path)).toBe(false)
    }
    expect(isSafePackagePath('./cordis.patch.yml')).toBe(true)
    expect(() => dshCatalogRootSchema.parse({ schemaVersion: 1, packages: ['packages/a', 'packages/a'] })).toThrow(/duplicate/)
  })

  it('requires discovery metadata and the official bundle contract', () => {
    const valid = {
      name: 'dsh-example', version: '1.2.3', license: 'MIT',
      repository: { type: 'git', url: 'git+https://github.com/example/plugins.git', directory: 'packages/example' },
      dsh: {
        plugin: {
          schemaVersion: 1,
          displayName: { 'zh-CN': '示例', en: 'Example' },
          summary: { 'zh-CN': '示例插件。', en: 'Example plugin.' },
          category: 'example',
        },
        bundle: { patch: './cordis.patch.yml' },
      },
    }
    expect(packageManifestSchema.parse(valid).name).toBe('dsh-example')
    expect(() => packageManifestSchema.parse({ ...valid, dsh: { plugin: valid.dsh.plugin } })).toThrow()
  })

  it('normalizes supported GitHub repository spellings', () => {
    expect(canonicalGithubRepository('git+https://github.com/Owner/Repo.git')).toBe('https://github.com/owner/repo')
    expect(canonicalGithubRepository('git@github.com:Owner/Repo.git')).toBe('https://github.com/owner/repo')
    expect(canonicalGithubRepository('https://example.com/repo')).toBeNull()
  })
})
