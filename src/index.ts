/** Host service for persistent DeepSeek Harness plugin enablement. */

import type { Context, FiberState } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { packageRoot } from './host/package-name.js'
import { profileLocation, writeDesiredState, type ProfileLocation } from './host/profile-patches.js'
import type {
  ManagedPluginEntry,
  MutationItem,
  MutationReceipt,
  PluginManagerSnapshot,
  PluginPhase,
} from './types.js'

export type * from './types.js'

const SELF_MODULE = 'dsh-plugin-manager'
const DEFAULT_PROTECTED_IDS = new Set([
  'api-gateway',
  'client-hmr',
  'client-modules',
  'client-runtime',
  'cordis-host-runner',
  'ui-settings',
  'ui-settings-general',
  'webserver',
])

const FIBER_PHASE: Record<number, PluginPhase> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

/** Plugin manager configuration. */
export interface Config {
  /** Additional local Loader entry ids that cannot be changed from the UI. */
  protectedEntries?: readonly string[]
  /** Maximum time to wait for the existing profile HMR watcher. */
  settleTimeoutMs?: number
}

/** Persistent plugin management Remote for a trusted Harness Web client. */
export class PluginManager extends TypertRemoteService {
  static inject = ['loader']

  private readonly protectedIds: ReadonlySet<string>
  private readonly location: ProfileLocation
  private readonly settleTimeoutMs: number
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginManager')
    this.protectedIds = new Set([...DEFAULT_PROTECTED_IDS, ...(config.protectedEntries ?? [])])
    this.settleTimeoutMs = config.settleTimeoutMs ?? 8_000
    const baseUrl = ctx.loader.ctx.baseUrl
    if (baseUrl === undefined) throw new Error('dsh-plugin-manager requires a file-backed Loader root')
    this.location = profileLocation(baseUrl)
  }

  /** Read the current Loader without maintaining a second lifecycle cache. */
  @Remote('list')
  list(): PluginManagerSnapshot {
    return {
      profileName: this.location.profileName,
      entries: [...this.ctx.loader.entries()]
        .filter(entry => !entry.options.group)
        .map(entry => this.project(entry)),
    }
  }

  /** Persist and apply one entry's desired enablement. */
  @Remote('setEnabled')
  async setEnabled(entryId: string, enabled: boolean): Promise<MutationReceipt> {
    return await this.serialize(async () => {
      const entry = this.ctx.loader.resolve(entryId)
      const projected = this.project(entry)
      const item = await this.change(projected, enabled)
      return { enabled, items: [item], snapshot: this.list() }
    })
  }

  /** Persist and apply all mutable entries from one package-like group. */
  @Remote('setPackageEnabled')
  async setPackageEnabled(packageName: string, enabled: boolean): Promise<MutationReceipt> {
    return await this.serialize(async () => {
      const targets = this.list().entries.filter(entry => entry.packageName === packageName)
      if (targets.length === 0) throw new Error(`unknown plugin package ${JSON.stringify(packageName)}`)
      const items: MutationItem[] = []
      for (const target of targets) items.push(await this.change(target, enabled))
      return { enabled, items, snapshot: this.list() }
    })
  }

  private project(entry: Entry): ManagedPluginEntry {
    const self = packageRoot(entry.options.name) === SELF_MODULE
    const protectedById = this.protectedIds.has(entry.options.id)
    const protectionReason = self
      ? 'The plugin manager cannot disable itself.'
      : protectedById
        ? 'This entry is required by the Web management surface.'
        : null
    const fiber = entry.fiber as (Entry['fiber'] & { error?: unknown }) | undefined
    return {
      entryId: entry.id,
      configId: entry.options.id,
      moduleName: entry.options.name,
      packageName: packageRoot(entry.options.name),
      enabled: !entry.disabled,
      phase: fiber === undefined ? null : FIBER_PHASE[fiber.state] ?? null,
      protected: protectionReason !== null,
      protectionReason,
      error: fiber?.error === undefined ? null : String(fiber.error),
    }
  }

  private async change(entry: ManagedPluginEntry, enabled: boolean): Promise<MutationItem> {
    if (entry.protected) return { entryId: entry.entryId, status: 'skipped', message: entry.protectionReason }
    if (entry.enabled === enabled) return { entryId: entry.entryId, status: 'unchanged', message: null }
    if (this.hasAmbiguousConfigId(entry)) {
      return { entryId: entry.entryId, status: 'failed', message: `Config id ${entry.configId} is not unique in this Loader tree.` }
    }
    try {
      await writeDesiredState(this.location, entry.configId, entry.moduleName, enabled)
      await this.waitFor(entry.entryId, enabled)
      return { entryId: entry.entryId, status: 'changed', message: null }
    } catch (error) {
      return { entryId: entry.entryId, status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
  }

  private hasAmbiguousConfigId(target: ManagedPluginEntry): boolean {
    return this.list().entries.filter(entry => entry.configId === target.configId).length > 1
  }

  private async waitFor(entryId: string, enabled: boolean): Promise<void> {
    const deadline = Date.now() + this.settleTimeoutMs
    while (Date.now() < deadline) {
      const entry = this.ctx.loader.resolve(entryId)
      if (!entry.disabled === enabled && entry._initTask === undefined && entry._disposing === 0) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`Timed out waiting for ${entryId} to become ${enabled ? 'enabled' : 'disabled'}.`)
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail
    let release!: () => void
    this.mutationTail = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

export default PluginManager
