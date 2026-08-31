import { describe, expect, it } from 'vitest'
import { canonicalGithubRepository, catalogDocumentSchema, isSafePackagePath, packageManifestSchema } from '../src/manifest.js'

describe('marketplace catalog metadata', () => {
  it('uses ordinary package metadata without requiring a marketplace-owned plugin manifest', () => {
    const manifest = {
      name: 'dsh-example', version: '1.2.3', description: 'Example plugin.',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }
    expect(packageManifestSchema.parse(manifest).name).toBe('dsh-example')
    expect(packageManifestSchema.parse({ name: 'dsh-minimal', version: '1.0.0' }).name).toBe('dsh-minimal')
  })

  it('keeps repository child paths inside the checkout', () => {
    for (const path of ['../plugin', '/plugin', 'C:/plugin', 'packages\\plugin', 'packages/a/../b']) {
      expect(isSafePackagePath(path)).toBe(false)
    }
    expect(isSafePackagePath('./cordis.patch.yml')).toBe(true)
  })

  it('normalizes supported GitHub repository spellings', () => {
    expect(canonicalGithubRepository('git+https://github.com/Owner/Repo.git')).toBe('https://github.com/owner/repo')
    expect(canonicalGithubRepository('git@github.com:Owner/Repo.git')).toBe('https://github.com/owner/repo')
    expect(canonicalGithubRepository('https://example.com/repo')).toBeNull()
  })

  it('keeps one catalog shape while enforcing installable and unavailable states', () => {
    const base = {
      id: 'example/plugin:.', repositoryFullName: 'example/plugin', repositoryUrl: 'https://github.com/example/plugin',
      packageName: 'dsh-example', version: '1.0.0', displayName: { 'zh-CN': '示例', en: 'Example' },
      summary: { 'zh-CN': '示例插件。', en: 'Example plugin.' }, keywords: [], license: 'MIT',
      repositoryDirectory: null, homepage: null, manifestUrl: 'https://example.test/package.json',
    }
    expect(catalogDocumentSchema.parse({
      schemaVersion: 2, generatedAt: '2026-08-14T00:00:00.000Z', warnings: [], entries: [
        { ...base, availability: 'installable', compatibility: 'declared', issueCode: null, issue: null },
      ],
    }).entries[0]?.availability).toBe('installable')
    expect(() => catalogDocumentSchema.parse({
      schemaVersion: 2, generatedAt: '2026-08-14T00:00:00.000Z', warnings: [], entries: [
        { ...base, availability: 'unavailable', compatibility: 'unverified', issueCode: null, issue: null },
      ],
    })).toThrow(/unavailable entries/)
  })

  it('allows separately installable exact versions of the same npm package', () => {
    const base = {
      repositoryFullName: 'example/plugin', repositoryUrl: 'https://github.com/example/plugin', packageName: 'dsh-example',
      displayName: { 'zh-CN': '示例', en: 'Example' }, summary: { 'zh-CN': '示例插件。', en: 'Example plugin.' }, keywords: [], license: 'MIT',
      repositoryDirectory: null, homepage: null, manifestUrl: 'https://example.test/package.json',
      availability: 'installable' as const, compatibility: 'declared' as const, issueCode: null, issue: null,
    }
    expect(catalogDocumentSchema.parse({
      schemaVersion: 2, generatedAt: '2026-08-14T00:00:00.000Z', warnings: [], entries: [
        { ...base, id: 'example/plugin:one', version: '1.0.0' },
        { ...base, id: 'example/plugin:two', version: '1.1.0' },
      ],
    }).entries).toHaveLength(2)
  })
})
