import { AlertTriangle, Ban, Check, Download, ExternalLink, Github, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { CandidateIssueCode, InstallReceipt, MarketplaceCandidate, MarketplacePlugin, MarketplaceSnapshot } from '../types.js'
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

type StatusFilter = 'all' | 'installable' | 'candidate'

const statusFilterPolicy: PersistPolicy<StatusFilter> = {
  key: 'dsh-plugin-marketplace.marketplace.global.status_filter.v1',
  kind: 'normal',
  defaultValue: 'all',
  deserializer: raw => {
    const value = JSON.parse(raw) as unknown
    return value === 'installable' || value === 'candidate' ? value : 'all'
  },
}

type MarketplaceEntry =
  | { readonly id: string, readonly kind: 'plugin', readonly value: MarketplacePlugin }
  | { readonly id: string, readonly kind: 'candidate', readonly value: MarketplaceCandidate }

const issueLocaleKey: Record<CandidateIssueCode, LocaleKey> = {
  'repository-unavailable': 'issueRepositoryUnavailable',
  'manifest-unavailable': 'issueManifestUnavailable',
  'manifest-invalid': 'issueManifestInvalid',
  'package-unpublished': 'issuePackageUnpublished',
  'package-invalid': 'issuePackageInvalid',
  'repository-mismatch': 'issueRepositoryMismatch',
}

export interface PluginMarketplaceTabApi {
  readonly list: (refresh: boolean) => Promise<MarketplaceSnapshot>
  readonly searchGithub: (query: string) => Promise<MarketplaceSnapshot>
  readonly install: (packageName: string, version: string) => Promise<InstallReceipt>
}

export interface PluginMarketplaceTabProps extends PluginMarketplaceTabApi {
  readonly t: (key: LocaleKey) => string
  readonly locale: string
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: MarketplaceSnapshot }

/** Compact discovery, detail, and exact-version install surface. */
export function PluginMarketplaceTab({ list, searchGithub, install, t, locale }: PluginMarketplaceTabProps): ReactNode {
  const [query, setQuery] = usePersistedState(queryPolicy)
  const [statusFilter, setStatusFilter] = usePersistedState(statusFilterPolicy)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<MarketplacePlugin | MarketplaceCandidate | null>(null)
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

  const entries = useMemo<readonly MarketplaceEntry[]>(() => {
    if (state.status !== 'ready') return []
    return [
      ...state.snapshot.plugins.map(plugin => ({ id: `plugin:${plugin.packageName}`, kind: 'plugin' as const, value: plugin })),
      ...state.snapshot.candidates.map(candidate => ({ id: `candidate:${candidate.id}`, kind: 'candidate' as const, value: candidate })),
    ]
  }, [state])
  const visibleEntries = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return entries.filter(entry => {
      if (statusFilter === 'installable' && entry.kind !== 'plugin') return false
      if (statusFilter === 'candidate' && entry.kind !== 'candidate') return false
      if (value === '') return true
      const searchable = entry.kind === 'plugin'
        ? [entry.value.packageName, entry.value.displayName['zh-CN'], entry.value.displayName.en, entry.value.summary['zh-CN'], entry.value.summary.en, entry.value.category, ...entry.value.keywords]
        : [entry.value.repositoryFullName, entry.value.packageName ?? '', entry.value.displayName['zh-CN'], entry.value.displayName.en, entry.value.summary['zh-CN'], entry.value.summary.en, entry.value.issue]
      return searchable.some(item => item.toLocaleLowerCase().includes(value))
    })
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

  const submitSearch = (event: FormEvent): void => {
    event.preventDefault()
    void runLoad(() => searchGithub(query.trim()))
  }

  const confirmInstall = async (): Promise<void> => {
    if (confirming === null) return
    if (confirming.packageName === null || confirming.version === null) {
      setFeedback({ kind: 'error', message: t('notInstallable') })
      return
    }
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

  return <section className={css.marketplace}>
    <header className={css.header}>
      <div><h3>{t('title')}</h3>{state.status === 'ready' ? <p>{t('profile')}: <code>{state.snapshot.profileName}</code></p> : null}</div>
      <button className={css.iconButton} type="button" title={t('refresh')} aria-label={t('refresh')} onClick={() => { void runLoad(() => list(true)) }}><RefreshCw size={16} /></button>
    </header>

    <form className={css.searchBar} onSubmit={submitSearch}>
      <label><Search size={16} aria-hidden="true" /><span className={css.srOnly}>{t('search')}</span><input type="search" value={query} maxLength={80} placeholder={t('search')} onChange={event => setQuery(event.target.value)} /></label>
      <button type="submit"><Github size={16} />{t('searchGithub')}</button>
    </form>

    {state.status === 'ready' ? <div className={css.filters} role="group" aria-label={t('status')}>
      {([
        ['all', t('filterAll'), entries.length],
        ['installable', t('filterInstallable'), state.snapshot.plugins.length],
        ['candidate', t('filterCandidates'), state.snapshot.candidates.length],
      ] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}><span>{label}</span><small>{count}</small></button>)}
    </div> : null}

    {state.status === 'loading' ? <p className={css.message}>{t('loading')}</p> : null}
    {state.status === 'error' ? <div className={css.error} role="alert"><span>{t('loadFailed')} {state.message}</span><button type="button" onClick={() => { setState({ status: 'loading' }); void list(true).then(adopt, error => setState({ status: 'error', message: String(error) })) }}>{t('retry')}</button></div> : null}
    {state.status === 'ready' && (state.snapshot.stale || state.snapshot.warnings.length > 0) ? <div className={css.warning} role="status"><AlertTriangle size={16} /><div><strong>{state.snapshot.stale ? t('stale') : t('warningTitle')}</strong>{state.snapshot.warnings.map(item => <span key={`${item.source}:${item.code}:${item.message}`}>{item.message}</span>)}</div></div> : null}
    {feedback !== null ? <div className={css.feedback} data-kind={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{feedback.message}</span></div> : null}

    {state.status === 'ready' ? <div className={css.workspace}>
      <div className={css.listPane} role="list" aria-label={t('title')}>
        {visibleEntries.length === 0 ? <p className={css.empty}>{query.trim() === '' ? t('empty') : t('emptySearch')}</p> : visibleEntries.map(entry => {
          const item = entry.value
          return <button type="button" role="listitem" key={entry.id} className={css.pluginRow} data-selected={entry.id === selected || undefined}
            data-kind={entry.kind} onClick={() => { setSelected(entry.id); setFeedback(null) }}>
            <span className={css.rowMain}><strong>{item.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</strong><code>{entry.kind === 'plugin' ? entry.value.packageName : entry.value.packageName ?? entry.value.repositoryFullName}</code></span>
            <span className={css.rowMeta}><small>{entry.value.version ?? t('unknown')}</small>{entry.kind === 'plugin'
              ? entry.value.installedVersion !== null ? <small data-installed="true">{t('installed')}</small> : null
              : entry.value.installedVersion !== null ? <small data-installed="true">{t('installed')}</small>
                : <small data-candidate="true">{entry.value.installable ? t('candidateInstallable') : t('candidateStatus')}</small>}</span>
          </button>
        })}
      </div>

      <div className={css.detailPane}>
        {active === null ? <p className={css.empty}>{t('selectPlugin')}</p> : active.kind === 'plugin' ? <>
          <div className={css.detailTitle}><div><h4>{active.value.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</h4><code>{active.value.packageName}</code></div>
            <button className={css.installButton} type="button" disabled={active.value.installedVersion !== null || installing} onClick={() => setConfirming(active.value)}><Download size={16} />{active.value.installedVersion !== null ? t('installed') : t('install')}</button>
          </div>
          <p className={css.summary}>{active.value.summary[locale === 'zh-CN' ? 'zh-CN' : 'en']}</p>
          <dl className={css.facts}>
            <div><dt>{t('version')}</dt><dd>{active.value.version}</dd></div><div><dt>{t('license')}</dt><dd>{active.value.license}</dd></div><div><dt>{t('category')}</dt><dd>{active.value.category}</dd></div>
          </dl>
          <div className={css.sources}>{active.value.sources.map(source => <span key={source} data-source={source}>{source === 'catalog' ? t('catalogSource') : t('githubSource')}</span>)}</div>
          <div className={css.links}><a href={active.value.repositoryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('repository')}</a><a href={active.value.manifestUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('manifest')}</a></div>
        </> : <>
          <div className={css.detailTitle}><div><h4>{active.value.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</h4><code>{active.value.packageName ?? active.value.repositoryFullName}</code></div>
            <button className={css.installButton} data-unavailable={!active.value.installable || undefined} type="button"
              disabled={!active.value.installable || active.value.packageName === null || active.value.version === null || active.value.installedVersion !== null || installing}
              onClick={() => { if (active.value.installable && active.value.packageName !== null && active.value.version !== null) setConfirming(active.value) }}>
              {active.value.installable ? <Download size={16} /> : <Ban size={16} />}{active.value.installedVersion !== null ? t('installed') : active.value.installable ? t('install') : t('notInstallable')}
            </button>
          </div>
          <p className={css.summary}>{active.value.summary[locale === 'zh-CN' ? 'zh-CN' : 'en']}</p>
          <dl className={css.facts}>
            <div><dt>{t('version')}</dt><dd>{active.value.version ?? t('unknown')}</dd></div><div><dt>{t('status')}</dt><dd>{active.value.installedVersion !== null ? t('installed') : active.value.installable ? t('candidateInstallable') : t('candidateStatus')}</dd></div><div><dt>{t('repository')}</dt><dd>{active.value.repositoryFullName}</dd></div>
          </dl>
          <div className={css.admission}><AlertTriangle size={16} /><div><strong>{active.value.installable ? t('candidateInstallWarning') : `${t('admissionReason')}: ${t(issueLocaleKey[active.value.issueCode])}`}</strong><span>{active.value.issue}</span></div></div>
          <div className={css.sources}><span data-source="github-topic">{t('githubSource')}</span></div>
          <div className={css.links}><a href={active.value.repositoryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('repository')}</a>{active.value.manifestUrl === null ? null : <a href={active.value.manifestUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('manifest')}</a>}</div>
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
