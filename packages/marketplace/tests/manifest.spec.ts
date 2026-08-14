import { describe, expect, it } from 'vitest'
import {
  canonicalGithubRepository, catalogDocumentSchema, dshCatalogRootSchema, isSafePackagePath, packageManifestSchema,
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

  it('keeps one catalog shape while enforcing verified, unverified, and rejected states', () => {
    const base = {
      id: 'example/plugin:.', repositoryFullName: 'example/plugin', repositoryUrl: 'https://github.com/example/plugin',
      packageName: 'dsh-example', version: '1.0.0', displayName: { 'zh-CN': '示例', en: 'Example' },
      summary: { 'zh-CN': '示例插件。', en: 'Example plugin.' }, category: 'example', keywords: [], license: 'MIT',
      repositoryDirectory: null, homepage: null, manifestUrl: 'https://example.test/package.json',
    }
    expect(catalogDocumentSchema.parse({
      schemaVersion: 1, generatedAt: '2026-08-14T00:00:00.000Z', warnings: [], entries: [
        { ...base, verification: 'verified', issueCode: null, issue: null, installable: true },
      ],
    }).entries[0]?.verification).toBe('verified')
    expect(() => catalogDocumentSchema.parse({
      schemaVersion: 1, generatedAt: '2026-08-14T00:00:00.000Z', warnings: [], entries: [
        { ...base, verification: 'rejected', issueCode: null, issue: null, installable: true },
      ],
    })).toThrow(/rejected entries/)
  })
})
