// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplaceTab, type PluginMarketplaceTabProps } from '../src/client/PluginMarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { MarketplaceEntry, MarketplaceSnapshot } from '../src/types.js'

const queryKey = 'dsh-plugin-marketplace.marketplace.global.query.v1'
const statusKey = 'dsh-plugin-marketplace.marketplace.global.status_filter.v2'
const t = (value: LocaleKey): string => en[value]

const verified: MarketplaceEntry = {
  id: 'hrhgit/deepseek-harness-plugin-manager:packages/manager', repositoryFullName: 'hrhgit/deepseek-harness-plugin-manager',
  repositoryUrl: 'https://github.com/hrhgit/deepseek-harness-plugin-manager', packageName: 'dsh-plugin-manager', version: '0.1.0',
  displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' }, summary: { 'zh-CN': '管理插件。', en: 'Manage installed plugins.' },
  category: 'plugin-management', keywords: ['manager'], license: 'MIT', repositoryDirectory: 'packages/manager', homepage: null,
  manifestUrl: 'https://example.test/manager/package.json', verification: 'verified', issueCode: null, issue: null, installable: true,
  installedVersion: null,
}
const unverified: MarketplaceEntry = {
  ...verified,
  id: 'example/unverified:.', repositoryFullName: 'example/unverified', repositoryUrl: 'https://github.com/example/unverified',
  packageName: 'dsh-unverified', version: '1.0.0', displayName: { 'zh-CN': '未验证插件', en: 'Unverified Plugin' },
  summary: { 'zh-CN': '兼容性未验证。', en: 'Compatibility is unverified.' }, category: null, repositoryDirectory: null,
  manifestUrl: 'https://example.test/unverified/package.json', verification: 'unverified', issueCode: 'manifest-invalid',
  issue: 'dsh.plugin: expected object', installable: true,
}
const rejected: MarketplaceEntry = {
  ...unverified,
  id: 'example/rejected:.', repositoryFullName: 'example/rejected', repositoryUrl: 'https://github.com/example/rejected',
  packageName: 'dsh-rejected', displayName: { 'zh-CN': '已拒绝插件', en: 'Rejected Plugin' },
  summary: { 'zh-CN': 'npm 尚未发布。', en: 'npm package is not published.' }, verification: 'rejected',
  issueCode: 'package-unpublished', issue: 'dsh-rejected@1.0.0 is not published on npm', installable: false,
}
const snapshot: MarketplaceSnapshot = {
  profileName: 'web', stale: false, warnings: [], generatedAt: '2026-08-14T00:00:00.000Z', fetchedAt: '2026-08-14T00:01:00.000Z',
  entries: [verified, unverified, rejected],
}

function props(overrides: Partial<PluginMarketplaceTabProps> = {}): PluginMarketplaceTabProps {
  return {
    t, locale: 'en', list: vi.fn(async () => snapshot),
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
  it('loads one generated list and exposes verification plus repository details', async () => {
    render(<PluginMarketplaceTab {...props()} />)
    await waitFor(() => expect(screen.getAllByText('Plugin Manager')).toHaveLength(2))
    expect(screen.getAllByText(en.verifiedStatus).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: en.repository })).toHaveProperty('href', verified.repositoryUrl)
  })

  it('persists the normal query and filters the downloaded catalog without another remote search', async () => {
    const list = vi.fn(async () => snapshot)
    render(<PluginMarketplaceTab {...props({ list })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unverified' } })
    expect(JSON.parse(window.localStorage.getItem(queryKey) ?? 'null')).toBe('unverified')
    expect((await screen.findAllByText('Unverified Plugin')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Rejected Plugin')).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('keeps rejected entries visible with admission details and a versioned persisted filter', async () => {
    const install = vi.fn(props().install)
    render(<PluginMarketplaceTab {...props({ install })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.filterRejected) }))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(statusKey) ?? 'null')).toBe('rejected'))
    const [name] = await screen.findAllByText('Rejected Plugin')
    if (name === undefined) throw new Error('rejected entry did not render')
    fireEvent.click(name.closest('button') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: en.notInstallable })).toHaveProperty('disabled', true)
    expect(screen.getByText(/npm version is not published/)).toBeTruthy()
    expect(screen.getByText('dsh-rejected@1.0.0 is not published on npm')).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
  })

  it('allows an npm-verified entry whose DSH compatibility is unverified', async () => {
    const install = vi.fn(async () => ({
      status: 'installed' as const, profileName: 'web', packageName: 'dsh-unverified', version: '1.0.0',
      restartRequired: true, message: 'installed',
    }))
    render(<PluginMarketplaceTab {...props({ list: async () => ({ ...snapshot, entries: [unverified] }), install })} />)
    await screen.findAllByText('Unverified Plugin')
    expect(screen.getByRole('button', { name: en.install })).toHaveProperty('disabled', false)
    expect(screen.getByText(en.unverifiedWarning)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))
    await waitFor(() => expect(install).toHaveBeenCalledWith('dsh-unverified', '1.0.0'))
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

  it('keeps the page usable with catalog warnings and failed installs', async () => {
    const warned = { ...snapshot, stale: true, warnings: [{ code: 'catalog-unavailable', message: 'offline' }] }
    const install = vi.fn(async () => { throw new Error('registry refused') })
    render(<PluginMarketplaceTab {...props({ list: async () => warned, install })} />)
    expect((await screen.findByRole('status')).textContent).toContain(en.stale)
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))
    expect((await screen.findByRole('alert')).textContent).toContain('registry refused')
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })
})
