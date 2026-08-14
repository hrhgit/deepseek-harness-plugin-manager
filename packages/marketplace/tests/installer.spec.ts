import { describe, expect, it, vi } from 'vitest'
import { MarketplaceInstaller, type CommandRunner } from '../src/host/installer.js'
import type { MarketplacePlugin } from '../src/types.js'

const plugin: MarketplacePlugin = {
  packageName: 'dsh-plugin-manager', version: '0.1.0', displayName: { 'zh-CN': '管理器', en: 'Manager' },
  summary: { 'zh-CN': '摘要', en: 'Summary' }, category: 'plugin-management', keywords: [], license: 'MIT',
  repositoryUrl: 'https://github.com/hrhgit/deepseek-harness-plugin-manager', repositoryDirectory: 'packages/manager',
  homepage: null, manifestUrl: 'https://example.test/package.json', sources: ['catalog'], installedVersion: null,
}
const location = { directory: 'C:\\fixture\\profiles\\web', profileName: 'web' }

describe('marketplace installer', () => {
  it('passes only an exact validated npm target to the official dsh boundary', async () => {
    const runner = vi.fn<CommandRunner>(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    const receipt = await new MarketplaceInstaller(runner).install(plugin, location, {})
    expect(runner).toHaveBeenCalledWith([
      'plugin', '--profile', 'web', 'add', 'dsh-plugin-manager@0.1.0', '--save-exact',
    ], location.directory)
    expect(receipt.restartRequired).toBe(true)
  })

  it('does not invoke dsh for an installed package', async () => {
    const runner = vi.fn<CommandRunner>()
    const receipt = await new MarketplaceInstaller(runner).install(plugin, location, { 'dsh-plugin-manager': '0.1.0' })
    expect(receipt.status).toBe('already-installed')
    expect(runner).not.toHaveBeenCalled()
  })

  it('serializes concurrent installs', async () => {
    const first = Promise.withResolvers<{ exitCode: number; stdout: string; stderr: string }>()
    const runner = vi.fn<CommandRunner>()
      .mockImplementationOnce(async () => await first.promise)
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    const installer = new MarketplaceInstaller(runner)
    const one = installer.install(plugin, location, {})
    const two = installer.install({ ...plugin, packageName: 'dsh-plugin-other' }, location, {})
    await Promise.resolve()
    expect(runner).toHaveBeenCalledTimes(1)
    first.resolve({ exitCode: 0, stdout: '', stderr: '' })
    await Promise.all([one, two])
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('reports bounded command diagnostics on failure', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: '', stderr: 'registry refused' })
    await expect(new MarketplaceInstaller(runner).install(plugin, location, {})).rejects.toThrow(/registry refused/)
  })
})
