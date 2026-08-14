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
  private latest = new Map<string, Pick<MarketplacePlugin, 'packageName' | 'version'>>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'marketplace')
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

  @Remote('installPlugin')
  async install(packageName: string, version: string): Promise<InstallReceipt> {
    const target = this.latest.get(packageName)
    if (target === undefined || target.version !== version) {
      throw new Error('Install target is not present in the latest verified marketplace snapshot.')
    }
    const dependencies = await installedDependencies(this.location.directory)
    return await this.installer.install(target, this.location, dependencies)
  }

  private async project(state: Awaited<ReturnType<CatalogService['list']>>): Promise<MarketplaceSnapshot> {
    const dependencies = await installedDependencies(this.location.directory)
    const candidateTargets: Array<readonly [string, Pick<MarketplacePlugin, 'packageName' | 'version'>]> = []
    for (const candidate of state.candidates) {
      if (candidate.installable && candidate.packageName !== null && candidate.version !== null) {
        candidateTargets.push([candidate.packageName, { packageName: candidate.packageName, version: candidate.version }])
      }
    }
    this.latest = new Map([
      ...state.plugins.map(plugin => [plugin.packageName, plugin] as const),
      ...candidateTargets,
    ])
    return snapshotWithProfile(state, this.location.profileName, dependencies)
  }
}

export default PluginMarketplace
