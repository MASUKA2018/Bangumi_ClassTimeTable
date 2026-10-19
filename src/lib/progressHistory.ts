import type { Tracking } from '../types'
const KEY = 'btt:progress-history:v1'
const DAYS = 30 * 86400_000
let sequence = 0
export type ProgressSource = 'local' | 'cloud' | 'restore' | 'verified'
export interface ProgressChange { key: string; id: number; before: number; after: number; at: number; source: ProgressSource }
export function readProgressHistory(now = Date.now()): ProgressChange[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(rows) ? rows.filter(x => x && Number.isSafeInteger(x.id) && x.id > 0
      && Number.isSafeInteger(x.before) && x.before >= 0 && x.before <= 100000
      && Number.isSafeInteger(x.after) && x.after >= 0 && x.after <= 100000
      && typeof x.key === 'string' && ['local','cloud','restore','verified'].includes(x.source)
      && Number.isFinite(x.at) && x.at <= now && x.at > now - DAYS).slice(-2000) : []
  } catch { return [] }
}
export function recordProgressChanges(before: Tracking, after: Tracking, source: ProgressSource, now = Date.now()) {
  const rows = readProgressHistory(now)
  for (const key of new Set([...Object.keys(before.watched), ...Object.keys(after.watched)])) {
    const id = Number(key), a = before.watched[id] ?? 0, b = after.watched[id] ?? 0
    if (a === b || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(a) || !Number.isSafeInteger(b) || Math.min(a, b) < 0 || Math.max(a, b) > 100000) continue
    rows.push({ key: `${now}:${id}:${++sequence}:${rows.length}`, id, before: a, after: b, at: now, source })
  }
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-2000))); return true } catch { return false }
}
