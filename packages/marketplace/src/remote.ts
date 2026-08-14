import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { InstallReceipt, MarketplaceSnapshot } from './types.js'

const source = z.union([z.literal('catalog'), z.literal('github-topic')])
const localized = z.object({ 'zh-CN': z.string(), en: z.string() }).readonly()
const plugin = z.object({
  packageName: z.string(), version: z.string(), displayName: localized, summary: localized, category: z.string(),
  keywords: z.array(z.string()).readonly(), license: z.string(), repositoryUrl: z.string(), repositoryDirectory: z.string().nullable(),
  homepage: z.string().nullable(), manifestUrl: z.string(), sources: z.array(source).readonly(), installedVersion: z.string().nullable(),
}).readonly()
const warning = z.object({ source, code: z.string(), message: z.string() }).readonly()
const snapshot = z.object({
  profileName: z.string(), plugins: z.array(plugin).readonly(), warnings: z.array(warning).readonly(),
  stale: z.boolean(), fetchedAt: z.string(),
}).readonly()
const receipt = z.object({
  status: z.union([z.literal('installed'), z.literal('already-installed')]), profileName: z.string(), packageName: z.string(),
  version: z.string(), restartRequired: z.boolean(), message: z.string(),
}).readonly()
const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({
  name, wire: name, source: 'json' as const, codec: strict(`dsh-plugin-marketplace/types#${name}`, schema),
})
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, type: string) => ({
  id: `dsh-plugin-marketplace#marketplace/${method}`,
  service: 'marketplace', namespace: 'marketplace', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-plugin-marketplace/types#${type}`, result),
})
const descriptors = [
  descriptor('list', [parameter('refresh', z.boolean())], snapshot, 'MarketplaceSnapshot'),
  descriptor('searchGithub', [parameter('query', z.string())], snapshot, 'MarketplaceSnapshot'),
  descriptor('installPlugin', [parameter('packageName', z.string()), parameter('version', z.string())], receipt, 'InstallReceipt'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-plugin-marketplace', descriptors }
export const TYPERT = {
  package: 'dsh-plugin-marketplace', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'marketplace/list': (refresh: boolean) => Promise<RemoteResult<MarketplaceSnapshot>>
    'marketplace/searchGithub': (query: string) => Promise<RemoteResult<MarketplaceSnapshot>>
    'marketplace/installPlugin': (packageName: string, version: string) => Promise<RemoteResult<InstallReceipt>>
  }
  interface TypertRemoteNamespaceMap {
    marketplace: {
      list: (refresh: boolean) => Promise<RemoteResult<MarketplaceSnapshot>>
      searchGithub: (query: string) => Promise<RemoteResult<MarketplaceSnapshot>>
      installPlugin: (packageName: string, version: string) => Promise<RemoteResult<InstallReceipt>>
    }
  }
}

export default TYPERT_REMOTE
