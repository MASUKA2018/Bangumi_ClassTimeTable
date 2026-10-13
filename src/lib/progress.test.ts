import { describe, expect, it } from 'vitest'
import type { Show, Tracking } from '../types'
import { behindCount, behindProgress } from './progress'

const show: Show = {
  id: 1,
  nameCn: '测试番剧',
  nameJp: 'テストアニメ',
  begin: Date.parse('2026-10-01T12:00:00Z'),
  periodDays: 7,
  epsTotal: 12,
  sites: [],
  fromCalendar: true,
}

const tracking = (status: Tracking['status'][number], watched: number): Tracking => ({
  status: { 1: status },
  watched: { 1: watched },
  rates: {},
  memos: {},
})

describe('behind progress', () => {
  const afterEpisode3 = Date.parse('2026-10-16T12:00:00Z')

  it('returns the exact continuous episode range after the watched episode', () => {
    expect(behindProgress(show, tracking('watching', 1), afterEpisode3)).toEqual({
      watched: 1,
      aired: 3,
      count: 2,
      fromEpisode: 2,
      toEpisode: 3,
    })
    expect(behindCount(show, tracking('watching', 1), afterEpisode3)).toBe(2)
  })

  it('does not report non-watching or fully caught-up shows', () => {
    expect(behindProgress(show, tracking('wish', 0), afterEpisode3)).toBeNull()
    expect(behindProgress(show, tracking('watching', 3), afterEpisode3)).toBeNull()
  })
})
