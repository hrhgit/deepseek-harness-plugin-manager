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
  categories: ['official', 'third-party'],
  entries: [
    { entryId: 'tool-client', configId: 'tool-client', moduleName: '@fixture/tool/client', packageName: '@fixture/tool', category: 'third-party', enabled: true, phase: 'active', protected: false, protectionReason: null, error: null },
    { entryId: 'tool-host', configId: 'tool-host', moduleName: '@fixture/tool/host', packageName: '@fixture/tool', category: 'third-party', enabled: false, phase: null, protected: false, protectionReason: null, error: null },
    { entryId: 'manager', configId: 'manager', moduleName: 'dsh-plugin-manager', packageName: 'dsh-plugin-manager', category: 'third-party', enabled: true, phase: 'active', protected: true, protectionReason: 'self', error: null },
    { entryId: 'session', configId: 'session', moduleName: '@deepseek-ai/dsh-session-persistence', packageName: '@deepseek-ai/dsh-session-persistence', category: 'official', enabled: true, phase: 'active', protected: false, protectionReason: null, error: null },
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
    setCategoryEnabled: vi.fn(async (_category, enabled) => receipt(snapshot, enabled)),
    setPackageEnabled: vi.fn(async (_packageName, enabled) => receipt(snapshot, enabled)),
    ...overrides,
  }
}

describe('PluginManagerTab', () => {
  it('collapses categories and lists config entry names without module names', async () => {
    render(<PluginManagerTab {...props()} />)
    expect(await screen.findByText(en.categoryOfficial)).toBeTruthy()
    expect(screen.getByText(en.categoryOfficial)).toBeTruthy()
    expect(screen.getByText(en.categoryThirdParty)).toBeTruthy()
    expect(screen.queryByText('tool-client')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Third-party/ }))
    expect(screen.getByText('tool-client')).toBeTruthy()
    expect(screen.queryByText('@fixture/tool/client')).toBeNull()
    expect(screen.queryByText('@fixture/tool/host')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'manager' } })
    expect(screen.queryByText('tool-client')).toBeNull()
    expect(screen.queryByText(en.protected)).toBeNull()
    expect(screen.queryByText(en.runtimeSwitch)).toBeNull()
    expect(screen.getByRole('checkbox', { name: /manager/ })).toHaveProperty('disabled', true)
  })

  it('runs entry mutations and adopts their authoritative snapshots', async () => {
    const setEnabled = vi.fn(async () => receipt(snapshot, false, 'tool-client'))
    render(<PluginManagerTab {...props({ setEnabled })} />)
    await screen.findByText(en.categoryThirdParty)
    fireEvent.click(screen.getByRole('button', { name: /Third-party/ }))

    fireEvent.click(screen.getByRole('checkbox', { name: 'tool-client: Disable plugin' }))
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('tool-client', false) })
  })

  it('shows mixed category states in yellow and batches only through the category API', async () => {
    const protectedOnly: PluginManagerSnapshot = {
      ...snapshot,
      entries: snapshot.entries.map(entry => entry.category === 'third-party' && !entry.protected ? { ...entry, enabled: false, phase: null } : entry),
    }
    const setCategoryEnabled = vi.fn(async () => receipt(snapshot, true, 'tool-client'))
    const { rerender } = render(<PluginManagerTab {...props({ setCategoryEnabled })} />)
    await screen.findByText(en.categoryThirdParty)
    const mixed = screen.getByRole('checkbox', { name: `${en.categoryThirdParty}: ${en.disableCategory}` })
    expect(mixed).toHaveProperty('checked', true)
    expect(mixed.closest('label')?.dataset.warning).toBe('true')
    fireEvent.click(mixed)
    await waitFor(() => { expect(setCategoryEnabled).toHaveBeenCalledWith('third-party', false) })

    rerender(<PluginManagerTab {...props({ list: async () => protectedOnly, setCategoryEnabled })} />)
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    const protectedOn = await screen.findByRole('checkbox', { name: `${en.categoryThirdParty}: ${en.enableCategory}` })
    expect(protectedOn).toHaveProperty('checked', false)
    expect(protectedOn.closest('label')?.dataset.warning).toBe('true')
  })

  it('shows operation failures and retries a failed initial load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(snapshot)
    const setEnabled = vi.fn(async (): Promise<MutationReceipt> => ({
      enabled: true,
      items: [{ entryId: 'tool-host', status: 'failed', message: 'HMR rejected the patch.' }],
      snapshot,
    }))
    render(<PluginManagerTab {...props({ list, setEnabled })} />)
    expect((await screen.findByRole('alert')).textContent).toContain(`${en.error} private`)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByText(en.categoryThirdParty)
    fireEvent.click(screen.getByRole('button', { name: /Third-party/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'tool-host: Enable plugin' }))
    expect((await screen.findByRole('alert')).textContent).toContain('HMR rejected the patch.')
  })

  it('shows a restart-required result as a non-error status', async () => {
    const setEnabled = vi.fn(async (): Promise<MutationReceipt> => ({
      enabled: true,
      items: [{ entryId: 'tool-host', status: 'restart-required', message: en.restartRequired }],
      snapshot,
    }))
    render(<PluginManagerTab {...props({ setEnabled })} />)
    await screen.findByText(en.categoryThirdParty)
    fireEvent.click(screen.getByRole('button', { name: /Third-party/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'tool-host: Enable plugin' }))
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
