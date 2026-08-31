import { posix } from 'node:path'
import { valid as validVersion } from 'semver'
import { z } from 'zod'

const npmName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

export const npmPackageNameSchema = z.string().regex(npmName)
export const exactVersionSchema = z.string().refine(value => validVersion(value) === value, 'version must be exact semver')

/** A repository child path is always relative and cannot escape its checkout. */
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

/**
 * Generic package metadata used to discover a candidate. This intentionally
 * does not define a marketplace-owned plugin manifest: installability is
 * established from the published npm artifact and repository ownership.
 */
export const packageManifestSchema = z.object({
  name: npmPackageNameSchema,
  version: exactVersionSchema,
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  license: z.string().trim().min(1).optional(),
  homepage: z.string().url().optional(),
  dsh: z.object({
    bundle: z.object({ patch: z.string().refine(isSafePackagePath, 'unsafe bundle patch') }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough()

export const catalogIssueCodeSchema = z.enum([
  'repository-unavailable',
  'manifest-unavailable',
  'manifest-invalid',
  'package-unpublished',
  'package-invalid',
  'repository-mismatch',
  'package-conflict',
])

export const catalogAvailabilitySchema = z.enum(['installable', 'unavailable'])
export const catalogCompatibilitySchema = z.enum(['declared', 'unverified'])

export const catalogEntrySchema = z.object({
  id: z.string().min(1),
  repositoryFullName: z.string().min(3),
  repositoryUrl: z.string().url(),
  packageName: npmPackageNameSchema.nullable(),
  version: exactVersionSchema.nullable(),
  displayName: localizedTextSchema,
  summary: z.object({ 'zh-CN': z.string().min(1).max(360), en: z.string().min(1).max(360) }).strict(),
  keywords: z.array(z.string()),
  license: z.string().min(1).nullable(),
  repositoryDirectory: z.string().refine(isSafePackagePath, 'unsafe repository directory').nullable(),
  homepage: z.string().url().nullable(),
  manifestUrl: z.string().url().nullable(),
  availability: catalogAvailabilitySchema,
  compatibility: catalogCompatibilitySchema,
  issueCode: catalogIssueCodeSchema.nullable(),
  issue: z.string().min(1).nullable(),
}).strict().superRefine((value, context) => {
  if (value.availability === 'installable') {
    if (value.packageName === null || value.version === null || value.manifestUrl === null
      || value.issueCode !== null || value.issue !== null) {
      context.addIssue({ code: 'custom', message: 'installable entries require an exact package target and no issue' })
    }
    return
  }
  if (value.issueCode === null || value.issue === null) {
    context.addIssue({ code: 'custom', message: 'unavailable entries require a reason' })
  }
})

export const catalogWarningSchema = z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()

export const catalogDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string().datetime(),
  entries: z.array(catalogEntrySchema),
  warnings: z.array(catalogWarningSchema),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>()
  const installTargets = new Set<string>()
  for (const entry of value.entries) {
    if (ids.has(entry.id)) context.addIssue({ code: 'custom', path: ['entries'], message: `duplicate entry ${entry.id}` })
    ids.add(entry.id)
    if (entry.availability !== 'installable' || entry.packageName === null || entry.version === null) continue
    const target = `${entry.packageName}@${entry.version}`
    if (installTargets.has(target)) {
      context.addIssue({ code: 'custom', path: ['entries'], message: `duplicate install target ${target}` })
    }
    installTargets.add(target)
  }
})

export type PackageManifest = z.infer<typeof packageManifestSchema>
export type CatalogEntry = z.infer<typeof catalogEntrySchema>
export type CatalogDocument = z.infer<typeof catalogDocumentSchema>

/** Normalize common npm/GitHub repository spellings to a stable HTTPS URL. */
export function canonicalGithubRepository(value: string): string | null {
  let source = value.trim().replace(/^git\+/, '').replace(/^github:/, 'https://github.com/')
  source = source.replace(/^git:\/\/github\.com\//, 'https://github.com/').replace(/^git@github\.com:/, 'https://github.com/')
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i.exec(source)
  if (match?.[1] === undefined || match[2] === undefined) return null
  return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}`
}
