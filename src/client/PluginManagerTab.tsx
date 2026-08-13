import { ChevronDown, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ManagedPluginEntry, MutationReceipt, PluginManagerSnapshot, PluginPhase } from '../types.js'
import type { LocaleKey } from './locales.js'
import css from './PluginManagerTab.module.css'

export interface PluginManagerTabApi {
  readonly list: () => Promise<PluginManagerSnapshot>
  readonly setEnabled: (entryId: string, enabled: boolean) => Promise<MutationReceipt>
  readonly setPackageEnabled: (packageName: string, enabled: boolean) => Promise<MutationReceipt>
}

export interface PluginManagerTabProps extends PluginManagerTabApi {
  readonly t: (key: LocaleKey) => string
}

type LoadState = { readonly status: 'loading' } | { readonly status: 'error'; readonly message: string } | { readonly status: 'ready'; readonly snapshot: PluginManagerSnapshot }
const phaseKeys: Record<Exclude<PluginPhase, null>, LocaleKey> = { pending: 'pending', loading: 'loadingPhase', active: 'active', failed: 'failed', unloading: 'unloading' }

function phaseLabel(entry: ManagedPluginEntry, t: PluginManagerTabProps['t']): string {
  if (!entry.enabled || entry.phase === null) return t('stopped')
  return t(phaseKeys[entry.phase])
}

/** Searchable package-grouped plugin management view. */
export function PluginManagerTab({ list, setEnabled, setPackageEnabled, t }: PluginManagerTabProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [failure, setFailure] = useState<ReadonlyMap<string, string>>(new Map())
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void list().then(snapshot => { if (current) setState({ status: 'ready', snapshot }) }, error => {
      if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { current = false }
  }, [list, request])

  const groups = useMemo(() => {
    if (state.status !== 'ready') return []
    const normalized = query.trim().toLocaleLowerCase()
    const map = new Map<string, ManagedPluginEntry[]>()
    for (const entry of state.snapshot.entries) {
      if (normalized && ![entry.packageName, entry.moduleName, entry.entryId].some(value => value.toLocaleLowerCase().includes(normalized))) continue
      const entries = map.get(entry.packageName) ?? []
      entries.push(entry)
      map.set(entry.packageName, entries)
    }
    return [...map.entries()]
  }, [query, state])

  const refresh = (): void => { setState({ status: 'loading' }); setRequest(value => value + 1) }
  const run = async (key: string, operation: () => Promise<MutationReceipt>): Promise<void> => {
    setBusy(current => new Set(current).add(key))
    setFailure(current => { const next = new Map(current); next.delete(key); return next })
    try {
      const receipt = await operation()
      setState({ status: 'ready', snapshot: receipt.snapshot })
      const message = receipt.items.filter(item => item.status === 'failed').map(item => item.message).filter(Boolean).join(' ')
      if (message) setFailure(current => new Map(current).set(key, message))
    } catch {
      setFailure(current => new Map(current).set(key, t('operationFailed')))
    } finally {
      setBusy(current => { const next = new Set(current); next.delete(key); return next })
    }
  }

  if (state.status === 'loading') return <p className={css.message}>{t('loading')}</p>
  if (state.status === 'error') return <div className={css.error} role="alert"><span>{t('error')} <small>{state.message}</small></span><button type="button" onClick={refresh}>{t('retry')}</button></div>

  return <section className={css.manager} aria-label={t('title')}>
    <header className={css.toolbar}>
      <div><h3>{t('title')}</h3><p>{t('profile')}: <code>{state.snapshot.profileName}</code></p></div>
      <button className={css.iconButton} type="button" aria-label={t('refresh')} title={t('refresh')} onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></button>
    </header>
    <label className={css.search}><Search size={16} aria-hidden="true" /><span className={css.srOnly}>{t('search')}</span><input type="search" value={query} placeholder={t('search')} onChange={event => { setQuery(event.currentTarget.value) }} /></label>
    {state.snapshot.entries.length === 0 ? <p className={css.message}>{t('empty')}</p> : null}
    {state.snapshot.entries.length > 0 && groups.length === 0 ? <p className={css.message}>{t('emptySearch')}</p> : null}
    <div className={css.groups}>{groups.map(([packageName, entries]) => {
      const isOpen = open.has(packageName)
      const mutable = entries.filter(entry => !entry.protected)
      const enabledCount = entries.filter(entry => entry.enabled).length
      const targetEnabled = mutable.some(entry => !entry.enabled)
      const key = `package:${packageName}`
      return <article className={css.group} key={packageName} data-open={isOpen || undefined}>
        <div className={css.groupHeader}>
          <button className={css.expand} type="button" aria-expanded={isOpen} onClick={() => { setOpen(current => { const next = new Set(current); next.has(packageName) ? next.delete(packageName) : next.add(packageName); return next }) }}>
            <ChevronDown size={16} aria-hidden="true" /><span><strong>{packageName}</strong><small>{enabledCount}/{entries.length} {t('enabledCount')}</small></span>
          </button>
          <Toggle checked={!targetEnabled} disabled={busy.has(key) || mutable.length === 0} label={targetEnabled ? t('enablePackage') : t('disablePackage')} onChange={() => { void run(key, () => setPackageEnabled(packageName, targetEnabled)) }} />
        </div>
        {failure.has(key) ? <p className={css.inlineError} role="alert">{failure.get(key)}</p> : null}
        {isOpen ? <ul className={css.entries}>{entries.map(entry => {
          const entryKey = `entry:${entry.entryId}`
          return <li key={entry.entryId}>
            <div className={css.entryText}><strong title={entry.moduleName}>{entry.moduleName}</strong><span data-phase={entry.phase ?? 'stopped'}>{phaseLabel(entry, t)}</span><code>{entry.entryId}</code>{entry.protected ? <small title={entry.protectionReason ?? undefined}>{t('protected')}</small> : null}</div>
            <Toggle checked={entry.enabled} disabled={entry.protected || busy.has(entryKey)} label={`${entry.moduleName}: ${entry.enabled ? t('disableEntry') : t('enableEntry')}`} onChange={() => { void run(entryKey, () => setEnabled(entry.entryId, !entry.enabled)) }} />
            {failure.has(entryKey) ? <p className={css.inlineError} role="alert">{failure.get(entryKey)}</p> : null}
          </li>
        })}</ul> : null}
      </article>
    })}</div>
  </section>
}

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: () => void }): ReactNode {
  return <label className={css.switch} title={label}><input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} /><span aria-hidden="true" /></label>
}
