import { posix } from 'node:path'
import { valid as validVersion } from 'semver'
import { z } from 'zod'

const npmName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const category = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

export const npmPackageNameSchema = z.string().regex(npmName)

/** A catalog child path is always repository-relative and cannot escape its root. */
export function isSafePackagePath(value: string): boolean {
  if (value === '' || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false
  const candidate = value.startsWith('./') ? value.slice(2) : value
  const normalized = posix.normalize(candidate)
  return candidate !== '' && normalized === candidate && normalized !== '.'
    && !normalized.startsWith('../') && !normalized.includes('/../')
}

export const localizedTextSchema = z.object({
  'zh-CN': z.string().trim().min(1).max(120),
  en: z.string().trim().min(1).max(120),
}).strict()

export const dshPluginManifestSchema = z.object({
  schemaVersion: z.literal(1),
  displayName: localizedTextSchema,
  summary: z.object({
    'zh-CN': z.string().trim().min(1).max(360),
    en: z.string().trim().min(1).max(360),
  }).strict(),
  category: z.string().regex(category).max(64),
}).strict()

export const dshCatalogRootSchema = z.object({
  schemaVersion: z.literal(1),
  packages: z.array(z.string().refine(isSafePackagePath, 'unsafe package path')).min(1).max(32),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  for (const path of value.packages) {
    if (seen.has(path)) context.addIssue({ code: 'custom', path: ['packages'], message: `duplicate package path ${path}` })
    seen.add(path)
  }
})

const repositorySchema = z.union([
  z.string().trim().min(1),
  z.object({
    type: z.string().optional(),
    url: z.string().trim().min(1),
    directory: z.string().refine(isSafePackagePath, 'unsafe repository directory').optional(),
  }).passthrough(),
])

export const packageManifestSchema = z.object({
  name: npmPackageNameSchema,
  version: z.string().refine(value => validVersion(value) === value, 'version must be exact semver'),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  license: z.string().trim().min(1),
  homepage: z.string().url().optional(),
  repository: repositorySchema,
  dsh: z.object({
    plugin: dshPluginManifestSchema,
    bundle: z.object({ patch: z.string().refine(isSafePackagePath, 'unsafe bundle patch') }).passthrough(),
    catalog: dshCatalogRootSchema.optional(),
  }).passthrough(),
}).passthrough()

export const catalogPluginSchema = z.object({
  packageName: z.string().regex(npmName),
  version: z.string().refine(value => validVersion(value) === value, 'version must be exact semver'),
  displayName: localizedTextSchema,
  summary: z.object({ 'zh-CN': z.string().min(1).max(360), en: z.string().min(1).max(360) }).strict(),
  category: z.string().regex(category).max(64),
  keywords: z.array(z.string()),
  license: z.string().min(1),
  repositoryUrl: z.string().url(),
  repositoryDirectory: z.string().refine(isSafePackagePath, 'unsafe repository directory').nullable(),
  homepage: z.string().url().nullable(),
  manifestUrl: z.string().url(),
}).strict()

export const catalogDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  plugins: z.array(catalogPluginSchema),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  for (const plugin of value.plugins) {
    if (seen.has(plugin.packageName)) context.addIssue({ code: 'custom', path: ['plugins'], message: `duplicate package ${plugin.packageName}` })
    seen.add(plugin.packageName)
  }
})

export type PackageManifest = z.infer<typeof packageManifestSchema>
export type CatalogPlugin = z.infer<typeof catalogPluginSchema>
export type CatalogDocument = z.infer<typeof catalogDocumentSchema>

export function repositoryValue(manifest: PackageManifest): { url: string; directory: string | null } {
  if (typeof manifest.repository === 'string') return { url: manifest.repository, directory: null }
  return { url: manifest.repository.url, directory: manifest.repository.directory ?? null }
}

/** Normalize common npm/GitHub repository spellings to a stable HTTPS URL. */
export function canonicalGithubRepository(value: string): string | null {
  let source = value.trim().replace(/^git\+/, '').replace(/^github:/, 'https://github.com/')
  source = source.replace(/^git:\/\/github\.com\//, 'https://github.com/').replace(/^git@github\.com:/, 'https://github.com/')
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i.exec(source)
  if (match?.[1] === undefined || match[2] === undefined) return null
  return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}`
}

export function catalogPluginFromManifest(manifest: PackageManifest, manifestUrl: string): CatalogPlugin {
  const repository = repositoryValue(manifest)
  const repositoryUrl = canonicalGithubRepository(repository.url)
  if (repositoryUrl === null) throw new Error(`${manifest.name} must use a GitHub repository URL`)
  return catalogPluginSchema.parse({
    packageName: manifest.name,
    version: manifest.version,
    displayName: manifest.dsh.plugin.displayName,
    summary: manifest.dsh.plugin.summary,
    category: manifest.dsh.plugin.category,
    keywords: manifest.keywords ?? [],
    license: manifest.license,
    repositoryUrl,
    repositoryDirectory: repository.directory,
    homepage: manifest.homepage ?? null,
    manifestUrl,
  })
}
