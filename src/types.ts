/** Lifecycle phase of a Cordis Loader entry. */
export type PluginPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null

/** One managed non-group Loader entry. */
export interface ManagedPluginEntry {
  /** Stable runtime entry id, including nested group prefixes. */
  readonly entryId: string
  /** Local config row id written by profile patches. */
  readonly configId: string
  /** Exact module specifier imported by Cordis. */
  readonly moduleName: string
  /** Package-like root used for grouping in the Web UI. */
  readonly packageName: string
  /** Effective enablement, including disabled ancestors. */
  readonly enabled: boolean
  /** Current root Fiber phase, or null when no live Fiber exists. */
  readonly phase: PluginPhase
  /** Whether this entry may be changed through this manager. */
  readonly protected: boolean
  /** Human-readable reason for a protected entry. */
  readonly protectionReason: string | null
  /** Current lifecycle failure text when Cordis exposes one. */
  readonly error: string | null
}

/** Point-in-time authoritative plugin manager state. */
export interface PluginManagerSnapshot {
  /** Absolute profile name inferred from the running config root. */
  readonly profileName: string
  /** Current non-group entries in Loader order. */
  readonly entries: readonly ManagedPluginEntry[]
}

/** Outcome for one requested plugin entry. */
export interface MutationItem {
  /** Requested runtime entry id. */
  readonly entryId: string
  /** Mutation outcome. */
  readonly status: 'changed' | 'unchanged' | 'skipped' | 'failed'
  /** Failure or skip explanation, otherwise null. */
  readonly message: string | null
}

/** Completed single-entry or package-level mutation. */
export interface MutationReceipt {
  /** Requested target enablement. */
  readonly enabled: boolean
  /** Per-entry outcomes in Loader order. */
  readonly items: readonly MutationItem[]
  /** Fresh authoritative snapshot after the operation settles. */
  readonly snapshot: PluginManagerSnapshot
}
