import { AlertTriangle, Check, Download, ExternalLink, Github, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { InstallReceipt, MarketplacePlugin, MarketplaceSnapshot } from '../types.js'
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
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<MarketplacePlugin | null>(null)
  const [installing, setInstalling] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const adopt = (snapshot: MarketplaceSnapshot): void => {
    setState({ status: 'ready', snapshot })
    setSelected(current => current !== null && snapshot.plugins.some(plugin => plugin.packageName === current)
      ? current : snapshot.plugins[0]?.packageName ?? null)
  }

  useEffect(() => {
    let current = true
    void list(false).then(snapshot => { if (current) adopt(snapshot) }, error => {
      if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { current = false }
  }, [list])

  const plugins = useMemo(() => {
    if (state.status !== 'ready') return []
    const value = query.trim().toLocaleLowerCase()
    if (value === '') return state.snapshot.plugins
    return state.snapshot.plugins.filter(plugin => [
      plugin.packageName, plugin.displayName['zh-CN'], plugin.displayName.en, plugin.summary['zh-CN'], plugin.summary.en,
      plugin.category, ...plugin.keywords,
    ].some(item => item.toLocaleLowerCase().includes(value)))
  }, [query, state])
  const active = state.status === 'ready' ? state.snapshot.plugins.find(plugin => plugin.packageName === selected) ?? null : null

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

    {state.status === 'loading' ? <p className={css.message}>{t('loading')}</p> : null}
    {state.status === 'error' ? <div className={css.error} role="alert"><span>{t('loadFailed')} {state.message}</span><button type="button" onClick={() => { setState({ status: 'loading' }); void list(true).then(adopt, error => setState({ status: 'error', message: String(error) })) }}>{t('retry')}</button></div> : null}
    {state.status === 'ready' && (state.snapshot.stale || state.snapshot.warnings.length > 0) ? <div className={css.warning} role="status"><AlertTriangle size={16} /><div><strong>{state.snapshot.stale ? t('stale') : t('warningTitle')}</strong>{state.snapshot.warnings.map(item => <span key={`${item.source}:${item.code}:${item.message}`}>{item.message}</span>)}</div></div> : null}
    {feedback !== null ? <div className={css.feedback} data-kind={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{feedback.message}</span></div> : null}

    {state.status === 'ready' ? <div className={css.workspace}>
      <div className={css.listPane} role="list" aria-label={t('title')}>
        {plugins.length === 0 ? <p className={css.empty}>{query.trim() === '' ? t('empty') : t('emptySearch')}</p> : plugins.map(plugin => <button
          type="button" role="listitem" key={plugin.packageName} className={css.pluginRow} data-selected={plugin.packageName === selected || undefined}
          onClick={() => { setSelected(plugin.packageName); setFeedback(null) }}>
          <span className={css.rowMain}><strong>{plugin.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</strong><code>{plugin.packageName}</code></span>
          <span className={css.rowMeta}><small>{plugin.version}</small>{plugin.installedVersion !== null ? <small data-installed="true">{t('installed')}</small> : null}</span>
        </button>)}
      </div>

      <div className={css.detailPane}>
        {active === null ? <p className={css.empty}>{t('selectPlugin')}</p> : <>
          <div className={css.detailTitle}><div><h4>{active.displayName[locale === 'zh-CN' ? 'zh-CN' : 'en']}</h4><code>{active.packageName}</code></div>
            <button className={css.installButton} type="button" disabled={active.installedVersion !== null || installing} onClick={() => setConfirming(active)}><Download size={16} />{active.installedVersion !== null ? t('installed') : t('install')}</button>
          </div>
          <p className={css.summary}>{active.summary[locale === 'zh-CN' ? 'zh-CN' : 'en']}</p>
          <dl className={css.facts}>
            <div><dt>{t('version')}</dt><dd>{active.version}</dd></div><div><dt>{t('license')}</dt><dd>{active.license}</dd></div><div><dt>{t('category')}</dt><dd>{active.category}</dd></div>
          </dl>
          <div className={css.sources}>{active.sources.map(source => <span key={source} data-source={source}>{source === 'catalog' ? t('catalogSource') : t('githubSource')}</span>)}</div>
          <div className={css.links}><a href={active.repositoryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('repository')}</a><a href={active.manifestUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('manifest')}</a></div>
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
