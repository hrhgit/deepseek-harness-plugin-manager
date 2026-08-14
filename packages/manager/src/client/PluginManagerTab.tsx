import { ChevronDown, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ManagedPluginEntry, MutationReceipt, PluginManagerSnapshot, PluginCategory, PluginPhase } from '../types.js'
import type { LocaleKey } from './locales.js'
import css from './PluginManagerTab.module.css'

export interface PluginManagerTabApi {
  readonly list: () => Promise<PluginManagerSnapshot>
  readonly setEnabled: (entryId: string, enabled: boolean) => Promise<MutationReceipt>
  readonly setCategoryEnabled: (category: string, enabled: boolean) => Promise<MutationReceipt>
  readonly setPackageEnabled: (packageName: string, enabled: boolean) => Promise<MutationReceipt>
}

export interface PluginManagerTabProps extends PluginManagerTabApi {
  readonly t: (key: LocaleKey) => string
}

type LoadState = { readonly status: 'loading' } | { readonly status: 'error'; readonly message: string } | { readonly status: 'ready'; readonly snapshot: PluginManagerSnapshot }
const phaseKeys: Record<Exclude<PluginPhase, null>, LocaleKey> = { pending: 'pending', loading: 'loadingPhase', active: 'active', failed: 'failed', unloading: 'unloading' }
const categoryKeys: Readonly<Partial<Record<PluginCategory, LocaleKey>>> = {
  cordis: 'categoryCordis', core: 'categoryCore', bundle: 'categoryBundle', boot: 'categoryBoot', session: 'categorySession',
  interaction: 'categoryInteraction', extensions: 'categoryExtensions', llm: 'categoryLlm', api: 'categoryApi', client: 'categoryClient',
  host: 'categoryHost', settings: 'categorySettings', tools: 'categoryTools', 'harness-other': 'categoryHarnessOther', community: 'categoryCommunity', ungrouped: 'categoryUngrouped',
}
const preferredCategoryOrder = ['cordis', 'core', 'bundle', 'boot', 'session', 'interaction', 'extensions', 'llm', 'api', 'client', 'host', 'settings', 'tools', 'harness-other', 'community', 'ungrouped']
type Feedback = { readonly severity: 'warning' | 'error'; readonly message: string }

function phaseLabel(entry: ManagedPluginEntry, t: PluginManagerTabProps['t']): string {
  if (!entry.enabled || entry.phase === null) return t('stopped')
  return t(phaseKeys[entry.phase])
}

