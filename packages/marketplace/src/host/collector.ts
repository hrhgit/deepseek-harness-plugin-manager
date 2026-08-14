import { valid as validVersion } from 'semver'
import { z } from 'zod'
import {
  canonicalGithubRepository,
  catalogDocumentSchema,
  catalogPluginFromManifest,
  dshCatalogRootSchema,
  npmPackageNameSchema,
  packageManifestSchema,
  type CatalogDocument,
  type CatalogEntry,
} from '../manifest.js'
import type { CatalogIssueCode, LocalizedText } from '../types.js'

const DEFAULT_GITHUB_API = 'https://api.github.com'
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com'
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'
const GITHUB_RAW_ACCEPT = 'application/vnd.github.raw+json'
const DEFAULT_REPOSITORY_BATCH_SIZE = 8
const DEFAULT_REPOSITORY_LIMIT = 1_000

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
const npmRepositorySchema = z.union([
  z.string().trim().min(1),
  z.object({ url: z.string().trim().min(1) }).passthrough(),
])
const npmSchema = z.object({
  versions: z.record(z.string(), z.object({
    repository: npmRepositorySchema,
    dsh: z.object({ bundle: z.object({ patch: z.string() }).passthrough() }).passthrough().optional(),
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
}

type Fetcher = typeof fetch
type GithubRepository = z.infer<typeof searchSchema>['items'][number]

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

function localizedValue(value: unknown, fallback: string, maximum: number): LocalizedText {
  const record = objectValue(value)
  return {
    'zh-CN': boundedText(typeof record?.['zh-CN'] === 'string' && record['zh-CN'].trim() !== '' ? record['zh-CN'] : fallback, maximum),
    en: boundedText(typeof record?.en === 'string' && record.en.trim() !== '' ? record.en : fallback, maximum),
  }
}

function npmReference(value: unknown): { packageName: string, version: string } | undefined {
  const record = objectValue(value)
  const packageName = typeof record?.name === 'string' ? record.name : undefined
  const version = typeof record?.version === 'string' && validVersion(record.version) === record.version ? record.version : undefined
  return packageName !== undefined && version !== undefined ? { packageName, version } : undefined
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
    this.fetcher = fetcher
  }

  async collect(): Promise<CatalogDocument> {
    const { repositories, warnings } = await this.discoverRepositories()
    const entries: CatalogEntry[] = []
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
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      entries: [...this.rejectPackageConflicts(entries)].sort((left, right) => left.id.localeCompare(right.id)),
      warnings,
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
      url.searchParams.set('q', `topic:${this.githubTopic} archived:false fork:false`)
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
    const catalog = objectValue(objectValue(root)?.dsh)?.catalog
    let paths: readonly string[] | undefined
    try {
      paths = catalog === undefined ? undefined : dshCatalogRootSchema.parse(catalog).packages
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-invalid')
      return [await this.admitUnverified(repository, '.', rootUrl, root, issue.code, issue.message, fullName)]
    }
    const manifests = paths === undefined
      ? [{ label: '.', path: 'package.json', url: rootUrl, raw: root }]
      : paths.map(path => ({
          label: path,
          path: `${path.replace(/\/$/, '')}/package.json`,
          url: `${this.rawGithubUrl}/${fullName}/${sha}/${path}/package.json`,
          raw: undefined,
        }))
    const entries: CatalogEntry[] = []
    for (const batch of batches(manifests, this.repositoryBatchSize)) {
      await Promise.all(batch.map(async item => {
        let raw = item.raw
        if (raw === undefined) {
          try {
            raw = await this.readGithubJson(fullName, sha, item.path, item.url)
          } catch (error) {
            const issue = this.candidateIssue(error, 'manifest-unavailable')
            entries.push(this.packageEntry(repository, item.label, item.url, undefined, issue.code, issue.message))
            return
          }
        }
        entries.push(await this.validateManifest(repository, item.label, item.url, raw, fullName))
      }))
    }
    return entries
  }

  private async validateManifest(
    repository: GithubRepository, label: string, manifestUrl: string, raw: unknown, fullName: string,
  ): Promise<CatalogEntry> {
    try {
      const manifest = packageManifestSchema.parse(raw)
      const plugin = catalogPluginFromManifest(manifest, manifestUrl)
      const expected = canonicalGithubRepository(`https://github.com/${fullName}`)
      if (plugin.repositoryUrl !== expected) {
        throw new CandidateValidationError('repository-mismatch', `${manifest.name} repository does not match ${fullName}`)
      }
      await this.verifyNpmReference(plugin.packageName, plugin.version, plugin.repositoryUrl, true)
      return {
        id: `${fullName}:${label}`,
        repositoryFullName: fullName,
        repositoryUrl: repository.html_url,
        packageName: plugin.packageName,
        version: plugin.version,
        displayName: plugin.displayName,
        summary: plugin.summary,
        category: plugin.category,
        keywords: plugin.keywords,
        license: plugin.license,
        repositoryDirectory: plugin.repositoryDirectory,
        homepage: plugin.homepage,
        manifestUrl: plugin.manifestUrl,
        verification: 'verified',
        issueCode: null,
        issue: null,
        installable: true,
      }
    } catch (error) {
      const issue = this.candidateIssue(error, 'manifest-invalid')
      return await this.admitUnverified(repository, label, manifestUrl, raw, issue.code, issue.message, fullName)
    }
  }

  private async admitUnverified(
    repository: GithubRepository,
    label: string,
    manifestUrl: string,
    raw: unknown,
    issueCode: CatalogIssueCode,
    issue: string,
    fullName: string,
  ): Promise<CatalogEntry> {
    const entry = this.packageEntry(repository, label, manifestUrl, raw, issueCode, issue)
    if (issueCode !== 'manifest-invalid') return entry
    const reference = npmReference(raw)
    const expectedRepository = canonicalGithubRepository(`https://github.com/${fullName}`)
    if (reference === undefined || expectedRepository === null) return entry
    try {
      await this.verifyNpmReference(reference.packageName, reference.version, expectedRepository)
      return {
        ...entry,
        packageName: reference.packageName,
        version: reference.version,
        verification: 'unverified',
        installable: true,
      }
    } catch (error) {
      const npmIssue = this.candidateIssue(error, 'package-invalid')
      return { ...entry, issueCode: npmIssue.code, issue: npmIssue.message }
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
    const dsh = objectValue(manifest?.dsh)
    const plugin = objectValue(dsh?.plugin)
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
      displayName: localizedValue(plugin?.displayName, fallbackName, 120),
      summary: localizedValue(plugin?.summary, description, 360),
      category: typeof plugin?.category === 'string' && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(plugin.category)
        && plugin.category.length <= 64 ? plugin.category : null,
      keywords,
      license: typeof manifest?.license === 'string' && manifest.license.trim() !== ''
        ? manifest.license : repository.license?.spdx_id ?? null,
      repositoryDirectory: null,
      homepage: optionalUrl(manifest?.homepage),
      manifestUrl,
      verification: 'rejected',
      issueCode,
      issue,
      installable: false,
    }
  }

  private async verifyNpmReference(
    packageName: string, version: string, expectedRepository: string, requireBundle = false,
  ): Promise<void> {
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
    if (requireBundle && published.dsh?.bundle.patch === undefined) {
      throw new CandidateValidationError('package-invalid', `${packageName}@${version} npm metadata does not declare dsh.bundle.patch`)
    }
    const repository = typeof published.repository === 'string' ? published.repository : published.repository.url
    if (canonicalGithubRepository(repository) !== expectedRepository) {
      throw new CandidateValidationError('repository-mismatch', `${packageName}@${version} npm repository does not match its discovery repository`)
    }
  }

  private rejectPackageConflicts(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
    const targets = new Map<string, CatalogEntry[]>()
    for (const entry of entries) {
      if (!entry.installable || entry.packageName === null) continue
      const values = targets.get(entry.packageName) ?? []
      values.push(entry)
      targets.set(entry.packageName, values)
    }
    const conflicts = new Set([...targets].filter(([, values]) => values.length > 1).map(([name]) => name))
    return entries.map(entry => {
      if (entry.packageName === null || !conflicts.has(entry.packageName)) return entry
      return {
        ...entry,
        verification: 'rejected',
        issueCode: 'package-conflict',
        issue: `Multiple catalog entries claim npm package ${entry.packageName}.`,
        installable: false,
      }
    })
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
