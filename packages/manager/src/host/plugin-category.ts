import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import type { PluginCategory } from '../types.js'

const cache = new Map<string, PluginCategory>()
const GROUP_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u

interface PackageManifest {
  readonly name?: unknown
  readonly dsh?: unknown
  readonly repository?: unknown
}

interface DshManifest {
  readonly pluginManager?: unknown
}

interface PluginManagerManifest {
  readonly group?: unknown
}

interface RepositoryManifest {
  readonly url?: unknown
  readonly directory?: unknown
}

/** Resolve a declared functional group, then fall back to repository layout. */
export function pluginCategory(packageName: string, baseUrl: string): PluginCategory {
  if (packageName.startsWith('cordis:') || packageName.startsWith('@deepseek-ai/cordis-')) return 'cordis'
  const key = `${baseUrl}\0${packageName}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const category = discoverPackageGroup(packageName, baseUrl) ?? 'ungrouped'
  cache.set(key, category)
  return category
}

function discoverPackageGroup(packageName: string, baseUrl: string): string | undefined {
  try {
    const manifestPath = findPackageJSON(packageName, baseUrl)
    if (manifestPath === undefined) return
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
    if (manifest.name !== packageName) return
    const declared = declaredGroup(manifest.dsh)
    if (declared !== undefined) return declared
    if (!isRepository(manifest.repository)) return
    const repository = manifest.repository
    if (typeof repository.directory !== 'string') return
    const inferred = /^packages\/([^/]+)\//u.exec(repository.directory.replaceAll('\\', '/'))?.[1]
    return inferred !== undefined && GROUP_ID.test(inferred) ? inferred : undefined
  } catch {
    return
  }
}

function declaredGroup(value: unknown): string | undefined {
  if (!isDshManifest(value) || !isPluginManagerManifest(value.pluginManager)) return
  const group = value.pluginManager.group
  return typeof group === 'string' && GROUP_ID.test(group) ? group : undefined
}

function isRepository(value: unknown): value is RepositoryManifest {
  return typeof value === 'object' && value !== null
}

function isDshManifest(value: unknown): value is DshManifest {
  return typeof value === 'object' && value !== null
}

function isPluginManagerManifest(value: unknown): value is PluginManagerManifest {
  return typeof value === 'object' && value !== null
}
