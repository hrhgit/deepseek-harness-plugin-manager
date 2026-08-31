// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplaceTab, type PluginMarketplaceTabProps } from '../src/client/PluginMarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { MarketplaceEntry, MarketplaceSnapshot } from '../src/types.js'

const queryKey = 'dsh-plugin-marketplace.marketplace.global.query.v1'
const statusKey = 'dsh-plugin-marketplace.marketplace.global.status_filter.v3'
const t = (value: LocaleKey): string => en[value]

const available: MarketplaceEntry = {
  id: 'hrhgit/deepseek-harness-plugin-manager:packages/manager', repositoryFullName: 'hrhgit/deepseek-harness-plugin-manager',
  repositoryUrl: 'https://github.com/hrhgit/deepseek-harness-plugin-manager', packageName: 'dsh-plugin-manager', version: '0.1.0',
  displayName: { 'zh-CN': '插件管理器', en: 'Plugin Manager' }, summary: { 'zh-CN': '管理插件。', en: 'Manage installed plugins.' },
  keywords: ['manager'], license: 'MIT', repositoryDirectory: 'packages/manager', homepage: null,
  manifestUrl: 'https://example.test/manager/package.json', availability: 'installable', compatibility: 'declared', issueCode: null, issue: null,
  installedVersion: null,
}
const unavailable: MarketplaceEntry = {
  ...available,
  id: 'example/unavailable:.', repositoryFullName: 'example/unavailable', repositoryUrl: 'https://github.com/example/unavailable',
  packageName: 'dsh-unavailable', version: '1.0.0', displayName: { 'zh-CN': '不可安装插件', en: 'Unavailable Plugin' },
  summary: { 'zh-CN': 'npm 尚未发布。', en: 'npm package is not published.' }, repositoryDirectory: null,
  manifestUrl: 'https://example.test/unavailable/package.json', availability: 'unavailable', compatibility: 'unverified', issueCode: 'package-unpublished',
  issue: 'dsh-unavailable@1.0.0 is not published on npm',
}
const snapshot: MarketplaceSnapshot = {
  profileName: 'web', stale: false, warnings: [], generatedAt: '2026-08-14T00:00:00.000Z', fetchedAt: '2026-08-14T00:01:00.000Z',
  entries: [available, unavailable],
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
  it('loads one generated list and exposes installation state plus repository details', async () => {
    render(<PluginMarketplaceTab {...props()} />)
    await waitFor(() => expect(screen.getAllByText('Plugin Manager')).toHaveLength(2))
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Plugin Manager'), expect.stringContaining('Unavailable Plugin'),
    ]))
    expect(screen.getAllByRole('listitem').map(item => item.textContent?.match(/Plugin Manager|Unavailable Plugin/)?.[0])).toEqual([
      'Plugin Manager', 'Unavailable Plugin',
    ])
    expect(screen.getAllByText(en.installableStatus).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: en.repository })).toHaveProperty('href', available.repositoryUrl)
  })

  it('persists the normal query and filters the downloaded catalog without another remote search', async () => {
    const list = vi.fn(async () => snapshot)
    render(<PluginMarketplaceTab {...props({ list })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unavailable' } })
    expect(JSON.parse(window.localStorage.getItem(queryKey) ?? 'null')).toBe('unavailable')
    expect((await screen.findAllByText('Unavailable Plugin')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Plugin Manager')).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('keeps unavailable entries visible with their installation reason and a versioned persisted filter', async () => {
    const install = vi.fn(props().install)
    render(<PluginMarketplaceTab {...props({ install })} />)
    await screen.findAllByText('Plugin Manager')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.filterUnavailable) }))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(statusKey) ?? 'null')).toBe('unavailable'))
    const [name] = await screen.findAllByText('Unavailable Plugin')
    if (name === undefined) throw new Error('unavailable entry did not render')
    fireEvent.click(name.closest('button') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: en.notInstallable })).toHaveProperty('disabled', true)
    expect(screen.getByText(/npm version is not published/)).toBeTruthy()
    expect(screen.getByText('dsh-unavailable@1.0.0 is not published on npm')).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
  })

  it('allows an installable entry without evaluating a manager-owned plugin specification', async () => {
    const install = vi.fn(async () => ({
      status: 'installed' as const, profileName: 'web', packageName: 'dsh-plugin-manager', version: '0.1.0',
      restartRequired: true, message: 'installed',
    }))
    render(<PluginMarketplaceTab {...props({ list: async () => ({ ...snapshot, entries: [available] }), install })} />)
    await screen.findAllByText('Plugin Manager')
    expect(screen.getByRole('button', { name: en.install })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))
    await waitFor(() => expect(install).toHaveBeenCalledWith('dsh-plugin-manager', '0.1.0'))
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

  it('presents the GitHub search limit as scan coverage rather than an installation failure', async () => {
    const covered = {
      ...snapshot,
      warnings: [{
        code: 'github-results-truncated',
        message: 'GitHub reports 1846 topic repositories; this catalog scan inspected the newest 1000.',
      }],
    }
    render(<PluginMarketplaceTab {...props({ list: async () => covered })} />)
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain(en.scanCoverageTitle)
    expect(notice.textContent).toContain('1846')
    expect(screen.getByRole('button', { name: en.install })).toHaveProperty('disabled', false)
  })
})
