import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { mockStorage } from './testStorage'
vi.mock('./native',()=>({isNativeApp:()=>true,remoteFetch:vi.fn()}))
import { remoteFetch } from './native'
import { fetchSeasonList,fetchSeasonPack,normalizeSeasonPack,adjacentSeason } from './seasons'
beforeEach(()=>{mockStorage();vi.mocked(remoteFetch).mockReset()})
afterEach(()=>vi.unstubAllGlobals())
describe('online quarter catalog and offline fallback',()=>{
  it('discovers a new quarter without replacing the installed application',async()=>{
    vi.mocked(remoteFetch).mockResolvedValue(new Response('{"seasons":["202610","202607"]}'))
    expect(await fetchSeasonList()).toEqual(['202610','202607'])
    vi.mocked(remoteFetch).mockResolvedValue(new Response('{"seasons":["202701","202610"]}'))
    expect(await fetchSeasonList(true)).toEqual(['202701','202610'])
    expect(adjacentSeason('202610',1)).toBe('202701')
  })
  it('retains a valid catalog when both mirrors fail or serve invalid data',async()=>{
    vi.mocked(remoteFetch).mockResolvedValue(new Response('{"seasons":["202610"]}'))
    await fetchSeasonList()
    vi.mocked(remoteFetch).mockRejectedValue(new Error('offline'))
    expect(await fetchSeasonList(true)).toEqual(['202610'])
    vi.mocked(remoteFetch).mockResolvedValue(new Response('{"seasons":["../../secret"]}'))
    expect(await fetchSeasonList(true)).toEqual(['202610'])
  })
  it('preserves epoch dates and exact episode times when reading normalized cached packs',async()=>{
    const raw={shows:[{id:1,nameJp:'Test',begin:'2026-10-01T11:00:00Z',image:'http://lain.bgm.tv/test.jpg',air:{epDates:{1:'2026-10-01T11:00:00Z'}}}]}
    vi.mocked(remoteFetch).mockResolvedValue(new Response(JSON.stringify(raw)))
    const first=await fetchSeasonPack('202610'),second=await fetchSeasonPack('202610')
    expect(second).toEqual(first);expect(first[0].image).toBe('https://lain.bgm.tv/test.jpg');expect(first[0].begin).toBe(Date.parse(raw.shows[0].begin));expect(first[0].airFix?.epDates).toEqual(raw.shows[0].air.epDates)
    expect(()=>normalizeSeasonPack({shows:[{id:-1,nameJp:'bad'}]})).toThrow()
    await expect(fetchSeasonPack('../secret')).rejects.toThrow()
  })
})
