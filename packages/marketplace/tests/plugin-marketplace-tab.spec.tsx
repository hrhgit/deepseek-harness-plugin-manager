// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplaceTab, type PluginMarketplaceTabProps } from '../src/client/PluginMarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { MarketplaceSnapshot } from '../src/types.js'

const key = 'dsh-plugin-marketplace.marketplace.global.query.v1'
const statusKey = 'dsh-plugin-marketplace.marketplace.global.status_filter.v1'
const t = (value: LocaleKey): string => en[value]
const snapshot: MarketplaceSnapshot = {
  profileName: 'web', stale: false, warnings: [], fetchedAt: '2026-08-14T00:00:00.000Z',
  plugins: [{
    packageName: 'dsh-plugin-manager', version: '0.1.0', displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' },
    summary: { 'zh-CN': '管理插件。', en: 'Manage installed plugins.' }, category: 'plugin-management', keywords: ['manager'], license: 'MIT',
    repositoryUrl: 'https://github.com/hrhgit/deepseek-harness-plugin-manager', repositoryDirectory: 'packages/manager', homepage: null,
    manifestUrl: 'https://raw.githubusercontent.com/hrhgit/deepseek-harness-plugin-manager/main/packages/manager/package.json',
    sources: ['catalog', 'github-topic'], installedVersion: null,
  }],
  candidates: [{
    id: 'example/legacy-manager:.', repositoryFullName: 'example/legacy-manager', repositoryUrl: 'https://github.com/example/legacy-manager',
    packageName: 'dsh-legacy-manager', version: '1.0.0', displayName: { 'zh-CN': '旧版管理器', en: 'Legacy Manager' },
    summary: { 'zh-CN': '尚未适配 V1。', en: 'Not yet adapted to V1.' }, manifestUrl: 'https://example.test/package.json',
    issueCode: 'manifest-invalid', issue: 'dsh.plugin: expected object', source: 'github-topic',
  }],
}

function props(overrides: Partial<PluginMarketplaceTabProps> = {}): PluginMarketplaceTabProps {
  return {
    t, locale: 'en', list: vi.fn(async () => snapshot), searchGithub: vi.fn(async () => snapshot),
    install: vi.fn(async () => ({
      status: 'installed', profileName: 'web', packageName: 'dsh-plugin-manager', version: '0.1.0',
      restartRequired: true, message: 'installed',
    })),
    ...overrides,
  }
}

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('PluginMarketplaceTab', () => {
  it('loads a compact list and exposes source provenance in details', async () => {
    render(<PluginMarketplaceTab {...props()} />)
    await waitFor(() => expect(screen.getAllByText('Plugin Manager')).toHaveLength(2))
    expect(screen.getByText(en.catalogSource)).toBeTruthy()
    expect(screen.getByText(en.githubSource)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.repository })).toHaveProperty('href', snapshot.plugins[0]?.repositoryUrl)
  })

  it('persists the normal search query and searches GitHub only on submit', async () => {
    const searchGithub = vi.fn(async () => snapshot)
    render(<PluginMarketplaceTab {...props({ searchGithub })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'manager' } })
    expect(JSON.parse(window.localStorage.getItem(key) ?? 'null')).toBe('manager')
    expect(searchGithub).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.searchGithub }))
    await waitFor(() => expect(searchGithub).toHaveBeenCalledWith('manager'))
  })

  it('keeps rejected topic hits visible with admission details and a persisted status filter', async () => {
    const install = vi.fn(props().install)
    render(<PluginMarketplaceTab {...props({ install })} />)
    const candidateName = await screen.findByText('Legacy Manager')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.filterCandidates) }))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(statusKey) ?? 'null')).toBe('candidate'))
    fireEvent.click(candidateName.closest('button') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: en.notInstallable })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Manifest does not conform to V1/)).toBeTruthy()
    expect(screen.getByText('dsh.plugin: expected object')).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
  })

  it('requires confirmation before installing and shows restart feedback', async () => {
    const install = vi.fn(async () => ({
      status: 'installed' as const, profileName: 'web', packageName: 'dsh-plugin-manager', version: '0.1.0',
      restartRequired: true, message: 'installed',
    }))
    render(<PluginMarketplaceTab {...props({ install })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))
    await waitFor(() => expect(install).toHaveBeenCalledWith('dsh-plugin-manager', '0.1.0'))
    expect((await screen.findByRole('status')).textContent).toContain(en.restartRequired)
  })

  it('keeps the page usable with source warnings and failed installs', async () => {
    const warned = { ...snapshot, stale: true, warnings: [{ source: 'github-topic' as const, code: 'rate-limit', message: 'rate limited' }] }
    const install = vi.fn(async () => { throw new Error('registry refused') })
    render(<PluginMarketplaceTab {...props({ list: async () => warned, install })} />)
    expect((await screen.findByRole('status')).textContent).toContain(en.stale)
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))
    expect((await screen.findByRole('alert')).textContent).toContain('registry refused')
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })
})