/** Searchable plugin management view grouped by Harness category. */
export function PluginManagerTab({ list, setEnabled, setCategoryEnabled, t }: PluginManagerTabProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [feedback, setFeedback] = useState<ReadonlyMap<string, Feedback>>(new Map())
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void list().then(snapshot => { if (current) setState({ status: 'ready', snapshot }) }, error => {
      if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { current = false }
  }, [list, request])

  const sections = useMemo(() => {
    if (state.status !== 'ready') return []
    const normalized = query.trim().toLocaleLowerCase()
    const map = new Map<PluginCategory, ManagedPluginEntry[]>()
    for (const entry of state.snapshot.entries) {
      if (normalized && !entry.configId.toLocaleLowerCase().includes(normalized)) continue
      const entries = map.get(entry.category) ?? []
      entries.push(entry)
      map.set(entry.category, entries)
    }
    const categories = [...map.keys()].sort((left, right) => {
      const leftIndex = preferredCategoryOrder.indexOf(left)
      const rightIndex = preferredCategoryOrder.indexOf(right)
      if (leftIndex < 0 && rightIndex < 0) return left.localeCompare(right)
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    })
    return categories.flatMap(category => {
      const entries = map.get(category)
      return entries === undefined ? [] : [{ category, entries }]
    })
  }, [query, state])

  const refresh = (): void => { setState({ status: 'loading' }); setRequest(value => value + 1) }
  const run = async (key: string, operation: () => Promise<MutationReceipt>): Promise<void> => {
    setBusy(current => new Set(current).add(key))
    setFeedback(current => { const next = new Map(current); next.delete(key); return next })
    try {
      const receipt = await operation()
      setState({ status: 'ready', snapshot: receipt.snapshot })
      const failed = receipt.items.filter(item => item.status === 'failed').map(item => item.message).filter(Boolean).join(' ')
      const restart = receipt.items.filter(item => item.status === 'restart-required').map(item => item.message).filter(Boolean).join(' ')
      if (failed) setFeedback(current => new Map(current).set(key, { severity: 'error', message: failed }))
      else if (restart) setFeedback(current => new Map(current).set(key, { severity: 'warning', message: restart }))
    } catch {
      setFeedback(current => new Map(current).set(key, { severity: 'error', message: t('operationFailed') }))
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
    {state.snapshot.entries.length > 0 && sections.length === 0 ? <p className={css.message}>{t('emptySearch')}</p> : null}
    <div className={css.sections}>{sections.map(section => {
      const categoryKey = categoryKeys[section.category]
      const isOpen = query.trim() !== '' || open.has(section.category)
      const mutable = section.entries.filter(entry => !entry.protected)
      const mutableEnabled = mutable.filter(entry => entry.enabled).length
      const enabledCount = section.entries.filter(entry => entry.enabled).length
      const checked = mutableEnabled > 0
      const partial = enabledCount > 0 && enabledCount < section.entries.length
      const targetEnabled = mutableEnabled === 0
      const categoryBusyKey = `category:${section.category}`
      const categoryLabel = categoryKey === undefined ? section.category : t(categoryKey)
      return <section className={css.category} key={section.category} data-open={isOpen || undefined}>
      <header className={css.categoryHeader}>
        <button className={css.categoryExpand} type="button" aria-expanded={isOpen} onClick={() => { setOpen(current => { const next = new Set(current); next.has(section.category) ? next.delete(section.category) : next.add(section.category); return next }) }}>
          <ChevronDown size={16} aria-hidden="true" /><span><h4>{categoryLabel}</h4><small>{enabledCount}/{section.entries.length}</small></span>
        </button>
        <Toggle checked={checked} warning={partial} disabled={mutable.length === 0 || busy.has(categoryBusyKey)} label={`${categoryLabel}: ${targetEnabled ? t('enableCategory') : t('disableCategory')}`} onChange={() => { void run(categoryBusyKey, () => setCategoryEnabled(section.category, targetEnabled)) }} />
      </header>
      {feedback.has(categoryBusyKey) ? <FeedbackView feedback={feedback.get(categoryBusyKey)!} /> : null}
      {isOpen ? <ul className={css.entries}>{section.entries.map(entry => {
          const entryKey = `entry:${entry.entryId}`
          return <li key={entry.entryId}>
            <div className={css.entryText} title={entry.protectionReason ?? undefined}><strong>{entry.configId}</strong><span data-phase={entry.phase ?? 'stopped'}>{phaseLabel(entry, t)}</span></div>
            <Toggle checked={entry.enabled} disabled={entry.protected || busy.has(entryKey)} label={`${entry.configId}: ${entry.enabled ? t('disableEntry') : t('enableEntry')}`} onChange={() => { void run(entryKey, () => setEnabled(entry.entryId, !entry.enabled)) }} />
            {feedback.has(entryKey) ? <FeedbackView feedback={feedback.get(entryKey)!} /> : null}
          </li>
        })}</ul> : null}</section>
    })}</div>
  </section>
}

function FeedbackView({ feedback }: { feedback: Feedback }): ReactNode {
  return <p className={css.inlineFeedback} data-severity={feedback.severity} role={feedback.severity === 'error' ? 'alert' : 'status'}>{feedback.message}</p>
}

function Toggle({ checked, warning = false, disabled, label, onChange }: { checked: boolean; warning?: boolean; disabled: boolean; label: string; onChange: () => void }): ReactNode {
  return <label className={css.switch} data-warning={warning || undefined} title={label}><input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} /><span aria-hidden="true" /></label>
}
