import { beforeEach, expect, it } from 'vitest'
import { cachedShows, cacheData } from './dataCache'
import { mockStorage } from './testStorage'
beforeEach(() => mockStorage())
it('reuses old public show caches, including zero-period specials, before network refresh', () => {
  const shows = [{ id: 551304, nameJp: 'Special', nameCn: '特别篇', periodDays: 0, sites: [], fromCalendar: true }]
  cacheData('live-shows', shows)
  expect(cachedShows()).toEqual(shows)
})
it('ignores malformed or unrelated caches instead of blocking application startup', () => {
  expect(cachedShows()).toBeNull()
  for (const value of [[], {}, [null], [{ id: 1, nameJp: 'Broken', periodDays: -1, sites: [] }]]) {
    cacheData('live-shows', value); expect(cachedShows()).toBeNull()
  }
})
