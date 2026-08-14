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
import type {
  CandidateIssueCode,
  DiscoveryWarning,
  LocalizedText,
  MarketplaceCandidate,
  MarketplacePlugin,
  MarketplaceSnapshot,
  MarketplaceSource,
} from '../types.js'

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/hrhgit/deepseek-harness-plugin-manager/main/catalog/v1/catalog.json'
const DEFAULT_GITHUB_API = 'https://api.github.com'
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com'
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'

const searchSchema = z.object({
  items: z.array(z.object({
    full_name: z.string(),
    default_branch: z.string(),
    description: z.string().nullable().optional(),
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
  candidates: z.array(z.object({
    id: z.string(), repositoryFullName: z.string(), repositoryUrl: z.string(), packageName: z.string().nullable(),
    version: z.string().nullable(), displayName: z.object({ 'zh-CN': z.string(), en: z.string() }),
    summary: z.object({ 'zh-CN': z.string(), en: z.string() }), manifestUrl: z.string().nullable(),
    issueCode: z.union([
      z.literal('repository-unavailable'), z.literal('manifest-unavailable'), z.literal('manifest-invalid'),
      z.literal('package-unpublished'), z.literal('package-invalid'), z.literal('repository-mismatch'),
    ]),
    issue: z.string(), source: z.literal('github-topic'),
  })).optional().default([]),
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
  readonly candidates: readonly MarketplaceCandidate[]
  readonly warnings: readonly DiscoveryWarning[]
  readonly stale: boolean
  readonly fetchedAt: string
}

type Fetcher = typeof fetch
type GithubRepository = z.infer<typeof searchSchema>['items'][number]

class CandidateValidationError extends Error {
  constructor(readonly code: CandidateIssueCode, message: string) {
    super(message)
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function localizedValue(value: unknown, fallback: string): LocalizedText {
  const record = objectValue(value)
  return {
    'zh-CN': typeof record?.['zh-CN'] === 'string' && record['zh-CN'].trim() !== '' ? record['zh-CN'] : fallback,
    en: typeof record?.en === 'string' && record.en.trim() !== '' ? record.en : fallback,
  }
}

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
  private githubPlugins = new Map<string, MarketplacePlugin>()
  private candidates = new Map<string, MarketplaceCandidate>()
  private state: CatalogState | undefined
  private cacheLoaded = false

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
    await this.loadCacheOnce()
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
        this.githubPlugins = new Map(cached.plugins.filter(plugin => plugin.sources.includes('github-topic')).map(plugin => [plugin.packageName, plugin]))
        this.candidates = new Map(cached.candidates.map(candidate => [candidate.id, candidate]))
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
    await this.loadCacheOnce()
    const normalized = query.trim()
    if (normalized.length > 80) throw new Error('GitHub search query must not exceed 80 characters')
    const warnings: DiscoveryWarning[] = []
    try {
      const q = [`topic:${this.githubTopic}`, 'archived:false', 'fork:false', normalized].filter(Boolean).join(' ')
      const repositories = new Map<string, z.infer<typeof searchSchema>['items'][number]>()
      for (let page = 1; page <= 10; page += 1) {
        const url = new URL(`${this.githubApiUrl}/search/repositories`)
        url.searchParams.set('q', q)
        url.searchParams.set('sort', 'updated')
        url.searchParams.set('order', 'desc')
        url.searchParams.set('per_page', '100')
        url.searchParams.set('page', String(page))
        const response = await this.request(url, { headers: { accept: 'application/vnd.github+json' } })
        if (!response.ok) throw new Error(`GitHub search page ${page} returned HTTP ${response.status}`)
        const result = searchSchema.parse(await response.json())
        for (const item of result.items) {
          if (!item.archived && !item.fork) repositories.set(item.full_name, item)
        }
        const hasNext = /(?:^|,)\s*<[^>]+>;\s*rel="next"(?:\s*(?:,|$))/.test(response.headers.get('link') ?? '')
        if (!hasNext) break
        if (page === 10) {
          warnings.push({ source: 'github-topic', code: 'github-results-truncated', message: 'GitHub search exceeded its 1,000 result limit.' })
        }
      }
      const repositoryList = [...repositories.values()]
      for (const item of repositoryList) this.clearRepositorySnapshot(item.full_name)
      const settled = await Promise.allSettled(repositoryList.map(item => this.readRepository(item)))
      for (const [index, result] of settled.entries()) {
        if (result.status === 'rejected') {
          const item = repositoryList[index]
          if (item !== undefined) {
            const issue = this.candidateIssue(result.reason, 'repository-unavailable')
            const candidate = this.repositoryCandidate(item, issue.code, issue.message)
            this.candidates.set(candidate.id, candidate)
          }
          continue
        }
        warnings.push(...result.value.warnings)
        for (const candidate of result.value.candidates) this.candidates.set(candidate.id, candidate)
        for (const plugin of result.value.plugins) {
          const existing = this.githubPlugins.get(plugin.packageName)
          if (existing !== undefined && existing.repositoryUrl !== plugin.repositoryUrl) {
            warnings.push({ source: 'github-topic', code: 'candidate-conflict', message: `Conflicting repositories claim ${plugin.packageName}.` })
            continue
          }
          this.githubPlugins.set(plugin.packageName, plugin)
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

  private async readRepository(repository: GithubRepository): Promise<{
    readonly plugins: readonly MarketplacePlugin[]
    readonly candidates: readonly MarketplaceCandidate[]
    readonly warnings: readonly DiscoveryWarning[]
  }> {
    const fullName = repository.full_name
    const branch = repository.default_branch
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error(`invalid GitHub repository ${fullName}`)
    const commitResponse = await this.request(`${this.githubApiUrl}/repos/${fullName}/commits/${encodeURIComponent(branch)}`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (!commitResponse.ok) throw new Error(`${fullName} commit lookup returned HTTP ${commitResponse.status}`)
    const { sha } = commitSchema.parse(await commitResponse.json())
    const rootUrl = `${this.rawGithubUrl}/${fullName}/${sha}/package.json`
    let root: unknown
    try {
      root = await this.readJson(rootUrl)
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-unavailable')
      return { plugins: [], candidates: [this.packageCandidate(repository, '.', rootUrl, undefined, issue.code, issue.message)], warnings: [] }
    }
    const catalog = (root as { dsh?: { catalog?: unknown } }).dsh?.catalog
    let paths: readonly string[] | undefined
    try {
      paths = catalog === undefined ? undefined : dshCatalogRootSchema.parse(catalog).packages
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-invalid')
      return { plugins: [], candidates: [this.packageCandidate(repository, '.', rootUrl, root, issue.code, issue.message)], warnings: [] }
    }
    const manifests = paths === undefined
      ? [{ label: '.', url: rootUrl, raw: root }]
      : paths.map(path => ({
          label: path,
          url: `${this.rawGithubUrl}/${fullName}/${sha}/${path}/package.json`,
          raw: undefined,
        }))
    const expected = canonicalGithubRepository(`https://github.com/${fullName}`)
    const plugins: MarketplacePlugin[] = []
    const candidates: MarketplaceCandidate[] = []
    await Promise.all(manifests.map(async item => {
      let raw = item.raw
      if (raw === undefined) {
        try {
          raw = await this.readJson(item.url)
        } catch (error) {
          const issue = this.candidateIssue(error, 'manifest-unavailable')
          candidates.push(this.packageCandidate(repository, item.label, item.url, undefined, issue.code, issue.message))
          return
        }
      }
      try {
        const manifest = packageManifestSchema.parse(raw)
        const source = catalogPluginFromManifest(manifest, item.url)
        if (source.repositoryUrl !== expected) {
          throw new CandidateValidationError('repository-mismatch', `${manifest.name} repository does not match ${fullName}`)
        }
        plugins.push(await this.hydrate(source, 'github-topic'))
      } catch (error) {
        const issue = this.candidateIssue(error, 'manifest-invalid')
        candidates.push(this.packageCandidate(repository, item.label, item.url, raw, issue.code, issue.message))
      }
    }))
    return { plugins, candidates, warnings: [] }
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
    if (!response.ok) throw new CandidateValidationError('package-unpublished', `${plugin.packageName} is not published on npm`)
    let metadata: z.infer<typeof npmSchema>
    try {
      metadata = npmSchema.parse(await response.json())
    } catch (error) {
      throw new CandidateValidationError('package-invalid', `${plugin.packageName} has invalid npm metadata: ${this.errorMessage(error)}`)
    }
    const published = metadata.versions[plugin.version]
    if (published === undefined) {
      throw new CandidateValidationError('package-unpublished', `${plugin.packageName}@${plugin.version} is not published on npm`)
    }
    const repository = typeof published.repository === 'string' ? published.repository : published.repository.url
    if (canonicalGithubRepository(repository) !== plugin.repositoryUrl) {
      throw new CandidateValidationError('repository-mismatch', `${plugin.packageName}@${plugin.version} npm repository does not match its discovery repository`)
    }
    return { ...plugin, sources: [source], installedVersion: null }
  }

  private combine(warnings: readonly DiscoveryWarning[], stale: boolean): CatalogState {
    const merged = new Map(this.githubPlugins)
    for (const [name, catalog] of this.catalog) {
      const candidate = merged.get(name)
      merged.set(name, candidate === undefined ? catalog : { ...catalog, sources: ['catalog', 'github-topic'] })
    }
    return {
      plugins: [...merged.values()].sort((left, right) => left.packageName.localeCompare(right.packageName)),
      candidates: [...this.candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
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

  private clearRepositorySnapshot(fullName: string): void {
    const repositoryUrl = canonicalGithubRepository(`https://github.com/${fullName}`)
    for (const [name, plugin] of this.githubPlugins) {
      if (plugin.repositoryUrl === repositoryUrl) this.githubPlugins.delete(name)
    }
    const prefix = `${fullName}:`
    for (const id of this.candidates.keys()) {
      if (id.startsWith(prefix)) this.candidates.delete(id)
    }
  }

  private repositoryCandidate(
    repository: GithubRepository, code: CandidateIssueCode, message: string,
  ): MarketplaceCandidate {
    return this.packageCandidate(repository, '.', null, undefined, code, message)
  }

  private packageCandidate(
    repository: GithubRepository,
    label: string,
    manifestUrl: string | null,
    raw: unknown,
    issueCode: CandidateIssueCode,
    issue: string,
  ): MarketplaceCandidate {
    const manifest = objectValue(raw)
    const dsh = objectValue(manifest?.dsh)
    const plugin = objectValue(dsh?.plugin)
    const repositoryName = repository.full_name.split('/').at(-1) ?? repository.full_name
    const packageName = typeof manifest?.name === 'string' ? manifest.name : null
    const fallbackName = packageName ?? repositoryName
    const description = typeof manifest?.description === 'string'
      ? manifest.description
      : repository.description ?? `GitHub repository ${repository.full_name}`
    return {
      id: `${repository.full_name}:${label}`,
      repositoryFullName: repository.full_name,
      repositoryUrl: `https://github.com/${repository.full_name}`,
      packageName,
      version: typeof manifest?.version === 'string' ? manifest.version : null,
      displayName: localizedValue(plugin?.displayName, fallbackName),
      summary: localizedValue(plugin?.summary, description),
      manifestUrl,
      issueCode,
      issue,
      source: 'github-topic',
    }
  }

  private candidateIssue(error: unknown, fallback: CandidateIssueCode): { code: CandidateIssueCode, message: string } {
    return error instanceof CandidateValidationError
      ? { code: error.code, message: error.message }
      : { code: fallback, message: this.errorMessage(error) }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0]
      if (issue !== undefined) return `${issue.path.join('.') || 'package.json'}: ${issue.message}`
    }
    return error instanceof Error ? error.message : String(error)
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

  private async loadCacheOnce(): Promise<void> {
    if (this.cacheLoaded) return
    this.cacheLoaded = true
    const cached = await this.readCache()
    if (cached === undefined) return
    this.etag = cached.etag
    this.catalog = new Map(cached.plugins.filter(plugin => plugin.sources.includes('catalog')).map(plugin => [plugin.packageName, plugin]))
    this.githubPlugins = new Map(cached.plugins.filter(plugin => plugin.sources.includes('github-topic')).map(plugin => [plugin.packageName, plugin]))
    this.candidates = new Map(cached.candidates.map(candidate => [candidate.id, candidate]))
  }

  private async writeCache(state: CatalogState): Promise<void> {
    const document = { schemaVersion: 1, etag: this.etag, fetchedAt: state.fetchedAt, plugins: state.plugins, candidates: state.candidates }
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
    candidates: state.candidates,
    warnings: state.warnings,
    stale: state.stale,
    fetchedAt: state.fetchedAt,
  }
}
