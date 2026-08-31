import { posix } from 'node:path'
import { valid as validVersion } from 'semver'
import { z } from 'zod'
import {
  canonicalGithubRepository,
  catalogDocumentSchema,
  isSafePackagePath,
  npmPackageNameSchema,
  packageManifestSchema,
  type CatalogDocument,
  type CatalogEntry,
  type PackageManifest,
} from '../manifest.js'
import { compareCatalogEntries, type CatalogIssueCode, type LocalizedText } from '../types.js'

const DEFAULT_GITHUB_API = 'https://api.github.com'
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com'
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'
const GITHUB_RAW_ACCEPT = 'application/vnd.github.raw+json'
const DEFAULT_REPOSITORY_BATCH_SIZE = 8
const DEFAULT_REPOSITORY_LIMIT = 1_000
const DEFAULT_PACKAGE_MANIFEST_LIMIT = 64

const searchSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(z.object({
    full_name: z.string(),
    name: z.string(),
    html_url: z.string().url(),
    default_branch: z.string(),
    description: z.string().nullable().optional(),
    topics: z.array(z.string()).optional(),
    license: z.object({ spdx_id: z.string().nullable() }).nullable().optional(),
    archived: z.boolean(),
    fork: z.boolean(),
  })),
})
const commitSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/i) })
const treeSchema = z.object({
  truncated: z.boolean().optional().default(false),
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
})
const npmRepositorySchema = z.union([
  z.string().trim().min(1),
  z.object({ url: z.string().trim().min(1) }).passthrough(),
])
const npmSchema = z.object({
  versions: z.record(z.string(), z.object({
    repository: npmRepositorySchema,
    dsh: z.unknown().optional(),
  }).passthrough()),
})

export interface CatalogCollectorConfig {
  readonly githubTopic?: string
  readonly githubApiUrl?: string
  readonly rawGithubUrl?: string
  readonly npmRegistryUrl?: string
  readonly requestTimeoutMs?: number
  readonly githubRepositoryBatchSize?: number
  readonly githubRepositoryLimit?: number
  readonly githubToken?: string
  readonly previousCatalog?: CatalogDocument
  readonly incrementalSince?: string
}

type Fetcher = typeof fetch
type GithubRepository = z.infer<typeof searchSchema>['items'][number]

interface ManifestSource {
  readonly label: string
  readonly path: string
  readonly url: string
  readonly raw: unknown
}

class CandidateValidationError extends Error {
  constructor(readonly code: CatalogIssueCode, message: string) {
    super(message)
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function boundedText(value: string, maximum: number): string {
  const normalized = value.trim()
  return normalized.length <= maximum ? normalized : normalized.slice(0, maximum)
}

function localizedValue(fallback: string, maximum: number): LocalizedText {
  const normalized = boundedText(fallback, maximum)
  return { 'zh-CN': normalized, en: normalized }
}

function hasBundleDeclaration(raw: unknown): boolean {
  const dsh = objectValue(objectValue(raw)?.dsh)
  const bundle = objectValue(dsh?.bundle)
  return typeof bundle?.patch === 'string' && isSafePackagePath(bundle.patch)
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.floor(value)))
}

function batches<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const result: (readonly T[])[] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function optionalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try { return new URL(value).toString() } catch { return null }
}

function packageManifestPaths(tree: z.infer<typeof treeSchema>): readonly string[] {
  return tree.tree
    .filter(item => item.type === 'blob' && (item.path === 'package.json' || item.path.endsWith('/package.json')))
    .map(item => item.path)
    .filter(isSafePackagePath)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, DEFAULT_PACKAGE_MANIFEST_LIMIT)
}

/** Build-time GitHub and npm scanner. Runtime marketplace code never calls this collector. */
export class CatalogCollector {
  private readonly githubTopic: string
  private readonly githubApiUrl: string
  private readonly rawGithubUrl: string
  private readonly npmRegistryUrl: string
  private readonly timeoutMs: number
  private readonly repositoryBatchSize: number
  private readonly repositoryLimit: number
  private readonly githubToken: string | undefined
  private readonly previousCatalog: CatalogDocument | undefined
  private readonly incrementalSince: string | undefined
  private readonly fetcher: Fetcher

