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

export type CandidateIssueCode =
  | 'repository-unavailable'
  | 'manifest-unavailable'
  | 'manifest-invalid'
  | 'package-unpublished'
  | 'package-invalid'
  | 'repository-mismatch'

export interface MarketplaceCandidate {
  readonly id: string
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly packageName: string | null
  readonly version: string | null
  readonly displayName: LocalizedText
  readonly summary: LocalizedText
  readonly manifestUrl: string | null
  readonly issueCode: CandidateIssueCode
  readonly issue: string
  readonly installable: boolean
  readonly installedVersion: string | null
  readonly source: 'github-topic'
}

export interface DiscoveryWarning {
  readonly source: MarketplaceSource
  readonly code: string
  readonly message: string
}

export interface MarketplaceSnapshot {
  readonly profileName: string
  readonly plugins: readonly MarketplacePlugin[]
  readonly candidates: readonly MarketplaceCandidate[]
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
