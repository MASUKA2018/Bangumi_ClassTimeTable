import type { Settings, Show, Tracking } from '../types'
import { displayName, t } from './i18n'
import { isNativeApp } from './native'
import { epTime, occurrencesBetween, type Occurrence } from './schedule'
import { DAY_MS, displayTz, lateNightRef, pad, partsInZone, startOfDayInstant } from './time'

const MAX_SYSTEM_LINES = 5

export type ReminderKind = 'watching' | 'other'
export type ReminderStatus = 'idle' | 'enabled' | 'sent' | 'denied' | 'unsupported' | 'failed'
export type NotificationAccess = 'granted' | 'denied' | 'unsupported'

export interface ReminderCardItem {
  id: number
  title: string
  cover?: string
  airTime: string
  episode: string
}

export interface RichReminderPayload {
  kind: ReminderKind
  heading: string
  emptyText: string
  theme: Settings['theme']
  lang: Settings['lang']
  items: ReminderCardItem[]
}

export interface ReminderMessage {
  title: string
  body: string
}

interface ReminderItem {
  show: Show
  occurrence?: Occurrence
}

export function parseReminderMinutes(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return 20 * 60
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function reminderConfig(settings: Settings, kind: ReminderKind): { enabled: boolean; time: string } {
  return kind === 'watching'
    ? { enabled: settings.watchingReminderEnabled, time: settings.watchingReminderTime }
    : { enabled: settings.otherReminderEnabled, time: settings.otherReminderTime }
}

/** 当前深夜日界下的课表日期,也是每一类提醒各自的去重键。 */
export function reminderDayKey(now: number, settings: Settings): string {
  const p = partsInZone(lateNightRef(now, settings), displayTz(settings))
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

/** 到点或错过时间后首次启动均会触发；同一类提醒每个课表日只发一次。 */
export function isDailyReminderDue(
  now: number,
  settings: Settings,
  kind: ReminderKind,
  lastDay: string | null,
): boolean {
  const config = reminderConfig(settings, kind)
  if (!config.enabled) return false
  const key = reminderDayKey(now, settings)
  if (lastDay === key) return false

  const p = partsInZone(now, displayTz(settings))
  let currentMinutes = p.hh * 60 + p.mm
  let targetMinutes = parseReminderMinutes(config.time)
  if (p.hh < settings.lateNightCutoff) currentMinutes += 24 * 60
  if (targetMinutes < settings.lateNightCutoff * 60) targetMinutes += 24 * 60
  return currentMinutes >= targetMinutes
}

function todayItems(shows: Show[], settings: Settings, now: number): ReminderItem[] {
  const tz = displayTz(settings)
  const dayBase = startOfDayInstant(lateNightRef(now, settings), tz)
  const lo = dayBase + settings.lateNightCutoff * 3600_000
  const hi = lo + DAY_MS - 1
  const items: ReminderItem[] = []

  for (const show of shows) {
    const occurrences = occurrencesBetween(show, lo, hi)
    for (const occurrence of occurrences) items.push({ show, occurrence })
  }

  // 无法推导精确时刻的条目仍按 Bangumi calendar 的日本星期归入当天。
  const targetWdJst = partsInZone(dayBase + 12 * 3600_000, 'Asia/Tokyo').wd
  for (const show of shows) {
    if (epTime(show, 1) === null && show.airWeekdayJst === targetWdJst) items.push({ show })
  }

  const uniqueByShow = new Map<number, ReminderItem>()
  for (const item of items) if (!uniqueByShow.has(item.show.id)) uniqueByShow.set(item.show.id, item)
  return [...uniqueByShow.values()].sort((a, b) => {
    const at = a.occurrence?.t ?? Number.POSITIVE_INFINITY
    const bt = b.occurrence?.t ?? Number.POSITIVE_INFINITY
    return at - bt || displayName(a.show).localeCompare(displayName(b.show))
  })
}

function episodeText(o: Occurrence | undefined): string {
  if (!o) return t('集数未定')
  return o.epEnd > o.ep ? t('更新至第 {a}-{b} 集', { a: o.ep, b: o.epEnd }) : t('更新至第 {n} 集', { n: o.ep })
}

function displayAirTime(at: number | undefined, settings: Settings): string {
  if (at === undefined) return t('时间未定')
  const p = partsInZone(at, displayTz(settings))
  const hour = p.hh < settings.lateNightCutoff ? p.hh + 24 : p.hh
  return `${pad(hour)}:${pad(p.mm)}`
}

export function buildRichReminderPayload(
  shows: Show[],
  tracking: Tracking,
  settings: Settings,
  now: number,
  kind: ReminderKind,
): RichReminderPayload {
  const matching = todayItems(shows, settings, now).filter(({ show }) =>
    kind === 'watching' ? tracking.status[show.id] === 'watching' : tracking.status[show.id] !== 'watching',
  )
  return {
    kind,
    heading: t(kind === 'watching' ? '今日在看更新' : '今日未在看番剧'),
    emptyText: t(kind === 'watching' ? '今天没有“在看”番剧更新。' : '今天没有其他番剧更新。'),
    theme: settings.theme,
    lang: settings.lang,
    items: matching.map(({ show, occurrence }) => ({
      id: show.id,
      title: displayName(show),
      cover: show.image,
      airTime: displayAirTime(occurrence?.t, settings),
      episode: episodeText(occurrence),
    })),
  }
}

export function richReminderToSystemMessage(payload: RichReminderPayload): ReminderMessage {
  if (!payload.items.length) return { title: payload.heading, body: payload.emptyText }
  const lines = payload.items.slice(0, MAX_SYSTEM_LINES).map((item) => `${item.airTime} · ${item.title} · ${item.episode}`)
  if (payload.items.length > MAX_SYSTEM_LINES) lines.push(t('另有 {n} 部', { n: payload.items.length - MAX_SYSTEM_LINES }))
  return { title: `${payload.heading} · ${t('{n} 部', { n: payload.items.length })}`, body: lines.join('\n') }
}

const reminderStorageKey = (kind: ReminderKind) => `btt:daily-reminder:${kind}:last-day:v2`

export function readLastReminderDay(kind: ReminderKind): string | null {
  try {
    return localStorage.getItem(reminderStorageKey(kind))
  } catch {
    return null
  }
}

export function markReminderDelivered(kind: ReminderKind, day: string): void {
  try {
    localStorage.setItem(reminderStorageKey(kind), day)
  } catch {}
}

export async function requestNotificationAccess(): Promise<NotificationAccess> {
  if (isNativeApp()) {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
    if (await isPermissionGranted()) return 'granted'
    return (await requestPermission()) === 'granted' ? 'granted' : 'denied'
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (window.Notification.permission === 'granted') return 'granted'
  return (await window.Notification.requestPermission()) === 'granted' ? 'granted' : 'denied'
}

export async function notificationPermissionGranted(): Promise<boolean> {
  if (isNativeApp()) {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification')
    return isPermissionGranted()
  }
  return typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted'
}

export async function sendSystemNotification(message: ReminderMessage): Promise<void> {
  if (isNativeApp()) {
    const { sendNotification } = await import('@tauri-apps/plugin-notification')
    await sendNotification(message)
    return
  }
  if (typeof window === 'undefined' || !('Notification' in window)) throw new Error('notifications unsupported')
  new window.Notification(message.title, { body: message.body })
}