  constructor(config: CatalogCollectorConfig = {}, fetcher: Fetcher = fetch) {
    this.githubTopic = config.githubTopic ?? 'dsh-plugin'
    this.githubApiUrl = (config.githubApiUrl ?? DEFAULT_GITHUB_API).replace(/\/$/, '')
    this.rawGithubUrl = (config.rawGithubUrl ?? DEFAULT_RAW_BASE).replace(/\/$/, '')
    this.npmRegistryUrl = (config.npmRegistryUrl ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, '')
    this.timeoutMs = config.requestTimeoutMs ?? 15_000
    this.repositoryBatchSize = boundedInteger(config.githubRepositoryBatchSize, DEFAULT_REPOSITORY_BATCH_SIZE, 1, 32)
    this.repositoryLimit = boundedInteger(config.githubRepositoryLimit, DEFAULT_REPOSITORY_LIMIT, 1, 1_000)
    this.githubToken = config.githubToken?.trim() === '' ? undefined : config.githubToken
    this.previousCatalog = config.previousCatalog
    this.incrementalSince = config.incrementalSince
    this.fetcher = fetcher
  }

  async collect(): Promise<CatalogDocument> {
    const { repositories, warnings } = await this.discoverRepositories()
    const refreshed = new Set(repositories.map(repository => repository.full_name))
    const entries: CatalogEntry[] = this.previousCatalog?.entries.filter(entry => !refreshed.has(entry.repositoryFullName)) ?? []
    for (const batch of batches(repositories, this.repositoryBatchSize)) {
      const settled = await Promise.allSettled(batch.map(repository => this.readRepository(repository)))
      for (const [index, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          entries.push(...result.value)
          continue
        }
        const repository = batch[index]
        if (repository === undefined) continue
        const issue = this.candidateIssue(result.reason, 'repository-unavailable')
        entries.push(this.packageEntry(repository, '.', null, undefined, issue.code, issue.message))
      }
    }
    return catalogDocumentSchema.parse({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      entries: [...this.rejectPackageConflicts(entries)].sort(compareCatalogEntries),
      warnings: this.withCarriedCoverageWarning(warnings),
    })
  }

