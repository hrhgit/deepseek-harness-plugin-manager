// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplaceTab, type PluginMarketplaceTabProps } from '../src/client/PluginMarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { MarketplaceSnapshot } from '../src/types.js'

const key = 'dsh-plugin-marketplace.marketplace.global.query.v1'
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
    expect(await screen.findAllByText('Plugin Manager')).toHaveLength(2)
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
