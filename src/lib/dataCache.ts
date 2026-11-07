import type { Show } from '../types'
/** Public data only; never accounts, progress or sync queues. */
export function cachedData<T>(key: string): { at: number; value: T } | null {
  try {
    const item = JSON.parse(localStorage.getItem(`btt:data:${key}:v1`) ?? 'null')
    return item && Number.isFinite(item.at) && item.value ? item : null
  } catch { return null }
}
export function cacheData<T>(key: string, value: T): void {
  try { localStorage.setItem(`btt:data:${key}:v1`, JSON.stringify({ at: Date.now(), value })) } catch {}
}

/** Render public cached shows immediately while network refresh runs in the background. */
export function cachedShows(): Show[] | null {
  const value = cachedData<unknown>('live-shows')?.value
  if (!Array.isArray(value) || !value.length || value.length > 3000) return null
  return value.every(s => s && Number.isSafeInteger(s.id) && s.id > 0 && typeof s.nameJp === 'string'
    && Number.isFinite(s.periodDays) && s.periodDays >= 0 && Array.isArray(s.sites)) ? value : null
}
