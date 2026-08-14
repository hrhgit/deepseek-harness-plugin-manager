import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  canonicalGithubRepository,
  catalogDocumentSchema,
  catalogPluginFromManifest,
  dshCatalogRootSchema,
  packageManifestSchema,
  type CatalogPlugin,
} from '../manifest.js'
import type { DiscoveryWarning, MarketplacePlugin, MarketplaceSnapshot, MarketplaceSource } from '../types.js'

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/hrhgit/deepseek-harness-plugin-manager/main/catalog/v1/catalog.json'
const DEFAULT_GITHUB_API = 'https://api.github.com'
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com'
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'

const searchSchema = z.object({
  items: z.array(z.object({
    full_name: z.string(),
    default_branch: z.string(),
    archived: z.boolean(),
    fork: z.boolean(),
  })),
})
const commitSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/i) })
const npmSchema = z.object({
  'dist-tags': z.record(z.string(), z.string()),
  versions: z.record(z.string(), z.object({
    repository: z.union([z.string(), z.object({ url: z.string() }).passthrough()]),
    dsh: z.object({ bundle: z.object({ patch: z.string() }).passthrough() }).passthrough(),
  }).passthrough()),
})
const cacheSchema = z.object({
  schemaVersion: z.literal(1),
  etag: z.string().nullable(),
  fetchedAt: z.string(),
  plugins: z.array(z.object({
    packageName: z.string(), version: z.string(), displayName: z.object({ 'zh-CN': z.string(), en: z.string() }),
    summary: z.object({ 'zh-CN': z.string(), en: z.string() }), category: z.string(), keywords: z.array(z.string()),
    license: z.string(), repositoryUrl: z.string(), repositoryDirectory: z.string().nullable(), homepage: z.string().nullable(),
    manifestUrl: z.string(), sources: z.array(z.union([z.literal('catalog'), z.literal('github-topic')])), installedVersion: z.null(),
  })),
})

export interface CatalogServiceConfig {
  readonly catalogUrl?: string
  readonly githubTopic?: string
  readonly githubApiUrl?: string
  readonly rawGithubUrl?: string
  readonly npmRegistryUrl?: string
  readonly cacheFile: string
  readonly requestTimeoutMs?: number
}

export interface CatalogState {
  readonly plugins: readonly MarketplacePlugin[]
  readonly warnings: readonly DiscoveryWarning[]
  readonly stale: boolean
  readonly fetchedAt: string
}

type Fetcher = typeof fetch

/** Network and cache boundary for curated and topic-based plugin discovery. */
export class CatalogService {
  private readonly catalogUrl: string
  private readonly githubTopic: string
  private readonly githubApiUrl: string
  private readonly rawGithubUrl: string
  private readonly npmRegistryUrl: string
  private readonly cacheFile: string
  private readonly timeoutMs: number
  private readonly fetcher: Fetcher
  private etag: string | null = null
  private catalog = new Map<string, MarketplacePlugin>()
  private candidates = new Map<string, MarketplacePlugin>()
  private state: CatalogState | undefined

  constructor(config: CatalogServiceConfig, fetcher: Fetcher = fetch) {
    this.catalogUrl = config.catalogUrl ?? DEFAULT_CATALOG_URL
    this.githubTopic = config.githubTopic ?? 'dsh-plugin'
    this.githubApiUrl = (config.githubApiUrl ?? DEFAULT_GITHUB_API).replace(/\/$/, '')
    this.rawGithubUrl = (config.rawGithubUrl ?? DEFAULT_RAW_BASE).replace(/\/$/, '')
    this.npmRegistryUrl = (config.npmRegistryUrl ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, '')
    this.cacheFile = config.cacheFile
    this.timeoutMs = config.requestTimeoutMs ?? 10_000
    this.fetcher = fetcher
  }

