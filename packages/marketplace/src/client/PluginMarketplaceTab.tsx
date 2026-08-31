import { AlertTriangle, Ban, Check, Download, ExternalLink, Info, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { compareCatalogEntries, type CatalogAvailability, type CatalogCompatibility, type CatalogIssueCode, type InstallReceipt, type MarketplaceEntry, type MarketplaceSnapshot } from '../types.js'
import type { LocaleKey } from './locales.js'
import { usePersistedState, type PersistPolicy } from './persistence.js'
import css from './PluginMarketplaceTab.module.css'

const queryPolicy: PersistPolicy<string> = {
  key: 'dsh-plugin-marketplace.marketplace.global.query.v1',
  kind: 'normal',
  defaultValue: '',
  deserializer: raw => {
    const value = JSON.parse(raw) as unknown
    return typeof value === 'string' && value.length <= 80 ? value : ''
  },
}

type StatusFilter = 'all' | CatalogAvailability

const statusFilterPolicy: PersistPolicy<StatusFilter> = {
  key: 'dsh-plugin-marketplace.marketplace.global.status_filter.v3',
  kind: 'normal',
  defaultValue: 'all',
  deserializer: raw => {
    const value = JSON.parse(raw) as unknown
    return value === 'installable' || value === 'unavailable' ? value : 'all'
  },
}

const issueLocaleKey: Record<CatalogIssueCode, LocaleKey> = {
  'repository-unavailable': 'issueRepositoryUnavailable',
  'manifest-unavailable': 'issueManifestUnavailable',
  'manifest-invalid': 'issueManifestInvalid',
  'package-unpublished': 'issuePackageUnpublished',
  'package-invalid': 'issuePackageInvalid',
  'repository-mismatch': 'issueRepositoryMismatch',
  'package-conflict': 'issuePackageConflict',
}

const availabilityLocaleKey: Record<CatalogAvailability, LocaleKey> = {
  installable: 'installableStatus',
  unavailable: 'unavailableStatus',
}

const compatibilityLocaleKey: Record<CatalogCompatibility, LocaleKey> = {
  declared: 'compatibilityDeclared',
  unverified: 'compatibilityUnverified',
}

export interface PluginMarketplaceTabApi {
  readonly list: (refresh: boolean) => Promise<MarketplaceSnapshot>
  readonly install: (packageName: string, version: string) => Promise<InstallReceipt>
}

export interface PluginMarketplaceTabProps extends PluginMarketplaceTabApi {
  readonly t: (key: LocaleKey) => string
  readonly locale: string
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: MarketplaceSnapshot }

function isScanCoverageWarning(code: string): boolean {
  return code === 'github-results-truncated'
}

function localizeWarning(code: string, message: string, t: (key: LocaleKey) => string): string {
  const match = /^GitHub reports (\d+) topic repositories; this catalog scan inspected the newest (\d+)\.$/.exec(message)
  if (!isScanCoverageWarning(code) || match?.[1] === undefined || match[2] === undefined) return message
  return t('scanCoverageDescription').replace('{total}', match[1]).replace('{inspected}', match[2])
}

/** Compact generated-catalog browser and exact-version install surface. */
export function PluginMarketplaceTab({ list, install, t, locale }: PluginMarketplaceTabProps): ReactNode {
  const [query, setQuery] = usePersistedState(queryPolicy)
  const [statusFilter, setStatusFilter] = usePersistedState(statusFilterPolicy)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<MarketplaceEntry | null>(null)
  const [installing, setInstalling] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const adopt = (snapshot: MarketplaceSnapshot): void => {
    setState({ status: 'ready', snapshot })
  }

  useEffect(() => {
    let current = true
    void list(false).then(snapshot => { if (current) adopt(snapshot) }, error => {
      if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { current = false }
  }, [list])

  const entries = state.status === 'ready' ? state.snapshot.entries : []
  const visibleEntries = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return entries.filter(entry => {
      if (statusFilter !== 'all' && entry.availability !== statusFilter) return false
      if (value === '') return true
      const searchable = [
        entry.repositoryFullName,
        entry.packageName ?? '',
        entry.displayName['zh-CN'],
        entry.displayName.en,
        entry.summary['zh-CN'],
        entry.summary.en,
        entry.issue ?? '',
        ...entry.keywords,
      ]
      return searchable.some(item => item.toLocaleLowerCase().includes(value))
    }).sort(compareCatalogEntries)
  }, [entries, query, statusFilter])

  useEffect(() => {
    setSelected(current => current !== null && visibleEntries.some(entry => entry.id === current)
      ? current : visibleEntries[0]?.id ?? null)
  }, [visibleEntries])

  const active = visibleEntries.find(entry => entry.id === selected) ?? null

  const runLoad = async (operation: () => Promise<MarketplaceSnapshot>): Promise<void> => {
    setFeedback(null)
    try { adopt(await operation()) } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const confirmInstall = async (): Promise<void> => {
    if (confirming === null || confirming.packageName === null || confirming.version === null) return
    setInstalling(true)
    setFeedback(null)
    try {
      const receipt = await install(confirming.packageName, confirming.version)
      setFeedback({ kind: 'success', message: receipt.restartRequired ? t('restartRequired') : t('alreadyInstalled') })
      adopt(await list(false))
      setConfirming(null)
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setInstalling(false)
    }
  }

  const count = (availability: CatalogAvailability): number => entries.filter(entry => entry.availability === availability).length

  return <section className={css.marketplace}>
    <header className={css.header}>
      <div><h3>{t('title')}</h3>{state.status === 'ready' ? <p>{t('profile')}: <code>{state.snapshot.profileName}</code></p> : null}</div>
      <button className={css.iconButton} type="button" title={t('refresh')} aria-label={t('refresh')} onClick={() => { void runLoad(() => list(true)) }}><RefreshCw size={16} /></button>
    </header>

    <div className={css.searchBar}>
      <label><Search size={16} aria-hidden="true" /><span className={css.srOnly}>{t('search')}</span><input type="search" value={query} maxLength={80} placeholder={t('search')} onChange={event => setQuery(event.target.value)} /></label>
    </div>

    {state.status === 'ready' ? <div className={css.filters} role="group" aria-label={t('status')}>
      {([
        ['all', t('filterAll'), entries.length],
        ['installable', t('filterInstallable'), count('installable')],
        ['unavailable', t('filterUnavailable'), count('unavailable')],
      ] as const).map(([value, label, total]) => <button type="button" key={value} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}><span>{label}</span><small>{total}</small></button>)}
    </div> : null}

    {state.status === 'loading' ? <p className={css.message}>{t('loading')}</p> : null}
    {state.status === 'error' ? <div className={css.error} role="alert"><span>{t('loadFailed')} {state.message}</span><button type="button" onClick={() => { setState({ status: 'loading' }); void list(true).then(adopt, error => setState({ status: 'error', message: String(error) })) }}>{t('retry')}</button></div> : null}
    {state.status === 'ready' && (state.snapshot.stale || state.snapshot.warnings.length > 0) ? (() => {
      const coverageOnly = !state.snapshot.stale && state.snapshot.warnings.every(item => isScanCoverageWarning(item.code))
      const NoticeIcon = coverageOnly ? Info : AlertTriangle
      return <div className={coverageOnly ? css.coverage : css.warning} role="status"><NoticeIcon size={16} /><div>
        <strong>{state.snapshot.stale ? t('stale') : coverageOnly ? t('scanCoverageTitle') : t('warningTitle')}</strong>
        {state.snapshot.warnings.map(item => <span key={`${item.code}:${item.message}`}>{localizeWarning(item.code, item.message, t)}</span>)}
      </div></div>
    })() : null}
    {feedback !== null ? <div className={css.feedback} data-kind={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{feedback.message}</span></div> : null}

    {state.status === 'ready' ? <div className={css.workspace}>
      <div className={css.listPane} role="list" aria-label={t('title')}>
        {visibleEntries.length === 0 ? <p className={css.empty}>{query.trim() === '' ? t('empty') : t('emptySearch')}</p> : visibleEntries.map(entry => <button
          type="button"
          role="listitem"
          key={entry.id}
          className={css.pluginRow}
          data-selected={entry.id === selected || undefined}
          data-availability={entry.availability}
          onClick={() => { setSelected(entry.id); setFeedback(null) }}
        >
          <span className={css.rowMain}><strong>{entry.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</strong><code>{entry.packageName ?? entry.repositoryFullName}</code></span>
          <span className={css.rowMeta}><small>{entry.version ?? t('unknown')}</small>{entry.installedVersion !== null
            ? <small data-installed="true">{t('installed')}</small>
            : <small data-availability={entry.availability}>{t(availabilityLocaleKey[entry.availability])}</small>}</span>
        </button>)}
      </div>

      <div className={css.detailPane}>
        {active === null ? <p className={css.empty}>{t('selectPlugin')}</p> : <>
          <div className={css.detailTitle}><div><h4>{active.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</h4><code>{active.packageName ?? active.repositoryFullName}</code></div>
            <button className={css.installButton} data-unavailable={active.availability !== 'installable' || undefined} type="button"
              disabled={active.availability !== 'installable' || active.packageName === null || active.version === null || active.installedVersion !== null || installing}
              onClick={() => { if (active.availability === 'installable' && active.packageName !== null && active.version !== null) setConfirming(active) }}>
              {active.availability === 'installable' ? <Download size={16} /> : <Ban size={16} />}{active.installedVersion !== null ? t('installed') : active.availability === 'installable' ? t('install') : t('notInstallable')}
            </button>
          </div>
          <p className={css.summary}>{active.summary[locale === 'zh-CN' ? 'zh-CN' : 'en']}</p>
          <dl className={css.facts}>
            <div><dt>{t('version')}</dt><dd>{active.version ?? t('unknown')}</dd></div>
            <div><dt>{t('status')}</dt><dd>{active.installedVersion !== null ? t('installed') : t(availabilityLocaleKey[active.availability])}</dd></div>
            <div><dt>{t('compatibility')}</dt><dd>{t(compatibilityLocaleKey[active.compatibility])}</dd></div>
            <div><dt>{t('license')}</dt><dd>{active.license ?? t('unknown')}</dd></div>
          </dl>
          {active.availability === 'installable' ? active.compatibility === 'declared' ? null : <div className={css.admission}><AlertTriangle size={16} /><div>
            <strong>{t('unverifiedCompatibilityWarning')}</strong>
          </div></div> : <div className={css.admission}><AlertTriangle size={16} /><div>
            <strong>{`${t('rejectionReason')}: ${active.issueCode === null ? t('unknown') : t(issueLocaleKey[active.issueCode])}`}</strong>
            {active.issue === null ? null : <span>{active.issue}</span>}
          </div></div>}
          <div className={css.links}><a href={active.repositoryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('repository')}</a>{active.manifestUrl === null ? null : <a href={active.manifestUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('manifest')}</a>}</div>
        </>}
      </div>
    </div> : null}

    {confirming !== null ? <div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !installing) setConfirming(null) }}>
      <section className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="marketplace-confirm-title">
        <header><h4 id="marketplace-confirm-title">{t('confirmTitle')}</h4><button type="button" disabled={installing} title={t('cancel')} aria-label={t('cancel')} onClick={() => setConfirming(null)}><X size={16} /></button></header>
        <p className={css.confirmPackage}><strong>{confirming.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</strong><code>{confirming.packageName}@{confirming.version}</code></p>
        <p className={css.security}><AlertTriangle size={17} />{t('installWarning')}</p>
        <footer><button type="button" disabled={installing} onClick={() => setConfirming(null)}>{t('cancel')}</button><button type="button" disabled={installing} onClick={() => { void confirmInstall() }}><Download size={16} />{installing ? t('installing') : t('confirmInstall')}</button></footer>
      </section>
    </div> : null}
  </section>
}
