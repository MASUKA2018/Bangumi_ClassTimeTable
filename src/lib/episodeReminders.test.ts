import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEpisodeReminders, buildRichReminderPayload, episodeReminderSent, markEpisodeReminders, removeSnooze, snoozeReminder, snoozedReminders } from './notifications'
import { DEFAULT_SETTINGS } from './store'
import { mockStorage } from './testStorage'
import type { Show, Tracking } from '../types'
const at = Date.parse('2026-10-12T11:00:00Z')
const show: Show = { id: 1, nameCn: '测试', nameJp: 'Test', periodDays: 7, begin: at, epsTotal: 12, sites: [], fromCalendar: true }
const tracking: Tracking = { status: { 1: 'watching' }, watched: {}, rates: {}, memos: {} }
const settings = { ...DEFAULT_SETTINGS, tzMode: 'jst' as const, episodeReminderEnabled: true, episodeReminderOffset: 10 }
beforeEach(() => mockStorage())
afterEach(() => vi.unstubAllGlobals())
describe('air-time and snoozed reminders', () => {
  it('fires ten minutes before air time, not earlier and not over five minutes late', () => {
    expect(buildEpisodeReminders([show], tracking, settings, at - 11 * 60000)).toHaveLength(0)
    expect(buildEpisodeReminders([show], tracking, settings, at - 10 * 60000)).toHaveLength(1)
    expect(buildEpisodeReminders([show], tracking, settings, at - 4 * 60000)).toHaveLength(0)
  })
  it('supports after-air offsets and excludes caught-up/paused shows', () => {
    const after = { ...settings, episodeReminderMode: 'after' as const }
    expect(buildEpisodeReminders([show], tracking, after, at + 10 * 60000)).toHaveLength(1)
    expect(buildEpisodeReminders([show], { ...tracking, status: { 1: 'paused' } }, after, at + 10 * 60000)).toHaveLength(0)
    expect(buildEpisodeReminders([show], { ...tracking, watched: { 1: 1 } }, after, at + 10 * 60000)).toHaveLength(0)
  })
  it('deduplicates a delivered episode across polling/restarts', () => {
    const [{ key }] = buildEpisodeReminders([show], tracking, settings, at - 10 * 60000)
    expect(episodeReminderSent(key)).toBe(false); markEpisodeReminders([key], at); expect(episodeReminderSent(key)).toBe(true)
  })
  it('filters other reminders by wish and always excludes paused/completed/dropped', () => {
    const shows = [1,2,3,4,5,6].map(id => ({ ...show, id }))
    const all = { ...tracking, status: { 1: 'watching', 2: 'paused', 3: 'done', 4: 'dropped', 5: 'wish' } as Tracking['status'] }
    expect(buildRichReminderPayload(shows, all, settings, at, 'other').items.map(x => x.id)).toEqual([5,6])
    expect(buildRichReminderPayload(shows, all, { ...settings, otherReminderScope: 'wish' }, at, 'other').items.map(x => x.id)).toEqual([5])
  })
  it('persists one snooze per show, ignores preview actions and removes delivered entries', () => {
    const payload = buildRichReminderPayload([show], tracking, settings, at, 'watching')
    snoozeReminder({ ...payload, preview: true }, 1, at); expect(snoozedReminders()).toHaveLength(0)
    snoozeReminder(payload, 1, at); snoozeReminder(payload, 1, at + 1)
    expect(snoozedReminders()).toHaveLength(1); expect(snoozedReminders()[0].due).toBe(at + 1 + 600000)
    removeSnooze(snoozedReminders()[0].key); expect(snoozedReminders()).toHaveLength(0)
  })
})