  async list(refresh = false): Promise<CatalogState> {
    if (!refresh && this.state !== undefined) return this.state
    const warnings: DiscoveryWarning[] = []
    let stale = false
    try {
      const response = await this.request(this.catalogUrl,
        this.etag === null ? {} : { headers: { 'if-none-match': this.etag } })
      if (response.status === 304 && this.catalog.size > 0) {
        // Keep the normalized in-memory directory.
      } else {
        if (!response.ok) throw new Error(`catalog returned HTTP ${response.status}`)
        const document = catalogDocumentSchema.parse(await response.json())
        const hydrated = await this.hydrateAll(document.plugins, 'catalog', warnings)
        this.catalog = new Map(hydrated.map(plugin => [plugin.packageName, plugin]))
        this.etag = response.headers.get('etag')
      }
    } catch (error) {
      const cached = await this.readCache()
      if (cached === undefined && this.catalog.size === 0) throw error
      if (this.catalog.size === 0 && cached !== undefined) {
        this.etag = cached.etag
        this.catalog = new Map(cached.plugins.filter(plugin => plugin.sources.includes('catalog')).map(plugin => [plugin.packageName, plugin]))
        this.candidates = new Map(cached.plugins.filter(plugin => plugin.sources.includes('github-topic')).map(plugin => [plugin.packageName, plugin]))
      }
      stale = true
      warnings.push(this.warning('catalog', 'catalog-unavailable', error))
    }
    const state = this.combine(warnings, stale)
    this.state = state
    await this.writeCache(state)
    return state
  }

  async searchGithub(query: string): Promise<CatalogState> {
    const normalized = query.trim()
    if (normalized.length > 80) throw new Error('GitHub search query must not exceed 80 characters')
    const warnings: DiscoveryWarning[] = []
    try {
      const q = [`topic:${this.githubTopic}`, 'archived:false', 'fork:false', normalized].filter(Boolean).join(' ')
      const url = new URL(`${this.githubApiUrl}/search/repositories`)
      url.searchParams.set('q', q)
      url.searchParams.set('sort', 'updated')
      url.searchParams.set('order', 'desc')
      url.searchParams.set('per_page', '30')
      const response = await this.request(url, { headers: { accept: 'application/vnd.github+json' } })
      if (!response.ok) throw new Error(`GitHub search returned HTTP ${response.status}`)
      const result = searchSchema.parse(await response.json())
      const repositories = result.items.filter(item => !item.archived && !item.fork)
      const settled = await Promise.allSettled(repositories.map(item => this.readRepository(item.full_name, item.default_branch)))
      for (const result of settled) {
        if (result.status === 'rejected') {
          warnings.push(this.warning('github-topic', 'candidate-rejected', result.reason))
          continue
        }
        for (const plugin of result.value) {
          const existing = this.candidates.get(plugin.packageName)
          if (existing !== undefined && existing.repositoryUrl !== plugin.repositoryUrl) {
            warnings.push({ source: 'github-topic', code: 'candidate-conflict', message: `Conflicting repositories claim ${plugin.packageName}.` })
            continue
          }
          this.candidates.set(plugin.packageName, plugin)
        }
      }
    } catch (error) {
      warnings.push(this.warning('github-topic', 'github-unavailable', error))
    }
    const base = await this.list(false).catch(() => this.combine([], true))
    const state = this.combine([...base.warnings, ...warnings], base.stale)
    this.state = state
    await this.writeCache(state)
    return state
  }

