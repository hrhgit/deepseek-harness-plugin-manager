// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginManagerTab, type PluginManagerTabProps } from '../src/client/PluginManagerTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { MutationReceipt, PluginManagerSnapshot } from '../src/types.js'

afterEach(cleanup)
const t = (key: LocaleKey): string => en[key]

const snapshot: PluginManagerSnapshot = {
  profileName: 'web',
  entries: [
    { entryId: 'tool-client', configId: 'tool-client', moduleName: '@fixture/tool/client', packageName: '@fixture/tool', category: 'community', enabled: true, phase: 'active', protected: false, protectionReason: null, error: null },
    { entryId: 'tool-host', configId: 'tool-host', moduleName: '@fixture/tool/host', packageName: '@fixture/tool', category: 'community', enabled: false, phase: null, protected: false, protectionReason: null, error: null },
    { entryId: 'manager', configId: 'manager', moduleName: 'dsh-plugin-manager', packageName: 'dsh-plugin-manager', category: 'community', enabled: true, phase: 'active', protected: true, protectionReason: 'self', error: null },
    { entryId: 'session', configId: 'session', moduleName: '@deepseek-ai/dsh-session-persistence', packageName: '@deepseek-ai/dsh-session-persistence', category: 'session', enabled: true, phase: 'active', protected: false, protectionReason: null, error: null },
  ],
}

function receipt(next: PluginManagerSnapshot, enabled: boolean, entryId = 'tool-host'): MutationReceipt {
  return { enabled, items: [{ entryId, status: 'changed', message: null }], snapshot: next }
}

function props(overrides: Partial<PluginManagerTabProps> = {}): PluginManagerTabProps {
  return {
    t,
    list: vi.fn(async () => snapshot),
    setEnabled: vi.fn(async (_entryId, enabled) => receipt(snapshot, enabled)),
    setPackageEnabled: vi.fn(async (_packageName, enabled) => receipt(snapshot, enabled)),
    ...overrides,
  }
}

describe('PluginManagerTab', () => {
  it('groups, searches, expands, and protects entries', async () => {
    render(<PluginManagerTab {...props()} />)
    expect(await screen.findByText('@fixture/tool')).toBeTruthy()
    expect(screen.getByText(en.categorySession)).toBeTruthy()
    expect(screen.getByText(en.categoryCommunity)).toBeTruthy()
    expect(screen.getByText('1/2 enabled')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /@fixture\/tool/ }))
    expect(screen.getByText('@fixture/tool/client')).toBeTruthy()
    expect(screen.getByText('@fixture/tool/host')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'manager' } })
    expect(screen.queryByText('@fixture/tool/client')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /dsh-plugin-manager/ }))
    expect(screen.getByText(en.protected)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /dsh-plugin-manager/ })).toHaveProperty('disabled', true)
  })

  it('runs package and entry mutations and adopts their authoritative snapshots', async () => {
    const setPackageEnabled = vi.fn(async () => receipt({ ...snapshot, entries: snapshot.entries.map(entry => entry.packageName === '@fixture/tool' ? { ...entry, enabled: true } : entry) }, true))
    const setEnabled = vi.fn(async () => receipt(snapshot, false, 'tool-client'))
    render(<PluginManagerTab {...props({ setPackageEnabled, setEnabled })} />)
    await screen.findByText('@fixture/tool')

    fireEvent.click(screen.getByRole('checkbox', { name: en.enablePackage }))
    await waitFor(() => { expect(setPackageEnabled).toHaveBeenCalledWith('@fixture/tool', true) })
    fireEvent.click(screen.getByRole('button', { name: /@fixture\/tool/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: '@fixture/tool/client: Disable plugin' }))
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('tool-client', false) })
  })

  it('shows operation failures and retries a failed initial load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(snapshot)
    const setPackageEnabled = vi.fn(async (): Promise<MutationReceipt> => ({
      enabled: true,
      items: [{ entryId: 'tool-host', status: 'failed', message: 'HMR rejected the patch.' }],
      snapshot,
    }))
    render(<PluginManagerTab {...props({ list, setPackageEnabled })} />)
    expect((await screen.findByRole('alert')).textContent).toContain(`${en.error} private`)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByText('@fixture/tool')
    fireEvent.click(screen.getByRole('checkbox', { name: en.enablePackage }))
    expect((await screen.findByRole('alert')).textContent).toContain('HMR rejected the patch.')
  })

  it('shows a restart-required result as a non-error status', async () => {
    const setPackageEnabled = vi.fn(async (): Promise<MutationReceipt> => ({
      enabled: true,
      items: [{ entryId: 'tool-host', status: 'restart-required', message: en.restartRequired }],
      snapshot,
    }))
    render(<PluginManagerTab {...props({ setPackageEnabled })} />)
    await screen.findByText('@fixture/tool')
    fireEvent.click(screen.getByRole('checkbox', { name: en.enablePackage }))
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain(en.restartRequired)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores a late list result after unmount', async () => {
    const deferred = Promise.withResolvers<PluginManagerSnapshot>()
    const view = render(<PluginManagerTab {...props({ list: () => deferred.promise })} />)
    view.unmount()
    await act(async () => { deferred.resolve(snapshot) })
  })
})
