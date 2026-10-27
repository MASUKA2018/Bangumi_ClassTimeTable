import type { Show } from '../types'
import { seasonLabel } from './i18n'
import { isNativeApp, remoteFetch } from './native'
import { cachedData, cacheData } from './dataCache'
import { normalizeBgmImageUrl } from './api'
import { fetchBangumiData } from './bangumiData'
import { buildShows, fetchEnhance } from './merge'

const ROOTS = [
  'https://cdn.jsdelivr.net/gh/MASUKA2018/Bangumi_ClassTimeTable@main/public/data/',
  'https://raw.githubusercontent.com/MASUKA2018/Bangumi_ClassTimeTable/main/public/data/',
]
const validSeason = (v: unknown): v is string => typeof v === 'string' && /^20\d{2}(01|04|07|10)$/.test(v)
const TTL = 12 * 3600_000
export function fmtSeason(s: string): string { return seasonLabel(+s.slice(0,4), +s.slice(4)) }
export function seasonStartOf(s: string): number { return Date.UTC(+s.slice(0,4), +s.slice(4)-1, 1)-9*3600_000 }
export function seasonMonthOf(s: string): { y: number; mo: number } { return { y: +s.slice(0,4), mo: +s.slice(4) } }
export function adjacentSeason(s: string, offset: number): string {
  const date = new Date(Date.UTC(+s.slice(0,4), +s.slice(4)-1+offset*3, 1))
  return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}`
}
async function publicJson<T>(name: string, validate: (raw: unknown) => T, force: boolean): Promise<T> {
  const old = cachedData<T>(name)
  if (!force && old && Date.now()-old.at < TTL) { try { return validate(old.value) } catch {} }
  if (isNativeApp()) for (const root of ROOTS) {
    try {
      const resp = await remoteFetch(root+name, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = validate(await resp.json()); cacheData(name, data); return data
    } catch {}
  }
  if (old) { try { return validate(old.value) } catch {} }
  const resp = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!resp.ok) throw new Error(`季度数据加载失败 (HTTP ${resp.status})`)
  const data = validate(await resp.json()); cacheData(name, data); return data
}
export async function fetchSeasonList(force = false): Promise<string[]> {
  try {
    const doc = await publicJson('seasons.json', raw => {
      const seasons = (raw as { seasons?: unknown })?.seasons
      if (!Array.isArray(seasons) || !seasons.length || !seasons.every(validSeason)) throw new Error('季度目录无效')
      return { seasons: [...new Set(seasons)].sort().reverse() }
    }, force)
    return doc.seasons
  } catch { return [] }
}
export function normalizeSeasonPack(raw: unknown): { shows: Show[] } {
  const shows = (raw as { shows?: unknown })?.shows
  if (!Array.isArray(shows) || shows.length > 3000) throw new Error('季度数据包无效')
  return { shows: shows.map((s: any): Show => {
    if (!Number.isSafeInteger(s?.id) || s.id <= 0 || typeof s.nameJp !== 'string') throw new Error('番剧条目无效')
    const at = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : undefined
    return { id: s.id, nameCn: s.nameCn || s.nameJp, nameJp: s.nameJp,
      image: normalizeBgmImageUrl(typeof s.image === 'string' ? s.image : undefined), score: s.score, rank: s.rank, ratingTotal: s.ratingTotal,
      airWeekdayJst: s.airWeekdayJst, begin: at(s.begin), timePending: s.timePending === true || (typeof s.begin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.begin)), end: at(s.end), periodDays: s.periodDays > 0 ? s.periodDays : 7,
      epsTotal: s.epsTotal, officialSite: s.officialSite, sites: Array.isArray(s.sites) ? s.sites : [],
      fromCalendar: s.fromCalendar ?? !s.streaming, tags: s.tags, pvUrl: s.pvUrl ?? s.pv, sourceType: s.sourceType, airFix: s.airFix ?? s.air }
  }) }
}
export async function fetchSeasonPack(s: string, force = false): Promise<Show[]> {
  if (!validSeason(s)) throw new Error('季度格式无效')
  return (await publicJson(`season-${s}.json`, normalizeSeasonPack, force)).shows
}
/** Only announced dates are included; never fabricate a broadcast time. */
export async function fetchSeasonPreview(s: string): Promise<Show[]> {
  try { const pack=await fetchSeasonPack(s); if(pack.length)return pack } catch {}
  const [bd, enhance] = await Promise.all([fetchBangumiData(), fetchEnhance()])
  const lo = seasonStartOf(s), hi = seasonStartOf(adjacentSeason(s,1))
  return buildShows([], bd, enhance, lo).filter(show => show.begin !== undefined && show.begin >= lo && show.begin < hi)
}