  private async readRepository(fullName: string, branch: string): Promise<readonly MarketplacePlugin[]> {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error(`invalid GitHub repository ${fullName}`)
    const commitResponse = await this.request(`${this.githubApiUrl}/repos/${fullName}/commits/${encodeURIComponent(branch)}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (!commitResponse.ok) throw new Error(`${fullName} commit lookup returned HTTP ${commitResponse.status}`)
    const { sha } = commitSchema.parse(await commitResponse.json())
    const rootUrl = `${this.rawGithubUrl}/${fullName}/${sha}/package.json`
    const root = await this.readJson(rootUrl)
    const paths = dshCatalogRootSchema.safeParse((root as { dsh?: { catalog?: unknown } }).dsh?.catalog)
    const manifests = paths.success
      ? await Promise.all(paths.data.packages.map(async path => ({
          url: `${this.rawGithubUrl}/${fullName}/${sha}/${path}/package.json`,
          value: await this.readJson(`${this.rawGithubUrl}/${fullName}/${sha}/${path}/package.json`),
        })))
      : [{ url: rootUrl, value: root }]
    const expected = canonicalGithubRepository(`https://github.com/${fullName}`)
    const plugins: MarketplacePlugin[] = []
    for (const item of manifests) {
      const manifest = packageManifestSchema.parse(item.value)
      const source = catalogPluginFromManifest(manifest, item.url)
      if (source.repositoryUrl !== expected) throw new Error(`${manifest.name} repository does not match ${fullName}`)
      const hydrated = await this.hydrate(source, 'github-topic')
      plugins.push(hydrated)
    }
    return plugins
  }

  private async hydrateAll(
    plugins: readonly CatalogPlugin[], source: MarketplaceSource, warnings: DiscoveryWarning[],
  ): Promise<readonly MarketplacePlugin[]> {
    const settled = await Promise.allSettled(plugins.map(plugin => this.hydrate(plugin, source)))
    const result: MarketplacePlugin[] = []
    for (const item of settled) {
      if (item.status === 'fulfilled') result.push(item.value)
      else warnings.push(this.warning(source, 'package-rejected', item.reason))
    }
    return result
  }

  private async hydrate(plugin: CatalogPlugin, source: MarketplaceSource): Promise<MarketplacePlugin> {
    const response = await this.request(`${this.npmRegistryUrl}/${encodeURIComponent(plugin.packageName)}`)
    if (!response.ok) throw new Error(`${plugin.packageName} is not published on npm`)
    const metadata = npmSchema.parse(await response.json())
    const published = metadata.versions[plugin.version]
    if (published === undefined) throw new Error(`${plugin.packageName}@${plugin.version} is not published on npm`)
    const repository = typeof published.repository === 'string' ? published.repository : published.repository.url
    if (canonicalGithubRepository(repository) !== plugin.repositoryUrl) {
      throw new Error(`${plugin.packageName}@${plugin.version} npm repository does not match its discovery repository`)
    }
    return { ...plugin, sources: [source], installedVersion: null }
  }

  private combine(warnings: readonly DiscoveryWarning[], stale: boolean): CatalogState {
    const merged = new Map(this.candidates)
    for (const [name, catalog] of this.catalog) {
      const candidate = merged.get(name)
      merged.set(name, candidate === undefined ? catalog : { ...catalog, sources: ['catalog', 'github-topic'] })
    }
    return {
      plugins: [...merged.values()].sort((left, right) => left.packageName.localeCompare(right.packageName)),
      warnings,
      stale,
      fetchedAt: new Date().toISOString(),
    }
  }

  private async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    return await this.fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'user-agent': 'dsh-plugin-marketplace/0.1', ...init.headers },
    })
  }

  private async readJson(url: string): Promise<unknown> {
    const response = await this.request(url)
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
    return await response.json()
  }

  private warning(source: MarketplaceSource, code: string, error: unknown): DiscoveryWarning {
    return { source, code, message: error instanceof Error ? error.message : String(error) }
  }

  private async readCache(): Promise<z.infer<typeof cacheSchema> | undefined> {
    try {
      return cacheSchema.parse(JSON.parse(await readFile(this.cacheFile, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      return undefined
    }
  }

  private async writeCache(state: CatalogState): Promise<void> {
    const document = { schemaVersion: 1, etag: this.etag, fetchedAt: state.fetchedAt, plugins: state.plugins }
    const temporary = join(dirname(this.cacheFile), `.${randomUUID()}.tmp`)
    try {
      await mkdir(dirname(this.cacheFile), { recursive: true })
      await writeFile(temporary, JSON.stringify(document, undefined, 2) + '\n', 'utf8')
      await rename(temporary, this.cacheFile)
    } catch {
      // Discovery remains usable when the local cache is not writable.
    }
  }
}

export function snapshotWithProfile(
  state: CatalogState, profileName: string, dependencies: Readonly<Record<string, string>>,
): MarketplaceSnapshot {
  return {
    profileName,
    plugins: state.plugins.map(plugin => ({ ...plugin, installedVersion: dependencies[plugin.packageName] ?? null })),
    warnings: state.warnings,
    stale: state.stale,
    fetchedAt: state.fetchedAt,
  }
}
