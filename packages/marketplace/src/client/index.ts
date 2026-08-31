import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import remoteContribution from '@ruihuahe/dsh-plugin-marketplace/remote'
import { PluginMarketplaceTab, type PluginMarketplaceTabApi } from './PluginMarketplaceTab.js'
import { en, zh, type LocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.pluginMarketplace': LocaleKey } }

export const inject = ['slots', 'locale', 'remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
  const disposeLocale = ctx.locale.register('settings.pluginMarketplace', { zh, en })
  const feature = ctx.inject(['remote.marketplace'], (scope: ClientContext) => {
    const t = scope.locale.bind('settings.pluginMarketplace')
    const api: PluginMarketplaceTabApi = {
      list: async refresh => unwrap(await scope.remote.marketplace.list(refresh)),
      install: async (packageName, version) => unwrap(await scope.remote.marketplace.installPlugin(packageName, version)),
    }
    scope.slots.inject('settings.plugins.tab', () => scope.slots.register({
      name: 'settings.plugins.tab', id: 'marketplace', order: 0, label: () => t('tab'), locale: 'settings.pluginMarketplace',
      inject: () => ({ ...api, t, locale: t('localeId') }),
    }, PluginMarketplaceTab))
  })
  return async () => { await feature.dispose(); disposeLocale(); await disposeRemote() }
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

export { PluginMarketplaceTab } from './PluginMarketplaceTab.js'
export type { PluginMarketplaceTabApi, PluginMarketplaceTabProps } from './PluginMarketplaceTab.js'
