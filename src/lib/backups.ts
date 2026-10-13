import type { AirFix, CollectMemo, Tracking, WatchStatus } from '../types'
import { DEFAULT_FILTERS, loadPersisted, normalizeSettings, type Persisted } from './store'
import { isDesktopNativeApp } from './native'

const LOCAL_KEY = 'btt:backups:v2'
const STATUSES: WatchStatus[] = ['wish', 'watching', 'paused', 'done', 'dropped']
export interface BackupFile { name: string; at: string; reason: 'daily' | 'restore'; payload?: string }
export interface BackupDocument { app: 'bangumi-timetable'; version: 2; exportedAt: string; data: Persisted }

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const idEntries = (value: unknown) => Object.entries(object(value)).filter(([key]) => /^[1-9]\d{0,9}$/.test(key))

/** Never serialize account tokens, API caches, sync queues or unknown imported keys. */
export function sanitizeBackup(input: unknown): Persisted {
  const doc = object(input)
  if (doc.app !== undefined && doc.app !== 'bangumi-timetable') throw new Error('不是有效的备份文件')
  if (doc.version !== undefined && ![1, 2].includes(Number(doc.version))) throw new Error('不支持此备份版本')
  const data = object(doc.data ?? input)
  if (!data.tracking || !data.settings || typeof data.tracking !== 'object' || typeof data.settings !== 'object' || Array.isArray(data.tracking) || Array.isArray(data.settings)) throw new Error('不是有效的备份文件')
  const rawTracking = object(data.tracking)
  const tracking: Tracking = { status: {}, watched: {}, rates: {}, memos: {} }
  for (const [id, status] of idEntries(rawTracking.status)) if (STATUSES.includes(status as WatchStatus)) tracking.status[Number(id)] = status as WatchStatus
  for (const [id, value] of idEntries(rawTracking.watched)) if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100000) tracking.watched[Number(id)] = Number(value)
  for (const [id, value] of idEntries(rawTracking.rates)) if (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10) tracking.rates[Number(id)] = Number(value)
  for (const [id, value] of idEntries(rawTracking.memos)) {
    const raw = object(value), memo: CollectMemo = {}
    if (Array.isArray(raw.tags)) memo.tags = raw.tags.filter((x): x is string => typeof x === 'string').slice(0, 50).map(x => x.slice(0, 100))
    if (typeof raw.comment === 'string') memo.comment = raw.comment.slice(0, 10000)
    if (typeof raw.private === 'boolean') memo.private = raw.private
    tracking.memos[Number(id)] = memo
  }
  const overrides: Record<number, AirFix> = {}
  for (const [id, value] of idEntries(data.overrides)) {
    const raw = object(value), fix: AirFix = {}
    for (const key of ['advanceEps', 'anchorEp', 'eps'] as const) if (Number.isInteger(raw[key]) && Number(raw[key]) >= 0 && Number(raw[key]) <= 100000) fix[key] = Number(raw[key])
    for (const key of ['advanceAt', 'anchorAt', 'note', 'source'] as const) if (typeof raw[key] === 'string') fix[key] = (raw[key] as string).slice(0, 5000)
    const dates = idEntries(raw.epDates).filter(([, at]) => typeof at === 'string' && Number.isFinite(Date.parse(at)))
    if (dates.length) fix.epDates = Object.fromEntries(dates) as Record<string, string>
    overrides[Number(id)] = fix
  }
  const filters = object(data.filters)
  const cont = Array.isArray(filters.cont) ? filters.cont.filter(x => ['new', 'carry', 'long'].includes(String(x))) : []
  const reg = Array.isArray(filters.reg) ? filters.reg.filter(x => ['jp', 'cn', 'other', 'unknown'].includes(String(x))) : []
  return { settings: normalizeSettings(data.settings), tracking, overrides, filters: {
    ...DEFAULT_FILTERS,
    cont: cont.length ? cont as Persisted['filters']['cont'] : [...DEFAULT_FILTERS.cont],
    reg: reg.length ? reg as Persisted['filters']['reg'] : [...DEFAULT_FILTERS.reg],
    repMin: typeof filters.repMin === 'number' && Number.isFinite(filters.repMin) ? Math.max(0, Math.min(10, filters.repMin)) : 0,
    src: typeof filters.src === 'string' ? filters.src.slice(0, 100) : null,
    tag: typeof filters.tag === 'string' ? filters.tag.slice(0, 100) : null,
  } }
}

export function backupDocument(data = loadPersisted()): BackupDocument {
  return { app: 'bangumi-timetable', version: 2, exportedAt: new Date().toISOString(), data: sanitizeBackup(data) }
}
export function parseBackup(text: string): Persisted {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error('备份文件超过 5 MB')
  return sanitizeBackup(JSON.parse(text.replace(/^\uFEFF/, '')))
}
export function mergeBackup(local: Persisted, incoming: Persisted): Persisted {
  const watched = { ...incoming.tracking.watched }
  for (const [id, value] of Object.entries(local.tracking.watched)) watched[Number(id)] = Math.max(value, watched[Number(id)] ?? 0)
  return sanitizeBackup({ ...local, overrides: { ...incoming.overrides, ...local.overrides }, tracking: {
    status: { ...incoming.tracking.status, ...local.tracking.status }, watched,
    rates: { ...incoming.tracking.rates, ...local.tracking.rates }, memos: { ...incoming.tracking.memos, ...local.tracking.memos },
  } })
}
export function backupDiff(local: Persisted, incoming: Persisted) {
  const ids = new Set([...Object.keys(local.tracking.status), ...Object.keys(incoming.tracking.status)])
  return { total: Object.keys(incoming.tracking.status).length,
    changed: [...ids].filter(id => local.tracking.status[Number(id)] !== incoming.tracking.status[Number(id)] || (local.tracking.watched[Number(id)] ?? 0) !== (incoming.tracking.watched[Number(id)] ?? 0)).length }
}
export async function listBackups(): Promise<BackupFile[]> {
  if (isDesktopNativeApp()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<BackupFile[]>('list_local_backups')
  }
  const saved: BackupFile[] = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')
  return saved.map(({ payload: _payload, ...item }) => item)
}
export async function readBackup(name: string): Promise<Persisted> {
  if (isDesktopNativeApp()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return parseBackup(await invoke<string>('read_local_backup', { name }))
  }
  const files: BackupFile[] = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')
  const file = files.find(x => x.name === name)
  if (!file?.payload) throw new Error('备份不存在')
  return parseBackup(file.payload)
}
export async function createBackup(data: Persisted, reason: 'daily' | 'restore' = 'daily'): Promise<void> {
  const payload = JSON.stringify(backupDocument(data))
  const at = new Date().toISOString()
  const date = new Date().toLocaleDateString('sv-SE')
  const name = reason === 'daily' ? `daily-${date}.json` : `restore-${Date.now()}.json`
  if (isDesktopNativeApp()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_local_backup', { name, payload })
    return
  }
  const files: BackupFile[] = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')
  const next = [{ name, at, reason, payload }, ...files.filter(x => x.name !== name)]
  const retained = [...next.filter(x => x.reason === 'daily').slice(0, 7), ...next.filter(x => x.reason === 'restore').slice(0, 3)].sort((a,b) => b.at.localeCompare(a.at))
  localStorage.setItem(LOCAL_KEY, JSON.stringify(retained))
}
