import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockStorage } from './testStorage'
import { readProgressHistory, recordProgressChanges } from './progressHistory'
import { readDiagnostics, diagnosticReport, recordDiagnostic } from './diagnostics'
import { normalizeSettings, DEFAULT_SETTINGS } from './store'
import { buildEpisodeReminders, buildRichReminderPayload, isQuietTime, isDailyReminderDue } from './notifications'
import { trayAdvance, trayWatchRows } from './trayWatch'
import type { Show, Tracking } from '../types'
const at = Date.parse('2026-10-19T11:00:00Z')
const show: Show = { id: 1, nameCn: '测试', nameJp: 'Test', periodDays: 7, begin: at, epsTotal: 12, sites: [], fromCalendar: true }
const tracking: Tracking = { status: { 1: 'watching' }, watched: { 1: 0 }, rates: {}, memos: {} }
const settings = { ...DEFAULT_SETTINGS, tzMode: 'jst' as const }
beforeEach(() => mockStorage())
describe('bounded progress history', () => {
  it('records advances, resets and sources but not metadata-only changes', () => {
    const next = { ...tracking, watched: { 1: 3 } }
    recordProgressChanges(tracking, next, 'local', at)
    recordProgressChanges(next, tracking, 'cloud', at + 1)
    recordProgressChanges(tracking, { ...tracking, rates: { 1: 8 } }, 'local', at + 2)
    expect(readProgressHistory(at + 3).map(x => [x.before,x.after,x.source])).toEqual([[0,3,'local'],[3,0,'cloud']])
  })
  it('retains at most 2000 valid changes and expires entries after 30 days', () => {
    for (let i = 1; i <= 2002; i++) recordProgressChanges(tracking, { ...tracking, watched: { 1: i } }, 'restore', at + i)
    expect(readProgressHistory(at + 3000)).toHaveLength(2000)
    expect(readProgressHistory(at + 31 * 86400_000)).toHaveLength(0)
  })
  it('rejects invalid progress and reports failed storage without mutating tracking', () => {
    recordProgressChanges(tracking, { ...tracking, watched: { 1: -1 } }, 'local', at)
    expect(readProgressHistory(at)).toHaveLength(0)
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    expect(recordProgressChanges(tracking, { ...tracking, watched: { 1: 3 } }, 'local', at)).toBe(false)
    expect(tracking.watched[1]).toBe(0)
  })
})
describe('privacy-preserving diagnostics', () => {
  it('stores structured outcomes and HTTP status, never the supplied error or credentials', () => {
    recordDiagnostic('sync', 'pull', 'error', 1, new Error('HTTP 503 Bearer secret-token private comment'))
    const text = JSON.stringify(diagnosticReport(1, 0))
    expect(text).toContain('503'); expect(text).not.toContain('secret-token'); expect(text).not.toContain('private comment')
  })
  it('strips unknown fields and rejects unrecognized stages from poisoned local entries', () => {
    localStorage.setItem('btt:diagnostics:v1', JSON.stringify([{ at, area: 'sync', stage: 'pull', result: 'ok', token: 'secret', comment: 'private' }, { at, area: 'sync', stage: 'secretcredential', result: 'ok' }]))
    expect(readDiagnostics()).toEqual([{ at, area: 'sync', stage: 'pull', result: 'ok' }])
  })
  it('caps diagnostic history at 200 records', () => {
    for (let i = 0; i < 202; i++) recordDiagnostic('sync', 'pull', 'ok')
    expect(readDiagnostics()).toHaveLength(200)
  })
})
describe('individual reminders and quiet hours', () => {
  it('migrates and sanitizes per-show settings without leaking unknown fields into backups', () => {
    const next = normalizeSettings({ quietHoursStart: '30:00', showReminders: { 1: { mode: 'after', offset: 90, token: 'secret' }, 2: { mode: 'bad', offset: 5 }, '../key': { mode: 'off', offset: 0 } } })
    expect(next.showReminders).toEqual({ 1: { mode: 'after', offset: 90 } })
    expect(next.quietHoursStart).toBe('23:00')
  })
  it('supports a custom delay even if global episode reminders are disabled', () => {
    const custom = { ...settings, showReminders: { 1: { mode: 'after' as const, offset: 90 } } }
    expect(buildEpisodeReminders([show], tracking, custom, at + 90 * 60_000)).toHaveLength(1)
    expect(buildEpisodeReminders([show], tracking, custom, at + 84 * 60_000)).toHaveLength(0)
  })
  it('mutes both daily and episode reminders for just the selected show', () => {
    const muted = { ...settings, episodeReminderEnabled: true, showReminders: { 1: { mode: 'off' as const, offset: 10 } } }
    expect(buildRichReminderPayload([show], tracking, muted, at, 'watching').items).toHaveLength(0)
    expect(buildEpisodeReminders([show], tracking, muted, at - 10 * 60_000)).toHaveLength(0)
  })
  it('handles cross-midnight quiet hours in the selected display timezone', () => {
    const quiet = { ...settings, quietHoursEnabled: true, quietHoursStart: '23:00', quietHoursEnd: '08:00' }
    expect(isQuietTime(quiet, Date.parse('2026-10-19T14:00:00Z'))).toBe(true)
    expect(isQuietTime(quiet, Date.parse('2026-10-19T23:00:00Z'))).toBe(false)
    expect(isDailyReminderDue(Date.parse('2026-10-19T15:00:00Z'), { ...quiet, watchingReminderEnabled: true }, 'watching', null)).toBe(false)
    expect(isQuietTime({ ...quiet, quietHoursStart: '08:00' }, at)).toBe(true)
  })
})
describe('tray quick watch list', () => {
  it('keeps muted shows visible and never offers a future episode as watched', () => {
    const prefs = { ...settings, showReminders: { 1: { mode: 'off' as const, offset: 0 } } }
    expect(trayWatchRows([show], tracking, prefs, at)).toHaveLength(1)
    expect(trayAdvance(1, 0, [show], tracking, at - 1000)).toBeNull()
    expect(trayAdvance(1, 0, [show], tracking, at)).toBe(1)
  })
  it('rejects stale menu clicks after progress changes, paused shows and invalid input', () => {
    expect(trayAdvance(1, 0, [show], { ...tracking, watched: { 1: 1 } }, at)).toBeNull()
    expect(trayAdvance(1, 0, [show], { ...tracking, status: { 1: 'paused' } }, at)).toBeNull()
    expect(trayAdvance(1, NaN, [show], tracking, at)).toBeNull()
  })
})
