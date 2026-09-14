import { describe, expect, it } from 'vitest'
import type { Settings, Show, Tracking } from '../types'
import { setLang } from './i18n'
import { buildRichReminderPayload, isDailyReminderDue, reminderDayKey } from './notifications'

const settings: Settings = {
  theme: 'bgm-dark',
  lang: 'zh-Hans',
  tzMode: 'jst',
  lateNightCutoff: 2,
  watchingReminderEnabled: true,
  watchingReminderTime: '20:00',
  otherReminderEnabled: true,
  otherReminderTime: '21:00',
  weekStart: 1,
  friends: [],
  panelOpen: true,
  panelWidth: 380,
  panelWidthDay: 640,
}

describe('daily reminder timing', () => {
  it('fires at the configured minute and only once per timetable day', () => {
    const before = Date.parse('2026-09-14T10:59:00Z') // 19:59 JST
    const due = Date.parse('2026-09-14T11:00:00Z') // 20:00 JST
    expect(isDailyReminderDue(before, settings, 'watching', null)).toBe(false)
    expect(isDailyReminderDue(due, settings, 'watching', null)).toBe(true)
    expect(isDailyReminderDue(due, settings, 'watching', '2026-09-14')).toBe(false)
    expect(isDailyReminderDue(due, settings, 'other', null)).toBe(false)
  })

  it('keeps an after-midnight reminder on the previous late-night timetable day', () => {
    const deepNight = { ...settings, watchingReminderTime: '01:00' }
    const before = Date.parse('2026-09-14T15:59:00Z') // Sep 15 00:59 JST
    const due = Date.parse('2026-09-14T16:00:00Z') // Sep 15 01:00 JST
    expect(reminderDayKey(due, deepNight)).toBe('2026-09-14')
    expect(isDailyReminderDue(before, deepNight, 'watching', null)).toBe(false)
    expect(isDailyReminderDue(due, deepNight, 'watching', null)).toBe(true)
  })
})

describe('daily reminder content', () => {
  const tracking: Tracking = { status: { 1: 'watching' }, watched: {}, rates: {}, memos: {} }

  it('builds a rich watching card with cover, time, title and episode', () => {
    setLang('zh-Hans')
    const show: Show = {
      id: 1,
      nameCn: '测试番剧',
      nameJp: 'テストアニメ',
      image: 'https://example.com/cover.jpg',
      begin: Date.parse('2026-09-14T11:30:00Z'),
      periodDays: 7,
      sites: [],
      fromCalendar: true,
    }
    const payload = buildRichReminderPayload([show], tracking, settings, Date.parse('2026-09-14T11:00:00Z'), 'watching')
    expect(payload.heading).toBe('今日在看更新')
    expect(payload.items).toEqual([
      {
        id: 1,
        title: '测试番剧',
        cover: 'https://example.com/cover.jpg',
        airTime: '20:30',
        episode: '更新至第 1 集',
      },
    ])
  })

  it('keeps watching and other shows in separate reminder groups', () => {
    setLang('zh-Hans')
    const show: Show = {
      id: 2,
      nameCn: '未追番剧',
      nameJp: '未フォロー',
      begin: Date.parse('2026-09-14T12:00:00Z'),
      periodDays: 7,
      sites: [],
      fromCalendar: true,
    }
    const now = Date.parse('2026-09-14T11:00:00Z')
    expect(buildRichReminderPayload([show], tracking, settings, now, 'watching').items).toHaveLength(0)
    expect(buildRichReminderPayload([show], tracking, settings, now, 'other').items[0].title).toBe('未追番剧')
  })
})
