import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { InstallReceipt, MarketplaceSnapshot } from './types.js'

const localized = z.object({ 'zh-CN': z.string(), en: z.string() }).readonly()
const issueCode = z.union([
  z.literal('repository-unavailable'), z.literal('manifest-unavailable'), z.literal('manifest-invalid'),
  z.literal('package-unpublished'), z.literal('package-invalid'), z.literal('repository-mismatch'), z.literal('package-conflict'),
])
const availability = z.union([z.literal('installable'), z.literal('unavailable')])
const compatibility = z.union([z.literal('declared'), z.literal('unverified')])
const entry = z.object({
  id: z.string(), repositoryFullName: z.string(), repositoryUrl: z.string(), packageName: z.string().nullable(), version: z.string().nullable(),
  displayName: localized, summary: localized, keywords: z.array(z.string()).readonly(), license: z.string().nullable(),
  repositoryDirectory: z.string().nullable(), homepage: z.string().nullable(), manifestUrl: z.string().nullable(), availability, compatibility,
  issueCode: issueCode.nullable(), issue: z.string().nullable(), installedVersion: z.string().nullable(),
}).readonly()
const warning = z.object({ code: z.string(), message: z.string() }).readonly()
const snapshot = z.object({
  profileName: z.string(), entries: z.array(entry).readonly(), warnings: z.array(warning).readonly(), stale: z.boolean(),
  generatedAt: z.string().nullable(), fetchedAt: z.string(),
}).readonly()
const receipt = z.object({
  status: z.union([z.literal('installed'), z.literal('already-installed')]), profileName: z.string(), packageName: z.string(),
  version: z.string(), restartRequired: z.boolean(), message: z.string(),
}).readonly()
const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`@ruihuahe/dsh-plugin-marketplace/types#${name}`, schema),
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `@ruihuahe/dsh-plugin-marketplace#marketplace/${method}`,
  service: 'marketplace', namespace: 'marketplace', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`@ruihuahe/dsh-plugin-marketplace/types#${type}`, result),
})
const descriptors = [
  descriptor('list', [parameter('refresh', z.boolean())], snapshot, 'MarketplaceSnapshot'),
  descriptor('installPlugin', [parameter('packageName', z.string()), parameter('version', z.string())], receipt, 'InstallReceipt'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: '@ruihuahe/dsh-plugin-marketplace', descriptors }
export const TYPERT = {
  package: '@ruihuahe/dsh-plugin-marketplace', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'marketplace/list': (refresh: boolean) => Promise<RemoteResult<MarketplaceSnapshot>>
    'marketplace/installPlugin': (packageName: string, version: string) => Promise<RemoteResult<InstallReceipt>>
  }
  interface TypertRemoteNamespaceMap {
    marketplace: {
      list: (refresh: boolean) => Promise<RemoteResult<MarketplaceSnapshot>>
      installPlugin: (packageName: string, version: string) => Promise<RemoteResult<InstallReceipt>>
    }
  }
}

export default TYPERT_REMOTE
