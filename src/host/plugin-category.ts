import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import type { PluginCategory } from '../types.js'

const HARNESS_REPOSITORY = 'github.com/deepseek-ai/deepseek-harness'
const cache = new Map<string, PluginCategory>()

interface PackageManifest {
  readonly name?: unknown
  readonly repository?: unknown
}

interface RepositoryManifest {
  readonly url?: unknown
  readonly directory?: unknown
}

/** Discover a package's Harness workspace group from its installed manifest. */
export function pluginCategory(packageName: string, baseUrl: string): PluginCategory {
  if (packageName.startsWith('cordis:') || packageName.startsWith('@deepseek-ai/cordis-')) return 'cordis'
  if (!packageName.startsWith('@deepseek-ai/dsh-')) return 'community'
  const key = `${baseUrl}\0${packageName}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const category = discoverHarnessGroup(packageName, baseUrl) ?? 'harness-other'
  cache.set(key, category)
  return category
}

function discoverHarnessGroup(packageName: string, baseUrl: string): string | undefined {
  try {
    const manifestPath = findPackageJSON(packageName, baseUrl)
    if (manifestPath === undefined) return
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
    if (manifest.name !== packageName || !isRepository(manifest.repository)) return
    const repository = manifest.repository
    if (typeof repository.url !== 'string' || !repository.url.toLocaleLowerCase().includes(HARNESS_REPOSITORY)) return
    if (typeof repository.directory !== 'string') return
    return /^packages\/([^/]+)\//u.exec(repository.directory.replaceAll('\\', '/'))?.[1]
  } catch {
    return
  }
}

function isRepository(value: unknown): value is RepositoryManifest {
  return typeof value === 'object' && value !== null
}
