/**
 * 放送日程推导:线性周更 + AirFix 例外规则(整批先行 / 锚点回归)。
 * 所有视图与进度统计都从这里取"第 N 集什么时候播"。
 */

import type { Show } from '../types'
import { DAY_MS } from './time'

/** 一次放出:ep..epEnd 集于 t 时刻(整批先行时 epEnd > ep) */
export interface Occurrence {
  ep: number
  epEnd: number
  t: number
}

// Remote data and old caches can contain P0D (a one-off/batch release).
// Never divide by that period, or let an untrusted range grow without a bound.
const MAX_RANGE_EPISODES = 10_000
const episodeNumber = (n: number | undefined): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0
const periodMs = (s: Show) => Number.isFinite(s.periodDays) && s.periodDays >= 0
  ? s.periodDays * DAY_MS : NaN
const finiteTime = (t: number): number | null => Number.isFinite(t) ? t : null

function eachEpisode(lo: number, hi: number, visit: (ep: number) => void): void {
  if (!episodeNumber(lo) || !episodeNumber(hi) || hi < lo) return
  const end = Math.min(hi, lo + MAX_RANGE_EPISODES - 1)
  for (let ep = lo; ep <= end; ep++) visit(ep)
}

/**
 * 线性推导的相位对齐:begin 定集数,broadcast 锚点定"周几几点"。
 * 长篇换档后 bangumi-data 会更新 broadcast(柯南 begin=1996 年周一档,
 * 锚点=2009 年周六 18:00),把 begin 相位的推导时刻平移到锚点相位的最近时刻。
 */
function alignPhase(t: number, s: Show): number {
  const a = s.broadcastAt
  if (a === undefined || !Number.isFinite(a)) return t
  const pm = periodMs(s)
  if (!(pm > 0) || !Number.isFinite(pm)) return t
  const d = (((a - t) % pm) + pm) % pm // 0..pm
  return d <= pm / 2 ? t + d : t + d - pm
}

