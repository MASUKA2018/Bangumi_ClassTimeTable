import type { Settings, Show, Tracking } from '../types'
import { buildRichReminderPayload } from './notifications'
import { airedEps } from './progress'
export function trayWatchRows(shows: Show[], tracking: Tracking, settings: Settings, now: number) {
  // Reminder muting is not a watch-list filter.
  return buildRichReminderPayload(shows, tracking, { ...settings, showReminders: {} }, now, 'watching').items.slice(0, 10).map(item => ({
    id: item.id, title: item.title.slice(0, 150), watched: tracking.watched[item.id] ?? 0,
    aired: airedEps(shows.find(x => x.id === item.id)!, now) ?? null, air_time: item.airTime,
  }))
}
export function trayAdvance(id: number, expected: number, shows: Show[], tracking: Tracking, now: number): number | null {
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(expected)) return null
  const show = shows.find(x => x.id === id)
  const current = tracking.watched[id] ?? 0
  return show && tracking.status[id] === 'watching' && current === expected && (airedEps(show, now) ?? 0) > current ? current + 1 : null
}
