import { beforeEach, describe, expect, it } from 'vitest'
import { loadPersisted, normalizeSettings, savePersisted } from './store'
import { mockStorage } from './testStorage'
describe('settings migration and persistence', () => {
  beforeEach(() => mockStorage())
  it('migrates the original single reminder without losing progress', () => {
    localStorage.setItem('btt:v1', JSON.stringify({ settings: { dailyReminderEnabled: true, dailyReminderTime: '18:45', lateNight: false, panelWidthDay: 560 }, tracking: { status: { 1: 'watching' }, watched: { 1: 3 } } }))
    const data = loadPersisted()
    expect(data.settings).toMatchObject({ watchingReminderEnabled: true, otherReminderEnabled: true, watchingReminderTime: '18:45', otherReminderTime: '18:45', lateNightCutoff: 0, panelWidthDay: 640 })
    expect(data.tracking.watched[1]).toBe(3)
    expect(data.settings).not.toHaveProperty('dailyReminderEnabled')
  })
  it('rejects invalid preferences and unknown credential fields', () => {
    const settings = normalizeSettings({ themeMode: 'bad', density: 'huge', fontScale: NaN, panelWidth: Infinity, watchingReminderTime: '26:01', backupEnabled: 'false', token: 'secret' })
    expect(settings).toMatchObject({ themeMode: 'manual', density: 'standard', fontScale: 100, panelWidth: 380, watchingReminderTime: '20:00', backupEnabled: true })
    expect(settings).not.toHaveProperty('token')
  })
  it('round-trips paused status and reading preferences', () => {
    const data = loadPersisted()
    data.settings.fontScale = 130; data.settings.themeMode = 'system'
    data.tracking.status[1] = 'paused'; data.tracking.watched[1] = 4
    expect(savePersisted(data)).toBe(true)
    expect(loadPersisted()).toEqual(data)
  })
})
