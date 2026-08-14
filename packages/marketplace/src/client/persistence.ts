import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

export type PersistFieldKind = 'normal' | 'sensitive' | 'transient'
export type PersistPolicy<T> = {
  key: string
  kind: PersistFieldKind
  scopeId?: string
  defaultValue: T
  serializer?: (value: T) => string
  deserializer?: (raw: string) => T
}

const memory = new Map<string, string>()

function storage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const key = '__dsh_marketplace_storage_probe__'
    window.localStorage.setItem(key, key)
    window.localStorage.removeItem(key)
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Failure-safe state persistence for non-sensitive marketplace preferences. */
export function usePersistedState<T>(policy: PersistPolicy<T>): [T, Dispatch<SetStateAction<T>>] {
  const serializer = useMemo(() => policy.serializer ?? JSON.stringify, [policy.serializer])
  const deserializer = useMemo(() => policy.deserializer ?? ((raw: string) => JSON.parse(raw) as T), [policy.deserializer])
  const key = policy.scopeId === undefined ? policy.key : policy.key.replace('{scopeId}', policy.scopeId)
  const [value, setValue] = useState<T>(() => {
    if (policy.kind !== 'normal') return policy.defaultValue
    const raw = storage()?.getItem(key) ?? memory.get(key)
    if (raw === undefined || raw === null) return policy.defaultValue
    try { return deserializer(raw) } catch { return policy.defaultValue }
  })
  useEffect(() => {
    if (policy.kind !== 'normal') return
    try {
      const raw = serializer(value)
      const local = storage()
      if (local === undefined) memory.set(key, raw)
      else local.setItem(key, raw)
    } catch {
      // Storage policy or quota failures do not disable marketplace search.
    }
  }, [key, policy.kind, serializer, value])
  return [value, setValue]
}
