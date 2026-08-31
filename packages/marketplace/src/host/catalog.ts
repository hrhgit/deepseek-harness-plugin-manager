import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { catalogDocumentSchema, type CatalogDocument, type CatalogEntry } from '../manifest.js'
import { compareCatalogEntries, type DiscoveryWarning, type MarketplaceSnapshot } from '../types.js'

// The GitHub API raw media type is reachable in environments where the raw
// content host does not have a configured Node proxy.
const DEFAULT_CATALOG_URL = 'https://api.github.com/repos/hrhgit/deepseek-harness-plugin-manager/contents/catalog/v2/catalog.json?ref=main'
const GITHUB_RAW_ACCEPT = 'application/vnd.github.raw+json'

const cacheSchema = z.object({
  schemaVersion: z.literal(2),
  etag: z.string().nullable(),
  fetchedAt: z.string().datetime(),
  document: catalogDocumentSchema,
}).strict()

export interface CatalogServiceConfig {
  readonly catalogUrl?: string
  readonly cacheFile: string
  readonly requestTimeoutMs?: number
}

export interface CatalogState {
  readonly entries: readonly CatalogEntry[]
  readonly warnings: readonly DiscoveryWarning[]
  readonly stale: boolean
  readonly generatedAt: string | null
  readonly fetchedAt: string
}

type Fetcher = typeof fetch

/** Runtime boundary for one generated marketplace catalog plus a last-known-good cache. */
export class CatalogService {
  private readonly catalogUrl: string
  private readonly cacheFile: string
  private readonly timeoutMs: number
  private readonly fetcher: Fetcher
  private etag: string | null = null
  private document: CatalogDocument | undefined
  private state: CatalogState | undefined
  private cacheLoaded = false

  constructor(config: CatalogServiceConfig, fetcher: Fetcher = fetch) {
    this.catalogUrl = config.catalogUrl ?? DEFAULT_CATALOG_URL
    this.cacheFile = config.cacheFile
    this.timeoutMs = config.requestTimeoutMs ?? 10_000
    this.fetcher = fetcher
  }

  async list(refresh = false): Promise<CatalogState> {
    await this.loadCacheOnce()
    if (!refresh && this.state !== undefined) return this.state
    try {
      const headers: Record<string, string> = { accept: GITHUB_RAW_ACCEPT }
      if (this.etag !== null) headers['if-none-match'] = this.etag
      const response = await this.request(this.catalogUrl, { headers })
      if (response.status !== 304) {
        if (!response.ok) throw new Error(`catalog returned HTTP ${response.status}`)
        this.document = catalogDocumentSchema.parse(await response.json())
        this.etag = response.headers.get('etag')
      }
      if (this.document === undefined) throw new Error('catalog returned 304 without a cached document')
      const fetchedAt = new Date().toISOString()
      this.state = this.fromDocument(this.document, false, fetchedAt)
      await this.writeCache(this.document, fetchedAt)
      return this.state
    } catch (error) {
      const warning = this.warning('catalog-unavailable', error)
      if (this.document === undefined) {
        this.state = {
          entries: [], warnings: [warning], stale: false, generatedAt: null, fetchedAt: new Date().toISOString(),
        }
      } else {
        this.state = {
          ...this.fromDocument(this.document, true, new Date().toISOString()),
          warnings: [...this.document.warnings, warning],
        }
      }
      return this.state
    }
  }

  private fromDocument(document: CatalogDocument, stale: boolean, fetchedAt: string): CatalogState {
    return {
      entries: document.entries,
      warnings: document.warnings,
      stale,
      generatedAt: document.generatedAt,
      fetchedAt,
    }
  }

  private async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    return await this.fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'user-agent': 'dsh-plugin-marketplace/0.1', ...init.headers },
    })
  }

  private warning(code: string, error: unknown): DiscoveryWarning {
    return { code, message: error instanceof Error ? error.message : String(error) }
  }

  private async readCache(): Promise<z.infer<typeof cacheSchema> | undefined> {
    try {
      return cacheSchema.parse(JSON.parse(await readFile(this.cacheFile, 'utf8')))
    } catch {
      return undefined
    }
  }

  private async loadCacheOnce(): Promise<void> {
    if (this.cacheLoaded) return
    this.cacheLoaded = true
    const cached = await this.readCache()
    if (cached === undefined) return
    this.etag = cached.etag
    this.document = cached.document
  }

  private async writeCache(document: CatalogDocument, fetchedAt: string): Promise<void> {
    const temporary = join(dirname(this.cacheFile), `.${randomUUID()}.tmp`)
    try {
      await mkdir(dirname(this.cacheFile), { recursive: true })
      await writeFile(temporary, JSON.stringify({ schemaVersion: 2, etag: this.etag, fetchedAt, document }, undefined, 2) + '\n', 'utf8')
      await rename(temporary, this.cacheFile)
    } catch {
      // A read-only cache directory must not make the generated catalog unusable.
    }
  }
}

export function snapshotWithProfile(
  state: CatalogState, profileName: string, dependencies: Readonly<Record<string, string>>,
): MarketplaceSnapshot {
  return {
    profileName,
    entries: [...state.entries].sort(compareCatalogEntries).map(entry => ({
      ...entry,
      installedVersion: entry.packageName === null ? null : dependencies[entry.packageName] ?? null,
    })),
    warnings: state.warnings,
    stale: state.stale,
    generatedAt: state.generatedAt,
    fetchedAt: state.fetchedAt,
  }
}