const parseAt = (iso: string | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** 总集数(校正优先) */
export function totalEps(s: Show): number | undefined {
  return episodeNumber(s.airFix?.eps) ? s.airFix.eps : episodeNumber(s.epsTotal) ? s.epsTotal : undefined
}

/** 整批先行的放出时刻(有 advanceEps 时) */
function advanceAt(s: Show): number | null {
  if (!episodeNumber(s.airFix?.advanceEps)) return null
  return parseAt(s.airFix.advanceAt) ?? (s.begin === undefined ? null : finiteTime(s.begin))
}

/** 第 ep 集的播出时刻;无法推导返回 null */
export function epTime(s: Show, ep: number): number | null {
  if (!episodeNumber(ep)) return null
  const exact = epDateOf(s, ep)
  if (exact !== null) return exact
  const f = s.airFix
  if (episodeNumber(f?.advanceEps) && ep <= f.advanceEps) return advanceAt(s)
  const pm = periodMs(s)
  if (episodeNumber(f?.anchorEp) && ep >= f.anchorEp) {
    const at = parseAt(f.anchorAt)
    if (at !== null) {
      if (ep === f.anchorEp) return at
      if (pm === 0) return ep <= (totalEps(s) ?? f.anchorEp) ? at : null
      return pm > 0 ? finiteTime(at + (ep - f.anchorEp) * pm) : null
    }
  }
  if (s.begin && !s.timePending) {
    if (pm === 0) return ep <= (totalEps(s) ?? 1) ? finiteTime(s.begin) : null
    if (pm > 0) return finiteTime(alignPhase(s.begin + (ep - 1) * pm, s))
  }
  return null
}

/** 指定集的精确时刻覆盖(bgm.wiki 同步/人工校正),最高优先 */
function epDateOf(s: Show, ep: number): number | null {
  const d = s.airFix?.epDates?.[String(ep)]
  return d ? parseAt(d) : null
}

function epDateKeys(s: Show): number[] {
  const m = s.airFix?.epDates
  return m ? Object.keys(m).map(Number).filter(episodeNumber) : []
}

/**
 * 已放送集数 = 满足 epTime <= now 的最大集号,封顶总集数。
 * 无任何可用规则(无 begin 且无校正,或长篇周数折算不可靠)返回 undefined。
 */
export function airedCount(s: Show, now: number): number | undefined {
  const total = totalEps(s)
  const f = s.airFix
  const keys = epDateKeys(s)

  const hasRule = !!((s.begin && !s.timePending) || f?.advanceEps || (f?.anchorEp != null && f.anchorAt) || keys.length)
  if (!hasRule) return undefined
  // 开播 400 天以上且不知总集数的长篇,周数折算不可靠(除非有校正兜底)
  if (s.begin && !total && now - s.begin > 400 * DAY_MS && !f) return undefined

  // 扫描上限:总集数,否则取线性推导与各校正键的最大值加余量
  let cap = total ?? 0
  if (!cap) {
    const pm = periodMs(s)
    const linear = s.begin && now >= s.begin && pm > 0 && Number.isFinite(pm)
      ? Math.floor((now - s.begin) / pm) + 1 : 1
    cap = Math.max(linear, episodeNumber(f?.advanceEps) ? f.advanceEps : 0,
      episodeNumber(f?.anchorEp) ? f.anchorEp : 0, keys.reduce((a, b) => Math.max(a, b), 0)) + 2
  }
  cap = Math.min(Math.max(cap, 1), 500)

  let aired = 0
  for (let ep = 1; ep <= cap; ep++) {
    const t = epTime(s, ep)
    if (t !== null && t <= now) aired = ep
  }
  return total ? Math.min(aired, total) : aired
}

/** 下一次放出(含整批);完结或无法推导返回 null */
export function nextEpisode(s: Show, now: number): Occurrence | null {
  const aired = airedCount(s, now)
  if (aired === undefined) return null
  const total = totalEps(s)
  const ep = aired + 1
  if (total && ep > total) return null
  const t = epTime(s, ep)
  if (t === null) return null
  // bangumi-data 标了完结且无人工校正 → 不再排未来集
  if (s.end && t > s.end && !s.airFix) return null
  let epEnd = ep
  while (epEnd - ep + 1 < MAX_RANGE_EPISODES && (!total || epEnd + 1 <= total) && epTime(s, epEnd + 1) === t) epEnd++
  return { ep, epEnd, t }
}

/** [lo, hi] 时间窗内的所有放出,按时刻排序;同刻连续集合并为单条 */
export function occurrencesBetween(s: Show, lo: number, hi: number): Occurrence[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return []
  const total = totalEps(s)
  const f = s.airFix
  const pm = periodMs(s)
  const raw: { ep: number; t: number }[] = []
  const covered = new Set(epDateKeys(s)) // epDates 覆盖的集不再由其他规则生成

  // 精确时刻段(最高优先)
  if (f?.epDates) {
    for (const ep of covered) {
      if (total && ep > total) continue
      const t = epDateOf(s, ep)
      if (t !== null && t >= lo && t <= hi) raw.push({ ep, t })
    }
  }

  // 整批先行段
  if (episodeNumber(f?.advanceEps)) {
    const at = advanceAt(s)
    if (at !== null && at >= lo && at <= hi) {
      eachEpisode(1, Math.min(f.advanceEps, total ?? Infinity), ep => {
        if (!covered.has(ep)) raw.push({ ep, t: at })
      })
    }
  }

  // 线性段(避开先行/锚点覆盖的集数区间)
  if (s.begin && !s.timePending && Number.isFinite(pm) && pm >= 0) {
    const begin = s.begin
    const linLo = (episodeNumber(f?.advanceEps) ? f.advanceEps : 0) + 1
    const linHi = episodeNumber(f?.anchorEp) && parseAt(f.anchorAt) !== null ? f.anchorEp - 1 : Infinity
    // 前后各放宽一集:相位对齐(±半周期)可能把边缘集移入窗口,靠下面的窗口过滤收口
    const e0 = pm === 0 ? linLo : Math.max(linLo, Math.ceil((lo - s.begin) / pm + 1) - 1)
    const e1 = Math.min(linHi, pm === 0 ? total ?? 1 : Math.floor((hi - s.begin) / pm) + 2, total ?? Infinity)
    eachEpisode(e0, e1, ep => {
      if (covered.has(ep)) return
      const t = alignPhase(begin + (ep - 1) * pm, s)
      if (s.end && t > s.end && !f) return
      if (!Number.isFinite(t) || t < lo || t > hi) return // 相位平移可能移出窗口
      raw.push({ ep, t })
    })
  }

  // 锚点周更段
  if (episodeNumber(f?.anchorEp) && Number.isFinite(pm) && pm >= 0) {
    const at = parseAt(f.anchorAt)
    if (at !== null) {
      const e0 = pm === 0 ? f.anchorEp : Math.max(f.anchorEp, f.anchorEp + Math.ceil((lo - at) / pm))
      const e1 = pm === 0 ? total ?? f.anchorEp : Math.min(f.anchorEp + Math.floor((hi - at) / pm), total ?? Infinity)
      eachEpisode(e0, e1, ep => {
        const t = at + (ep - f.anchorEp!) * pm
        if (!covered.has(ep) && Number.isFinite(t) && t >= lo && t <= hi) raw.push({ ep, t })
      })
    }
  }

  // 同刻连续集合并为批(先行整批/一举多话)
  raw.sort((a, b) => a.t - b.t || a.ep - b.ep)
  const out: Occurrence[] = []
  for (const r of raw) {
    const last = out[out.length - 1]
    if (last && last.t === r.t && r.ep === last.epEnd + 1) last.epEnd = r.ep
    else out.push({ ep: r.ep, epEnd: r.ep, t: r.t })
  }
  return out
}

/** 已完结:最后一集已播(校正感知),或 bangumi-data 标了 end 且无人工校正 */
export function hasEnded(s: Show, now: number): boolean {
  const total = totalEps(s)
  if (total) {
    const t = epTime(s, total)
    if (t !== null) return t < now
  }
  return !!(s.end && s.end < now && !s.airFix)
}

/** 集数标签:"03" 或 "01-06" */
export function epLabel(o: Occurrence): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return o.epEnd > o.ep ? `${p(o.ep)}-${p(o.epEnd)}` : p(o.ep)
}
