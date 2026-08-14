export type MarketplaceSource = 'catalog' | 'github-topic'

export interface LocalizedText {
  readonly 'zh-CN': string
  readonly en: string
}

export interface MarketplacePlugin {
  readonly packageName: string
  readonly version: string
  readonly displayName: LocalizedText
  readonly summary: LocalizedText
  readonly category: string
  readonly keywords: readonly string[]
  readonly license: string
  readonly repositoryUrl: string
  readonly repositoryDirectory: string | null
  readonly homepage: string | null
  readonly manifestUrl: string
  readonly sources: readonly MarketplaceSource[]
  readonly installedVersion: string | null
}

export interface DiscoveryWarning {
  readonly source: MarketplaceSource
  readonly code: string
  readonly message: string
}

export interface MarketplaceSnapshot {
  readonly profileName: string
  readonly plugins: readonly MarketplacePlugin[]
  readonly warnings: readonly DiscoveryWarning[]
  readonly stale: boolean
  readonly fetchedAt: string
}

export interface InstallReceipt {
  readonly status: 'installed' | 'already-installed'
  readonly profileName: string
  readonly packageName: string
  readonly version: string
  readonly restartRequired: boolean
  readonly message: string
}
