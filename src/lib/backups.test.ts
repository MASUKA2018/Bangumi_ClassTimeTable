import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupDiff, backupDocument, createBackup, listBackups, mergeBackup, parseBackup, readBackup, sanitizeBackup } from './backups'
import { DEFAULT_FILTERS, DEFAULT_SETTINGS, normalizeSettings, type Persisted } from './store'
import { mockStorage } from './testStorage'
const data = (progress = 1): Persisted => ({ settings: { ...DEFAULT_SETTINGS }, tracking: { status: { 1: 'watching' }, watched: { 1: progress }, rates: {}, memos: {} }, overrides: {}, filters: DEFAULT_FILTERS })
beforeEach(() => { mockStorage(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('safe backups', () => {
  it('strips credentials, caches and unknown fields on export and import', () => {
    const original = { ...data(), account: { token: 'SECRET' }, settings: { ...DEFAULT_SETTINGS, token: 'SECRET' }, tracking: { ...data().tracking, queue: { token: 'SECRET' } } }
    const doc = backupDocument(original)
    expect(JSON.stringify(doc)).not.toContain('SECRET')
    expect(parseBackup(JSON.stringify(doc))).toEqual(data())
  })
  it('rejects unsupported versions and malformed backups', () => {
    expect(() => parseBackup('{bad json')).toThrow()
    expect(() => sanitizeBackup({ app: 'other', data: data() })).toThrow()
    expect(() => sanitizeBackup({ app: 'bangumi-timetable', version: 999, data: data() })).toThrow()
    expect(() => sanitizeBackup({ tracking: 'bad', settings: [] })).toThrow()
  })
  it('accepts legacy v1 documents and clamps invalid settings/progress', () => {
    const value = parseBackup(JSON.stringify({ version: 1, data: { ...data(), settings: { ...DEFAULT_SETTINGS, fontScale: 900, theme: 'bogus' }, tracking: { ...data().tracking, watched: { 1: -2, 2: 2.5 }, status: { 1: 'paused', 2: 'invalid' } } } }))
    expect(value.settings.fontScale).toBe(100)
    expect(value.settings.theme).toBe('bgm-dark')
    expect(value.tracking.watched).toEqual({})
    expect(value.tracking.status).toEqual({ 1: 'paused' })
  })
  it('merges local-first status/settings with greater watched progress', () => {
    const incoming = data(5); incoming.tracking.status[1] = 'paused'; incoming.tracking.status[2] = 'wish'; incoming.settings.theme = 'nord'
    const merged = mergeBackup(data(2), incoming)
    expect(merged.tracking.status).toEqual({ 1: 'watching', 2: 'wish' })
    expect(merged.tracking.watched[1]).toBe(5)
    expect(merged.settings.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(backupDiff(data(2), incoming)).toEqual({ total: 2, changed: 2 })
  })
  it('rotates seven daily files separately from three safety snapshots', async () => {
    for (let day = 1; day <= 10; day++) {
      vi.setSystemTime(new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`))
      await createBackup(data(day))
    }
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(1000); await createBackup(data(), 'restore') }
    const files = await listBackups()
    expect(files.filter(x => x.reason === 'daily')).toHaveLength(7)
    expect(files.filter(x => x.reason === 'restore')).toHaveLength(3)
    expect(files.every(x => x.payload === undefined)).toBe(true)
    expect((await readBackup('daily-2026-10-10.json')).tracking.watched[1]).toBe(10)
    await expect(readBackup('daily-2026-10-01.json')).rejects.toThrow()
  })
  it('normalizes safe appearance defaults and reminder enums', () => {
    expect(normalizeSettings({ fontScale: NaN, density: 'bad', themeMode: 'bad', coverSize: 'bad', episodeReminderOffset: -1, reminderDismissSeconds: 999, friends: ['alice', 'alice', 9] })).toMatchObject({ fontScale: 100, density: 'standard', themeMode: 'manual', coverSize: 'medium', episodeReminderOffset: 10, reminderDismissSeconds: 30, friends: ['alice'] })
  })
})
