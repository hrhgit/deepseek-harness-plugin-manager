export interface LocalizedText {
  readonly 'zh-CN': string
  readonly en: string
}

export type CatalogVerification = 'verified' | 'unverified' | 'rejected'

export type CatalogIssueCode =
  | 'repository-unavailable'
  | 'manifest-unavailable'
  | 'manifest-invalid'
  | 'package-unpublished'
  | 'package-invalid'
  | 'repository-mismatch'
  | 'package-conflict'

export interface MarketplaceEntry {
  readonly id: string
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly packageName: string | null
  readonly version: string | null
  readonly displayName: LocalizedText
  readonly summary: LocalizedText
  readonly category: string | null
  readonly keywords: readonly string[]
  readonly license: string | null
  readonly repositoryDirectory: string | null
  readonly homepage: string | null
  readonly manifestUrl: string | null
  readonly verification: CatalogVerification
  readonly issueCode: CatalogIssueCode | null
  readonly issue: string | null
  readonly installable: boolean
  readonly installedVersion: string | null
}

export interface DiscoveryWarning {
  readonly code: string
  readonly message: string
}

export interface MarketplaceSnapshot {
  readonly profileName: string
  readonly entries: readonly MarketplaceEntry[]
  readonly warnings: readonly DiscoveryWarning[]
  readonly stale: boolean
  readonly generatedAt: string | null
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
