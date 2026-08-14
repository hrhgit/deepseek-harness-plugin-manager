import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { CatalogService, snapshotWithProfile } from './host/catalog.js'
import { currentDshRunner, MarketplaceInstaller } from './host/installer.js'
import { installedDependencies, profileLocation, type ProfileLocation } from './host/profile.js'
import type { InstallReceipt, MarketplacePlugin, MarketplaceSnapshot } from './types.js'

export type * from './types.js'
export * from './manifest.js'

export interface Config {
  readonly catalogUrl?: string
  readonly githubTopic?: string
  readonly githubApiUrl?: string
  readonly rawGithubUrl?: string
  readonly npmRegistryUrl?: string
  readonly requestTimeoutMs?: number
  readonly installTimeoutMs?: number
}

/** Independent discovery and installation service for the active DSH profile. */
export class PluginMarketplace extends TypertRemoteService {
  static inject = ['loader']

  private readonly location: ProfileLocation
  private readonly catalog: CatalogService
  private readonly installer: MarketplaceInstaller
  private latest = new Map<string, MarketplacePlugin>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginMarketplace')
    const baseUrl = ctx.loader.ctx.baseUrl
    if (baseUrl === undefined) throw new Error('dsh-plugin-marketplace requires a file-backed Loader root')
    this.location = profileLocation(baseUrl)
    this.catalog = new CatalogService({
      cacheFile: join(dshHomePath('cache', 'dsh-plugin-marketplace'), 'catalog-v1.json'),
      ...(config.catalogUrl === undefined ? {} : { catalogUrl: config.catalogUrl }),
      ...(config.githubTopic === undefined ? {} : { githubTopic: config.githubTopic }),
      ...(config.githubApiUrl === undefined ? {} : { githubApiUrl: config.githubApiUrl }),
      ...(config.rawGithubUrl === undefined ? {} : { rawGithubUrl: config.rawGithubUrl }),
      ...(config.npmRegistryUrl === undefined ? {} : { npmRegistryUrl: config.npmRegistryUrl }),
      ...(config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs }),
    })
    this.installer = new MarketplaceInstaller(currentDshRunner(config.installTimeoutMs))
  }

  @Remote('list')
  async list(refresh: boolean): Promise<MarketplaceSnapshot> {
    return await this.project(await this.catalog.list(refresh))
  }

  @Remote('searchGithub')
  async searchGithub(query: string): Promise<MarketplaceSnapshot> {
    return await this.project(await this.catalog.searchGithub(query))
  }

  @Remote('install')
  async install(packageName: string, version: string): Promise<InstallReceipt> {
    const plugin = this.latest.get(packageName)
    if (plugin === undefined || plugin.version !== version) {
      throw new Error('Install target is not present in the latest validated marketplace snapshot.')
    }
    const dependencies = await installedDependencies(this.location.directory)
    return await this.installer.install(plugin, this.location, dependencies)
  }

  private async project(state: Awaited<ReturnType<CatalogService['list']>>): Promise<MarketplaceSnapshot> {
    this.latest = new Map(state.plugins.map(plugin => [plugin.packageName, plugin]))
    return snapshotWithProfile(state, this.location.profileName, await installedDependencies(this.location.directory))
  }
}

export default PluginMarketplace
