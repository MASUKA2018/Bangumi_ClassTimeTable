import type { Show } from '../types'
import type { CalItem } from './api'
import type { BdBundle } from './bangumiData'

import type { AirFix } from '../types'
import { isNativeApp, remoteFetch } from './native'

const REMOTE_ENHANCE =
  import.meta.env.VITE_ENHANCE_URL?.trim() ||
  'https://cdn.jsdelivr.net/gh/MASUKA2018/Bangumi_ClassTimeTable@main/public/data/enhance.json'
const REMOTE_CACHE_KEY = 'btt:cache:enhance:remote:v1'
const REMOTE_TTL = 12 * 3600_000

/** yuc 增强数据(public/data/enhance.json,由 refresh-data skill 生成) */
export interface EnhanceEntry {
  tags?: string[]
  pv?: string
  sourceType?: string
  air?: AirFix // 放送校正(先行放送等,由 skill 人工判读 yuc 备注生成)
}

export type EnhanceMap = Record<string, EnhanceEntry>

export interface EnhanceData {
  entries: EnhanceMap
  /** 产地判定(scripts/mark_region.py):非 ja 前缀 = 非日本作品(cn/us/xx…) */
  regions: Record<string, string>
  /** bgm.wiki 逐集时间的最近同步时刻。 */
  syncedAt?: string
  source?: 'bundled' | 'remote'
}

function normalizeEnhance(raw: any, source: EnhanceData['source']): EnhanceData {
  const entries = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {}
  if (Object.keys(entries).length < 10) throw new Error('enhance.json 条目数量异常')
  return {
    entries,
    regions: raw?.regions && typeof raw.regions === 'object' ? raw.regions : {},
    syncedAt: raw.bgmwiki_synced_at ?? raw.generated_at,
    source,
  }
}

function readRemoteCache(): { t: number; v: EnhanceData } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMOTE_CACHE_KEY) ?? 'null')
    return parsed && typeof parsed.t === 'number' && parsed.v?.entries ? parsed : null
  } catch {
    return null
  }
}

export async function fetchEnhance(): Promise<EnhanceData> {
  // 原生安装包里的 JSON 会随版本老化。桌面/Android 每 12 小时检查公开 CDN，
  // 失败时使用过期缓存；浏览器站点继续读取同源文件。
  if (isNativeApp()) {
    const cached = readRemoteCache()
    if (cached && Date.now() - cached.t < REMOTE_TTL) return cached.v
    try {
      const resp = await remoteFetch(REMOTE_ENHANCE, { cache: 'no-store' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const value = normalizeEnhance(await resp.json(), 'remote')
      try {
        localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify({ t: Date.now(), v: value }))
      } catch {}
      return value
    } catch (error) {
      if (cached) return cached.v
      console.warn('在线逐集时间更新失败，改用安装包内置数据', error)
    }
  }

  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/enhance.json`)
    if (!resp.ok) return { entries: {}, regions: {} }
    return normalizeEnhance(await resp.json(), 'bundled')
  } catch {
    return { entries: {}, regions: {} }
  }
}

/**
 * 产地归一:undefined = 实锤日本(bd/yuc 收录或官方标注);
 * 'cn' 中国;'unknown' 无可靠信号(诚实标未知,不硬归日本);其余('us'/'kr'/'xx')海外。
 */
const regionOf = (bdOrigin: string | undefined, marked: string | undefined): string | undefined => {
  if (bdOrigin) return bdOrigin.startsWith('zh') ? 'cn' : 'xx' // bangumi-data lang 权威
  if (!marked || marked === 'ja') return undefined
  if (marked === 'ja?') return 'unknown'
  return marked
}

/** 三源合并:calendar(本周在播骨架) × bangumi-data(精确时间/平台) × yuc 增强 */
export function buildShows(cal: CalItem[], bd: BdBundle, enhData: EnhanceData, now: number): Show[] {
  const enh = enhData.entries
  const shows: Show[] = []
  const seen = new Set<number>()

  for (const c of cal) {
    seen.add(c.id)
    const b = bd.byId.get(c.id)
    const e = enh[String(c.id)]
    shows.push({
      id: c.id,
      nameCn: b?.titleCn && c.nameCn === c.name ? b.titleCn : c.nameCn,
      nameJp: c.name,
      nameHant: b?.titleHant,
      nameEn: b?.titleEn,
      image: c.image,
      score: c.score,
      rank: c.rank,
      ratingTotal: c.total,
      watchers: c.doing,
      airWeekdayJst: c.weekday,
      begin: b?.begin,
      end: b?.end || undefined,
      periodDays: b?.periodDays ?? 7,
      broadcastAt: b?.broadcastAt,
      officialSite: b?.officialSite,
      sites: b?.sites ?? [],
      fromCalendar: true,
      tags: e?.tags,
      pvUrl: e?.pv,
      sourceType: e?.sourceType,
      airFix: e?.air,
      region: regionOf(b?.origin, enhData.regions[String(c.id)]),
    })
  }

  // bangumi-data 独有条目,两类:
  //  1) 当季窗口(前 30 天 ~ 后 100 天开播)的新条目 —— 流媒体全集、尚未进 calendar 的新番
  //  2) 开播已久但仍在播的长篇 —— calendar 每周放送表会漏子供向/长期档
  //    (小鲨鱼、光之美少女、数码宝贝、アイプリ等),bd 标记未完结即收
  const lo = now - 30 * 86400_000
  const hi = now + 100 * 86400_000
  for (const b of bd.byId.values()) {
    if (seen.has(b.bgmId)) continue
    const recent = b.begin >= lo && b.begin <= hi
    const ongoingLong = !b.end && b.begin < lo
    if (!recent && !ongoingLong) continue
    if (b.end && b.end < now) continue
    const e = enh[String(b.bgmId)]
    shows.push({
      id: b.bgmId,
      nameCn: b.titleCn ?? b.title,
      nameJp: b.title,
      nameHant: b.titleHant,
      nameEn: b.titleEn,
      begin: b.begin,
      end: b.end || undefined,
      periodDays: b.periodDays,
      broadcastAt: b.broadcastAt,
      officialSite: b.officialSite,
      sites: b.sites,
      fromCalendar: false,
      tags: e?.tags,
      pvUrl: e?.pv,
      sourceType: e?.sourceType,
      airFix: e?.air,
      region: regionOf(b.origin, enhData.regions[String(b.bgmId)]),
    })
  }

  return shows
}
