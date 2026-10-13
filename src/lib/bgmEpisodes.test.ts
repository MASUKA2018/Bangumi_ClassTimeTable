import { describe, expect, it } from 'vitest'
import { continuousEpisodeProgress, planEpisodeProgress, type BgmEpisodeCollection } from './bgmEpisodes'
const item = (id: number, ep: number, type = 2, episodeType = 0): BgmEpisodeCollection => ({ episode: { id, ep, sort: ep, type: episodeType }, type })
describe('continuous episode planning', () => {
  it('uses episode numbers rather than arbitrary IDs or list ordering', () => {
    const items = [item(900, 3), item(100, 1), item(600, 2)]
    expect(continuousEpisodeProgress(items)).toBe(3)
    expect(planEpisodeProgress(items.map(value => ({ ...value, type: 0 })), 3, false).watched).toEqual([900, 100, 600])
  })
  it('does not include fractional episodes, SPs, OPs or missing earlier episodes', () => {
    const items = [item(1, 1), item(2, 2, 0), item(3, 3), item(4, 1, 2, 1), item(5, 1.5), item(6, 1, 2, 2)]
    expect(continuousEpisodeProgress(items)).toBe(1)
    expect(planEpisodeProgress(items, 3, true)).toEqual({ watched: [2], unwatched: [] })
  })
  it('falls back to sort when old metadata has no ep field', () => {
    expect(continuousEpisodeProgress([{ episode: { id: 1, type: 0, sort: 1 }, type: 2 }])).toBe(1)
  })
  it('rejects invalid progress and incomplete numbering before mutation', () => {
    expect(() => planEpisodeProgress([item(1, 1), item(3, 3)], 3, false)).toThrow('第 2 集')
    for (const n of [-1, 1.5, NaN, Infinity, 100001]) expect(() => planEpisodeProgress([], n, false)).toThrow()
  })
})
