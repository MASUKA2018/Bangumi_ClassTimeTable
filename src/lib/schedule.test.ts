import { describe, expect, it } from 'vitest'
import type { Show } from '../types'
import { DAY_MS } from './time'
import { airedCount, epTime, nextEpisode, occurrencesBetween } from './schedule'

// Actual P0D entry present in the affected 0.6.4 installation's public-data cache.
const at = Date.parse('2026-10-24T16:00:00Z')
const special: Show = {
  id: 551304, nameJp: 'わたしの幸せな結婚 特別篇', nameCn: '我的幸福婚姻 特别篇',
  begin: at, end: at, periodDays: 0, sites: [], fromCalendar: false,
}
const weekly: Show = { ...special, id: 1, periodDays: 7, end: undefined, epsTotal: 12 }

describe('one-off and batch broadcasts', () => {
  it('finishes after a cached P0D release with an unknown episode count (the runaway regression)', () => {
    expect(occurrencesBetween(special, at + DAY_MS, at + 30 * DAY_MS)).toEqual([])
    expect(nextEpisode(special, at + DAY_MS)).toBeNull()
    expect(airedCount(special, at + DAY_MS)).toBe(1)
    expect(epTime(special, 2)).toBeNull()
  })
  it('lists the one-off on its actual date, with no weekly repeats or phase shifting', () => {
    const show = { ...special, broadcastAt: at + 100 * DAY_MS }
    expect(occurrencesBetween(show, at - 1, at + DAY_MS)).toEqual([{ ep: 1, epEnd: 1, t: at }])
    expect(nextEpisode(show, at - 1)).toEqual({ ep: 1, epEnd: 1, t: at })
    expect(airedCount(show, at - 1)).toBe(0)
  })
  it('groups a known complete batch, preserving exact per-episode exceptions', () => {
    const show = { ...special, epsTotal: 12, airFix: { epDates: { 12: new Date(at + DAY_MS).toISOString() } } }
    expect(occurrencesBetween(show, at - 1, at + DAY_MS)).toEqual([
      { ep: 1, epEnd: 11, t: at }, { ep: 12, epEnd: 12, t: at + DAY_MS },
    ])
    expect(nextEpisode(show, at - 1)?.epEnd).toBe(11)
    expect(airedCount(show, at)).toBe(11)
  })
  it('supports a one-off anchor without inferring endless future episodes', () => {
    const show = { ...special, begin: undefined, airFix: { anchorEp: 4, anchorAt: new Date(at).toISOString() } }
    expect(occurrencesBetween(show, at - 1, at + 1)).toEqual([{ ep: 4, epEnd: 4, t: at }])
    expect(epTime(show, 5)).toBeNull()
    expect(occurrencesBetween(show, at + 1, at + DAY_MS)).toEqual([])
  })
})

describe('bounded computations for invalid external schedules', () => {
  it.each([NaN, Infinity, -1])('does not infer dates for invalid period %s, while retaining exact dates', periodDays => {
    const show = { ...special, periodDays, airFix: { epDates: { 2: new Date(at).toISOString() } } }
    expect(epTime(show, 1)).toBeNull()
    expect(occurrencesBetween(show, at - DAY_MS, at + DAY_MS)).toEqual([{ ep: 2, epEnd: 2, t: at }])
  })
  it('bounds tiny periods, huge finite batches and invalid episode numbers', () => {
    const show = { ...special, end: undefined, periodDays: 1e-8, epsTotal: undefined }
    const result = occurrencesBetween(show, at, at + DAY_MS)
    expect(result.length).toBeLessThanOrEqual(10_000)
    expect(result.every(o => Number.isFinite(o.t) && Number.isSafeInteger(o.ep))).toBe(true)
    const huge = { ...special, epsTotal: Number.MAX_SAFE_INTEGER }
    expect(nextEpisode(huge, at - 1)?.epEnd).toBe(10_000)
    expect(occurrencesBetween(huge, at - 1, at + 1)).toEqual([{ ep: 1, epEnd: 10_000, t: at }])
    const badFix = { ...special, airFix: { advanceEps: Infinity, anchorEp: Infinity } }
    expect(occurrencesBetween(badFix, at - 1, at + 1)).toEqual([{ ep: 1, epEnd: 1, t: at }])
    expect(epTime(special, Infinity)).toBeNull()
    expect(epTime(special, 1.5)).toBeNull()
    expect(occurrencesBetween(weekly, -Infinity, Infinity)).toEqual([])
  })
})

describe('normal repeating broadcasts', () => {
  it('preserves weekly dates, progress, next episodes and phase alignment', () => {
    expect(occurrencesBetween(weekly, at, at + 14 * DAY_MS)).toEqual([
      { ep: 1, epEnd: 1, t: at }, { ep: 2, epEnd: 2, t: at + 7 * DAY_MS }, { ep: 3, epEnd: 3, t: at + 14 * DAY_MS },
    ])
    expect(airedCount(weekly, at + DAY_MS)).toBe(1)
    expect(nextEpisode(weekly, at + DAY_MS)).toEqual({ ep: 2, epEnd: 2, t: at + 7 * DAY_MS })
    expect(epTime({ ...weekly, broadcastAt: at + DAY_MS }, 2)).toBe(at + 8 * DAY_MS)
  })
  it('keeps advance batches, return anchors and exact-date overrides in order', () => {
    const show = { ...weekly, airFix: { advanceEps: 3, anchorEp: 4, anchorAt: new Date(at + 7 * DAY_MS).toISOString(), epDates: { 5: new Date(at + 15 * DAY_MS).toISOString() } } }
    expect(occurrencesBetween(show, at, at + 15 * DAY_MS)).toEqual([
      { ep: 1, epEnd: 3, t: at }, { ep: 4, epEnd: 4, t: at + 7 * DAY_MS }, { ep: 5, epEnd: 5, t: at + 15 * DAY_MS },
    ])
    expect(nextEpisode(show, at - 1)).toEqual({ ep: 1, epEnd: 3, t: at })
    expect(airedCount(show, at)).toBe(3)
  })
})
