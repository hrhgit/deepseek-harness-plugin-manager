/** Browser entry registering the DeepSeek Harness plugin manager settings tab. */
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import remoteContribution from 'dsh-plugin-manager/remote'
import { PluginManagerTab, type PluginManagerTabApi } from './PluginManagerTab.js'
import { en, zh, type LocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.pluginManager': LocaleKey } }

export const inject = ['slots', 'locale', 'remote']

/** Mount the generated Remote contribution and register the settings tab. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
  const disposeLocale = ctx.locale.register('settings.pluginManager', { zh, en })
  const feature = ctx.inject(['remote.pluginManager'], (scope: ClientContext) => {
    const t = scope.locale.bind('settings.pluginManager')
    const api: PluginManagerTabApi = {
      list: async () => unwrap(await scope.remote.pluginManager.list()),
      setEnabled: async (entryId, enabled) => unwrap(await scope.remote.pluginManager.setEnabled(entryId, enabled)),
      setCategoryEnabled: async (category, enabled) => unwrap(await scope.remote.pluginManager.setCategoryEnabled(category, enabled)),
      setPackageEnabled: async (packageName, enabled) => unwrap(await scope.remote.pluginManager.setPackageEnabled(packageName, enabled)),
    }
    scope.slots.inject('settings.plugins.tab', () => scope.slots.register({
      name: 'settings.plugins.tab', id: 'all', order: 10, label: () => t('tab'), locale: 'settings.pluginManager', inject: () => ({ ...api, t }),
    }, PluginManagerTab))
  })
  return async () => { await feature.dispose(); disposeLocale(); await disposeRemote() }
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

export { PluginManagerTab } from './PluginManagerTab.js'
export type { PluginManagerTabApi, PluginManagerTabProps } from './PluginManagerTab.js'
