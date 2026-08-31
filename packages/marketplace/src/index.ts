import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { CatalogService, snapshotWithProfile } from './host/catalog.js'
import { installTargetKey } from './host/install-target.js'
import { currentDshRunner, MarketplaceInstaller, type MarketplaceInstallTarget } from './host/installer.js'
import { installedDependencies, profileLocation, type ProfileLocation } from './host/profile.js'
import type { InstallReceipt, MarketplaceSnapshot } from './types.js'

export type * from './types.js'
export * from './manifest.js'

export interface Config {
  readonly catalogUrl?: string
  readonly requestTimeoutMs?: number
  readonly installTimeoutMs?: number
}

/** Independent discovery and installation service for the active DSH profile. */
export class PluginMarketplace extends TypertRemoteService {
  static inject = ['loader']

  private readonly location: ProfileLocation
  private readonly catalog: CatalogService
  private readonly installer: MarketplaceInstaller
  private latest = new Map<string, MarketplaceInstallTarget>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'marketplace')
    const baseUrl = ctx.loader.ctx.baseUrl
    if (baseUrl === undefined) throw new Error('dsh-plugin-marketplace requires a file-backed Loader root')
    this.location = profileLocation(baseUrl)
    this.catalog = new CatalogService({
      cacheFile: join(dshHomePath('cache', 'dsh-plugin-marketplace'), 'catalog-v2.json'),
      ...(config.catalogUrl === undefined ? {} : { catalogUrl: config.catalogUrl }),
      ...(config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs }),
    })
    this.installer = new MarketplaceInstaller(currentDshRunner(config.installTimeoutMs))
  }

  @Remote('list')
  async list(refresh: boolean): Promise<MarketplaceSnapshot> {
    return await this.project(await this.catalog.list(refresh))
  }

  @Remote('installPlugin')
  async install(packageName: string, version: string): Promise<InstallReceipt> {
    const target = this.latest.get(installTargetKey({ packageName, version }))
    if (target === undefined) {
      throw new Error('Install target is not present in the latest installable marketplace snapshot.')
    }
    const dependencies = await installedDependencies(this.location.directory)
    return await this.installer.install(target, this.location, dependencies)
  }

  private async project(state: Awaited<ReturnType<CatalogService['list']>>): Promise<MarketplaceSnapshot> {
    const dependencies = await installedDependencies(this.location.directory)
    const installTargets: Array<readonly [string, MarketplaceInstallTarget]> = []
    for (const entry of state.entries) {
      if (entry.availability === 'installable' && entry.packageName !== null && entry.version !== null) {
        const target = { packageName: entry.packageName, version: entry.version }
        installTargets.push([installTargetKey(target), target])
      }
    }
    this.latest = new Map(installTargets)
    return snapshotWithProfile(state, this.location.profileName, dependencies)
  }
}

export default PluginMarketplace
