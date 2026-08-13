/** Strict Typert Remote contribution shared by the Host registry and Web client. */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { MutationReceipt, PluginManagerSnapshot } from './types.js'

const phase = z.union([z.literal(null), z.literal('pending'), z.literal('loading'), z.literal('active'), z.literal('failed'), z.literal('unloading')])
const entry = z.object({
  entryId: z.string(), configId: z.string(), moduleName: z.string(), packageName: z.string(),
  category: z.string(),
  enabled: z.boolean(), phase,
  protected: z.boolean(), protectionReason: z.string().nullable(), error: z.string().nullable(),
}).readonly()
const snapshot = z.object({ profileName: z.string(), entries: z.array(entry).readonly() }).readonly()
const mutationItem = z.object({
  entryId: z.string(), status: z.union([z.literal('changed'), z.literal('restart-required'), z.literal('unchanged'), z.literal('skipped'), z.literal('failed')]), message: z.string().nullable(),
}).readonly()
const receipt = z.object({ enabled: z.boolean(), items: z.array(mutationItem).readonly(), snapshot }).readonly()

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({ name, wire: name, source: 'json' as const, codec: strict(`dsh-plugin-manager/types#${name}`, schema) })
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType) => ({
  id: `dsh-plugin-manager#pluginManager/${method}`,
  service: 'pluginManager', namespace: 'pluginManager', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-plugin-manager/types#${method === 'list' ? 'PluginManagerSnapshot' : 'MutationReceipt'}`, result),
})

const descriptors = [
  descriptor('list', [], snapshot),
  descriptor('setEnabled', [parameter('entryId', z.string()), parameter('enabled', z.boolean())], receipt),
  descriptor('setCategoryEnabled', [parameter('category', z.string()), parameter('enabled', z.boolean())], receipt),
  descriptor('setPackageEnabled', [parameter('packageName', z.string()), parameter('enabled', z.boolean())], receipt),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-plugin-manager', descriptors }

/** Host Typert artifact loaded from the package's `./typert` export. */
export const TYPERT = {
  package: 'dsh-plugin-manager', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'pluginManager/list': () => Promise<RemoteResult<PluginManagerSnapshot>>
    'pluginManager/setEnabled': (entryId: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    'pluginManager/setCategoryEnabled': (category: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    'pluginManager/setPackageEnabled': (packageName: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
  }
  interface TypertRemoteNamespaceMap {
    pluginManager: {
      list: () => Promise<RemoteResult<PluginManagerSnapshot>>
      setEnabled: (entryId: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
      setCategoryEnabled: (category: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
      setPackageEnabled: (packageName: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    }
  }
}

export default TYPERT_REMOTE