  private async discoverRepositories(): Promise<{
    readonly repositories: readonly GithubRepository[]
    readonly warnings: readonly { code: string, message: string }[]
  }> {
    const repositories = new Map<string, GithubRepository>()
    let totalCount = 0
    for (let page = 1; page <= 10 && repositories.size < this.repositoryLimit; page += 1) {
      const url = new URL(`${this.githubApiUrl}/search/repositories`)
      const incremental = this.incrementalSince === undefined ? '' : ` updated:>=${this.incrementalSince}`
      url.searchParams.set('q', `topic:${this.githubTopic} archived:false fork:false${incremental}`)
      url.searchParams.set('sort', 'updated')
      url.searchParams.set('order', 'desc')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))
      const response = await this.request(url, { headers: { accept: 'application/vnd.github+json' } }, true)
      if (!response.ok) throw new Error(`GitHub search page ${page} returned HTTP ${response.status}`)
      const result = searchSchema.parse(await response.json())
      totalCount = result.total_count
      for (const repository of result.items) {
        if (!repository.archived && !repository.fork) repositories.set(repository.full_name, repository)
        if (repositories.size >= this.repositoryLimit) break
      }
      if (result.items.length < 100) break
    }
    const warnings: Array<{ code: string, message: string }> = []
    if (totalCount > repositories.size) {
      warnings.push({
        code: 'github-results-truncated',
        message: `GitHub reports ${totalCount} topic repositories; this catalog scan inspected the newest ${repositories.size}.`,
      })
    }
    return { repositories: [...repositories.values()], warnings }
  }

  private async readRepository(repository: GithubRepository): Promise<readonly CatalogEntry[]> {
    const fullName = repository.full_name
    const branch = repository.default_branch
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error(`invalid GitHub repository ${fullName}`)
    const commitResponse = await this.request(`${this.githubApiUrl}/repos/${fullName}/commits/${encodeURIComponent(branch)}`, {
      headers: { accept: 'application/vnd.github+json' },
    }, true)
    if (!commitResponse.ok) throw new Error(`${fullName} commit lookup returned HTTP ${commitResponse.status}`)
    const { sha } = commitSchema.parse(await commitResponse.json())
    const rootUrl = `${this.rawGithubUrl}/${fullName}/${sha}/package.json`
    let root: unknown
    try {
      root = await this.readGithubJson(fullName, sha, 'package.json', rootUrl)
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-unavailable')
      return [this.packageEntry(repository, '.', rootUrl, undefined, issue.code, issue.message)]
    }

    const sources: ManifestSource[] = []
    if (hasBundleDeclaration(root)) sources.push({ label: '.', path: 'package.json', url: rootUrl, raw: root })
    try {
      const tree = await this.readGithubTree(fullName, sha)
      const childPaths = packageManifestPaths(tree).filter(path => path !== 'package.json')
      for (const batch of batches(childPaths, this.repositoryBatchSize)) {
        await Promise.all(batch.map(async path => {
          const label = posix.dirname(path)
          const url = `${this.rawGithubUrl}/${fullName}/${sha}/${path}`
          try {
            const raw = await this.readGithubJson(fullName, sha, path, url)
            if (hasBundleDeclaration(raw)) sources.push({ label, path, url, raw })
          } catch {
            // A package without a readable manifest cannot be identified as a plugin candidate.
          }
        }))
      }
    } catch {
      // Root packages remain discoverable if a repository denies recursive-tree access.
    }

    if (sources.length === 0) {
      sources.push({ label: '.', path: 'package.json', url: rootUrl, raw: root })
    }
    const entries: CatalogEntry[] = []
    for (const batch of batches(sources, this.repositoryBatchSize)) {
      await Promise.all(batch.map(async source => {
        entries.push(await this.validateManifest(repository, source, fullName))
      }))
    }
    return entries
  }

  private async validateManifest(
    repository: GithubRepository, source: ManifestSource, fullName: string,
  ): Promise<CatalogEntry> {
    try {
      const manifest = packageManifestSchema.parse(source.raw)
      const expectedRepository = canonicalGithubRepository(`https://github.com/${fullName}`)
      if (expectedRepository === null) throw new Error(`invalid GitHub repository ${fullName}`)
      const compatibility = await this.verifyNpmReference(manifest.name, manifest.version, expectedRepository)
      return this.admittedEntry(repository, source, manifest, compatibility)
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-invalid')
      return this.packageEntry(repository, source.label, source.url, source.raw, issue.code, issue.message)
    }
  }

  private admittedEntry(
    repository: GithubRepository, source: ManifestSource, manifest: PackageManifest, compatibility: 'declared' | 'unverified',
  ): CatalogEntry {
    const description = typeof manifest.description === 'string' && manifest.description.trim() !== ''
      ? manifest.description
      : repository.description?.trim() || `GitHub repository ${repository.full_name}`
    const keywords = Array.isArray(manifest.keywords)
      ? manifest.keywords.filter((value): value is string => typeof value === 'string')
      : repository.topics ?? []
    return {
      id: `${repository.full_name}:${source.label}`,
      repositoryFullName: repository.full_name,
      repositoryUrl: repository.html_url,
      packageName: manifest.name,
      version: manifest.version,
      displayName: localizedValue(manifest.name, 120),
      summary: localizedValue(description, 360),
      keywords,
      license: manifest.license ?? repository.license?.spdx_id ?? null,
      repositoryDirectory: source.label === '.' ? null : source.label,
      homepage: manifest.homepage ?? null,
      manifestUrl: source.url,
      availability: 'installable',
      compatibility,
      issueCode: null,
      issue: null,
    }
  }

  private packageEntry(
    repository: GithubRepository,
    label: string,
    manifestUrl: string | null,
    raw: unknown,
    issueCode: CatalogIssueCode,
    issue: string,
  ): CatalogEntry {
    const manifest = objectValue(raw)
    const packageName = typeof manifest?.name === 'string' && npmPackageNameSchema.safeParse(manifest.name).success ? manifest.name : null
    const fallbackName = packageName ?? repository.name
    const description = typeof manifest?.description === 'string' && manifest.description.trim() !== ''
      ? manifest.description
      : repository.description?.trim() || `GitHub repository ${repository.full_name}`
    const keywords = Array.isArray(manifest?.keywords)
      ? manifest.keywords.filter((value): value is string => typeof value === 'string')
      : repository.topics ?? []
    return {
      id: `${repository.full_name}:${label}`,
      repositoryFullName: repository.full_name,
      repositoryUrl: repository.html_url,
      packageName,
      version: typeof manifest?.version === 'string' && validVersion(manifest.version) === manifest.version ? manifest.version : null,
      displayName: localizedValue(fallbackName, 120),
      summary: localizedValue(description, 360),
      keywords,
      license: typeof manifest?.license === 'string' && manifest.license.trim() !== ''
        ? manifest.license : repository.license?.spdx_id ?? null,
      repositoryDirectory: label === '.' ? null : label,
      homepage: optionalUrl(manifest?.homepage),
      manifestUrl,
      availability: 'unavailable',
      compatibility: 'unverified',
      issueCode,
      issue,
    }
  }

  private async verifyNpmReference(
    packageName: string, version: string, expectedRepository: string,
  ): Promise<'declared' | 'unverified'> {
    const response = await this.request(`${this.npmRegistryUrl}/${encodeURIComponent(packageName)}`)
    if (!response.ok) throw new CandidateValidationError('package-unpublished', `${packageName} is not published on npm`)
    let metadata: z.infer<typeof npmSchema>
    try {
      metadata = npmSchema.parse(await response.json())
    } catch (error) {
      throw new CandidateValidationError('package-invalid', `${packageName} has invalid npm metadata: ${this.errorMessage(error)}`)
    }
    const published = metadata.versions[version]
    if (published === undefined) {
      throw new CandidateValidationError('package-unpublished', `${packageName}@${version} is not published on npm`)
    }
    const repository = typeof published.repository === 'string' ? published.repository : published.repository.url
    if (canonicalGithubRepository(repository) !== expectedRepository) {
      throw new CandidateValidationError('repository-mismatch', `${packageName}@${version} npm repository does not match its discovery repository`)
    }
    return hasBundleDeclaration(published) ? 'declared' : 'unverified'
  }

  private rejectPackageConflicts(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
    const targets = new Map<string, CatalogEntry[]>()
    for (const entry of entries) {
      if (entry.availability !== 'installable' || entry.packageName === null || entry.version === null) continue
      const target = `${entry.packageName}@${entry.version}`
      const values = targets.get(target) ?? []
      values.push(entry)
      targets.set(target, values)
    }
    const conflicts = new Set([...targets].filter(([, values]) => values.length > 1).map(([target]) => target))
    return entries.map(entry => {
      const target = entry.packageName === null || entry.version === null ? null : `${entry.packageName}@${entry.version}`
      if (target === null || !conflicts.has(target)) return entry
      return {
        ...entry,
        availability: 'unavailable',
        issueCode: 'package-conflict',
        issue: `Multiple catalog entries claim npm package ${target}.`,
      }
    })
  }

  private withCarriedCoverageWarning(warnings: readonly { code: string, message: string }[]): readonly { code: string, message: string }[] {
    const carried = this.previousCatalog?.warnings.filter(item => item.code === 'github-results-truncated') ?? []
    return [...new Map([...carried, ...warnings].map(item => [`${item.code}:${item.message}`, item])).values()]
  }

  private async readGithubTree(fullName: string, sha: string): Promise<z.infer<typeof treeSchema>> {
    const url = new URL(`${this.githubApiUrl}/repos/${fullName}/git/trees/${sha}`)
    url.searchParams.set('recursive', '1')
    const response = await this.request(url, { headers: { accept: 'application/vnd.github+json' } }, true)
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
    return treeSchema.parse(await response.json())
  }

  private async request(input: string | URL, init: RequestInit = {}, github = false): Promise<Response> {
    const authorization = github && this.githubToken !== undefined ? { authorization: `Bearer ${this.githubToken}` } : {}
    return await this.fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'user-agent': 'dsh-plugin-marketplace-catalog/0.1', ...authorization, ...init.headers },
    })
  }

  private async readJson(url: string): Promise<unknown> {
    const response = await this.request(url)
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
    return await response.json()
  }

  private async readGithubJson(fullName: string, ref: string, path: string, rawUrl: string): Promise<unknown> {
    const apiUrl = new URL(`${this.githubApiUrl}/repos/${fullName}/contents/${path}`)
    apiUrl.searchParams.set('ref', ref)
    const response = await this.request(apiUrl, { headers: { accept: GITHUB_RAW_ACCEPT } }, true)
    if (response.ok) return await response.json()
    if (response.status !== 404) throw new Error(`${apiUrl} returned HTTP ${response.status}`)
    return await this.readJson(rawUrl)
  }

  private candidateIssue(error: unknown, fallback: CatalogIssueCode): { code: CatalogIssueCode, message: string } {
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
}
