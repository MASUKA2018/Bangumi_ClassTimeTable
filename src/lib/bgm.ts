/**
 * Bangumi 账号(个人令牌)登录与追番双向同步。
 *
 * 令牌在 https://next.bgm.tv/demo/access-token 生成,存于独立的 localStorage 键:
 * 备份导出只读 btt:v1,令牌天然不会进备份文件。
 * 将来接 OAuth 一键登录(需注册应用 + Worker 保管 secret)只是替换"取得令牌"这一步,
 * 本文件其余逻辑照用。
 *
 * 同步语义:
 *  - 应用内改动 → 立即入队,防抖后逐条写回(bgm API 无删除收藏,本地取消追番不回写)
 *  - bgm 侧改动 → 定期拉取合并,以 bgm 为准(队列里还没推出去的条目除外)
 *  - 首次连接 → 双向合并:状态本机优先、进度取较大值,差异推回 bgm
 *  - 搁置与 Bangumi 收藏 type=4 双向同步，保留进度
 */
import type { BgmAccount, CollectMemo, Tracking, WatchStatus } from '../types'
import { remoteFetch } from './native'
import { clearCacheKey, readCache, writeCache } from './api'
import { continuousEpisodeProgress, planEpisodeProgress, type BgmEpisodeCollection } from './bgmEpisodes'

const API = 'https://api.bgm.tv'
const ACC_KEY = 'btt:bgm'
const QUEUE_KEY = 'btt:bgm:queue'
const CONFIRMED_KEY = 'btt:bgm:confirmed:v1'
export const BGM_SYNC_INTERVAL = 5 * 60_000
const PULL_TTL = 60_000
let remoteRevision = 0
/** 「看过」全量可达上千条,只拉到最早归档季(2024Q4)之前一点为止 */
const DONE_CUTOFF = '2024-09-01'

export const STATUS_TO_TYPE: Record<WatchStatus, number> = { wish: 1, done: 2, watching: 3, paused: 4, dropped: 5 }
const TYPE_TO_STATUS: Record<number, WatchStatus> = { 1: 'wish', 2: 'done', 3: 'watching', 4: 'paused', 5: 'dropped' }

export function loadAccount(): BgmAccount | null {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveAccount(a: BgmAccount | null) {
  try {
    if (a) localStorage.setItem(ACC_KEY, JSON.stringify(a))
    else localStorage.removeItem(ACC_KEY)
  } catch {}
}

/** 401/403:令牌无效或已吊销,上层据此置 invalid 而非无限重试 */
export class BgmAuthError extends Error {}

async function authed(token: string, path: string, init?: RequestInit): Promise<Response> {
  const resp = await remoteFetch(API + path, {
    cache: 'no-store', // Personal progress must bypass the webview's HTTP cache too.
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (resp.status === 401 || resp.status === 403) throw new BgmAuthError(`HTTP ${resp.status}`)
  return resp
}

/** 校验令牌并取回身份(GET /v0/me) */
export async function verifyToken(token: string): Promise<Pick<BgmAccount, 'username' | 'nickname' | 'avatar'>> {
  const resp = await authed(token, '/v0/me')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const u = await resp.json()
  return { username: u.username, nickname: u.nickname || u.username, avatar: u.avatar?.small }
}

export interface RemotePull {
  status: Record<number, WatchStatus>
  watched: Record<number, number>
  rates: Record<number, number>
  memos: Record<number, CollectMemo>
  onHold: number[]
  /** A failed chapter read is unknown, never a zero-progress snapshot. */
  issues?: Record<number, string>
  updatedAt?: Record<number, number>
  checkedProgress?: number[]
  observed?: Record<number, number>
  pulledAt?: number
}

interface ProgressProof { value: number; rewind: boolean; confirmedAt: number }
interface ConfirmedState { username: string; progress: Record<number, ProgressProof> }
let volatileConfirmed: ConfirmedState | null = null

function loadConfirmed(username: string): Record<number, ProgressProof> {
  try {
    const saved: ConfirmedState | null = volatileConfirmed ?? JSON.parse(localStorage.getItem(CONFIRMED_KEY) ?? 'null')
    return saved?.username === username ? { ...saved.progress } : {}
  } catch { return {} }
}

function saveConfirmed(username: string, progress: Record<number, ProgressProof>) {
  const saved = { username, progress }
  try {
    if (Object.keys(progress).length) localStorage.setItem(CONFIRMED_KEY, JSON.stringify(saved))
    else localStorage.removeItem(CONFIRMED_KEY)
    volatileConfirmed = null
  } catch { volatileConfirmed = saved }
}

/** Keep a verified local write safe until a subsequent full pull agrees with it. */
function checkConfirmed(acc: BgmAccount, remote: RemotePull) {
  const proofs = loadConfirmed(acc.username), queued = queuedIds()
  for (const [id, proof] of Object.entries(proofs)) {
    if (queued.has(Number(id))) continue
    const actual = remote.watched[Number(id)]
    // A genuinely newer cloud edit (including a reset on the other device)
    // supersedes our receipt. Compare server time, not the machines' timezones.
    const newer = (remote.updatedAt?.[Number(id)] ?? 0) > proof.confirmedAt
    if (actual !== undefined && (actual === proof.value || (!proof.rewind && actual > proof.value) || newer)) {
      delete proofs[Number(id)]
    } else {
      delete remote.watched[Number(id)]
      ;(remote.issues ??= {})[Number(id)] ??= `番剧 ${id} 云端与刚上传的进度不一致，已保留本机记录，请稍后重试`
    }
  }
  saveConfirmed(acc.username, proofs)
}

/** Fresh episode states, paginated to include long-running shows and progress resets. */
async function fetchEpisodeCollections(acc: BgmAccount, id: number): Promise<{ items: BgmEpisodeCollection[]; checkedAt: number }> {
  const items: BgmEpisodeCollection[] = []
  let checkedAt = Math.floor(Date.now() / 1000) * 1000
  for (let page = 0, offset = 0; page < 100; page++, offset += 1000) {
    const resp = await authed(acc.token, `/v0/users/-/collections/${id}/episodes?episode_type=0&limit=1000&offset=${offset}`)
    if (!resp.ok) throw new Error(`番剧 ${id} 章节读取失败: HTTP ${resp.status}`)
    const serverTime = Date.parse(resp.headers.get('Date') ?? '')
    if (Number.isFinite(serverTime)) checkedAt = serverTime
    const data = await resp.json()
    // Go encodes its nil slice as null when a subject has no chapters yet.
    if (data.data === null && data.total === 0) return { items, checkedAt }
    if (!Array.isArray(data.data) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error(`番剧 ${id} 章节数据无效`)
    if (!data.data.every((item: BgmEpisodeCollection) => item?.episode && Number.isSafeInteger(item.episode.id)
      && typeof item.episode.type === 'number' && typeof item.episode.sort === 'number' && typeof item.type === 'number')) {
      throw new Error(`番剧 ${id} 章节数据无效`)
    }
    items.push(...data.data)
    if (offset + data.data.length >= data.total) return { items, checkedAt }
    if (data.data.length !== 1000) throw new Error(`番剧 ${id} 章节数据不完整`)
  }
  throw new Error(`番剧 ${id} 章节数量超出安全上限`)
}

/** Personal progress has a short cache; startup/manual/focus/online refreshes bypass it. */
export async function pullCollections(acc: BgmAccount, force = false, attempt = 0): Promise<RemotePull> {
  const revision = remoteRevision
  const key = `bgm:pull:v4:${acc.username}`
  const confirming = loadConfirmed(acc.username)
  if (!force && !Object.keys(confirming).length) {
    const hit = readCache<RemotePull>(key, PULL_TTL)
    if (hit) return hit
  }
  const out: RemotePull = { status: {}, watched: {}, rates: {}, memos: {}, onHold: [] }
  for (const type of [3, 1, 4, 5, 2]) {
    const maxPages = type === 2 ? 20 : 10
    for (let page = 0, offset = 0; page < maxPages; page++, offset += 50) {
      const resp = await authed(
        acc.token,
        `/v0/users/${encodeURIComponent(acc.username)}/collections?subject_type=2&type=${type}&limit=50&offset=${offset}`,
      )
      if (!resp.ok) throw new Error(`拉取收藏(type=${type}): HTTP ${resp.status}`)
      const data = await resp.json()
      if (!Array.isArray(data.data) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error(`收藏数据无效(type=${type})`)
      let pastCutoff = false
      for (const c of data.data) {
        out.status[c.subject_id] = TYPE_TO_STATUS[type]
        const updatedAt = Date.parse(c.updated_at ?? '')
        if (Number.isFinite(updatedAt)) (out.updatedAt ??= {})[c.subject_id] = updatedAt
        if (type === 3 || type === 4 || confirming[c.subject_id]) {
          // The summary can lag behind a confirmed chapter write (including zero).
          // Never use it as a gate for reading the actual episode collection.
          try {
            const { items: chapters } = await fetchEpisodeCollections(acc, c.subject_id)
            if (chapters.length === 0 && c.ep_status > 0) throw new Error(`番剧 ${c.subject_id} 暂无可核对的章节，已保留本机进度`)
            out.watched[c.subject_id] = continuousEpisodeProgress(chapters)
            ;(out.checkedProgress ??= []).push(c.subject_id)
          } catch (error) {
            if (error instanceof BgmAuthError) throw error
            ;(out.issues ??= {})[c.subject_id] = error instanceof Error ? error.message : `番剧 ${c.subject_id} 章节读取失败`
          }
        } else if (Number.isSafeInteger(c.ep_status) && c.ep_status >= 0) {
          out.watched[c.subject_id] = c.ep_status
        }
        if (c.rate > 0) out.rates[c.subject_id] = c.rate
        const memo: CollectMemo = {}
        if (Array.isArray(c.tags) && c.tags.length > 0) memo.tags = c.tags
        if (c.comment) memo.comment = c.comment
        if (c.private) memo.private = true
        if (Object.keys(memo).length > 0) out.memos[c.subject_id] = memo
        if (type === 2 && (c.updated_at ?? '9999') < DONE_CUTOFF) pastCutoff = true
      }
      if (offset + 50 >= (data.total ?? 0) || pastCutoff) break
    }
  }
  if (revision !== remoteRevision) {
    if (attempt >= 2) throw new Error('同步期间有新进度上传，请稍后重试')
    return pullCollections(acc, true, attempt + 1)
  }
  out.observed = { ...out.watched }
  out.pulledAt = Date.now()
  checkConfirmed(acc, out)
  // Partial failures must be retried, not reused as a successful cached snapshot.
  if (!Object.keys(out.issues ?? {}).length) writeCache(key, out)
  return out
}

export function clearPullCache(username: string) {
  clearCacheKey(`bgm:pull:${username}`)
  clearCacheKey(`bgm:pull:v2:${username}`)
  clearCacheKey(`bgm:pull:v3:${username}`)
  clearCacheKey(`bgm:pull:v4:${username}`)
}

// ── 写回队列(localStorage,断网/刷新不丢) ──────────────────────────

export interface PushPatch {
  type: number
  ep?: number
  rewind?: boolean // Only an explicit local decrease may clear later watched episodes.
  rate?: number // 0 = 清除评分
  tags?: string[]
  comment?: string // '' = 清空吐槽
  private?: boolean
  tries?: number
  retryAt?: number
  revision?: number
  lastError?: string
}
type Queue = Record<string, PushPatch>
let volatileQueue: Queue | null = null

function loadQueue(): Queue {
  if (volatileQueue) return JSON.parse(JSON.stringify(volatileQueue))
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function saveQueue(q: Queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    volatileQueue = null
  } catch {
    // Still protect local edits against a cloud pull if disk/quota is unavailable.
    volatileQueue = JSON.parse(JSON.stringify(q))
  }
}

export function enqueuePush(id: number, patch: Omit<PushPatch, 'tries' | 'retryAt' | 'revision'>) {
  const q = loadQueue()
  q[id] = { ...q[id], ...patch, tries: 0, retryAt: undefined, lastError: undefined, revision: (q[id]?.revision ?? 0) + 1 }
  saveQueue(q)
}

export function queuedIds(): Set<number> {
  return new Set(Object.keys(loadQueue()).map(Number))
}

export function clearQueue() {
  queueGeneration++
  volatileQueue = null
  volatileConfirmed = null
  try {
    localStorage.removeItem(QUEUE_KEY)
    localStorage.removeItem(CONFIRMED_KEY)
  } catch {}
}

let queueGeneration = 0
let drainTask: { username: string; generation: number; promise: Promise<DrainResult> } | null = null

export interface DrainResult {
  uploaded: number
  pending: number
  error?: string
  nextRetryAt?: number
  confirmedProgress: Record<number, number>
}

async function writeEpisodeProgress(acc: BgmAccount, id: number, patch: PushPatch, current: () => boolean): Promise<{ progress: number; confirmedAt: number }> {
  const target = patch.ep!
  const { items } = await fetchEpisodeCollections(acc, id)
  if (!current()) throw new Error('进度已修改，等待上传最新改动')
  const plan = planEpisodeProgress(items, target, patch.rewind === true)
  for (const [type, ids] of [[2, plan.watched], [0, plan.unwatched]] as const) {
    for (let i = 0; i < ids.length; i += 100) {
      if (!current()) throw new Error('进度已修改，等待上传最新改动')
      const resp = await authed(acc.token, `/v0/users/-/collections/${id}/episodes`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: ids.slice(i, i + 100), type }),
      })
      if (!resp.ok) throw new Error(`番剧 ${id} 集数上传失败: HTTP ${resp.status}`)
      remoteRevision++; clearPullCache(acc.username)
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!current()) throw new Error('进度已修改，等待上传最新改动')
  const snapshot = await fetchEpisodeCollections(acc, id)
  const verified = continuousEpisodeProgress(snapshot.items)
  if (verified < target || (patch.rewind && verified !== target)) throw new Error(`番剧 ${id} 集数尚未确认，已保留等待重试`)
  return { progress: verified, confirmedAt: snapshot.checkedAt }
}

/** Metadata uses POST; anime progress uses the episode PATCH API and is read back. */
export function drainQueue(acc: BgmAccount, force = false, onlyId?: number): Promise<DrainResult> {
  if (drainTask) {
    if (onlyId === undefined && drainTask.username === acc.username && drainTask.generation === queueGeneration) return drainTask.promise
    return drainTask.promise.catch(() => undefined).then(() => drainQueue(acc, force, onlyId))
  }
  const generation = queueGeneration
  const promise = (async (): Promise<DrainResult> => {
    const result: DrainResult = { uploaded: 0, pending: 0, confirmedProgress: {} }
    const ids = Object.keys(loadQueue())
    for (const id of ids) {
      if (onlyId !== undefined && Number(id) !== onlyId) continue
      if (generation !== queueGeneration) break
      const patch = loadQueue()[id]
      if (!patch || (!force && (patch.retryAt ?? 0) > Date.now())) continue
      const current = () => generation === queueGeneration && loadQueue()[id]?.revision === patch.revision
      const body: Record<string, unknown> = { type: patch.type }
      if (patch.rate !== undefined) body.rate = patch.rate
      if (patch.tags !== undefined) body.tags = patch.tags
      if (patch.comment !== undefined) body.comment = patch.comment
      if (patch.private !== undefined) body.private = patch.private
      try {
        const resp = await authed(acc.token, `/v0/users/-/collections/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!resp.ok) throw new Error(`番剧 ${id} 收藏上传失败: HTTP ${resp.status}`)
        remoteRevision++; clearPullCache(acc.username)
        const verified = patch.ep === undefined ? undefined : await writeEpisodeProgress(acc, Number(id), patch, current)
        if (current()) {
          if (verified !== undefined) {
            const proofs = loadConfirmed(acc.username)
            proofs[Number(id)] = { value: verified.progress, rewind: patch.rewind === true, confirmedAt: verified.confirmedAt }
            saveConfirmed(acc.username, proofs)
          }
          const q = loadQueue(); delete q[id]; saveQueue(q)
          result.uploaded++
          if (verified !== undefined) result.confirmedProgress[Number(id)] = verified.progress
        }
      } catch (e) {
        if (e instanceof BgmAuthError) throw e
        if (current()) {
          const q = loadQueue()
          q[id].tries = Math.min((q[id].tries ?? 0) + 1, 1000)
          q[id].retryAt = Date.now() + Math.min(30 * 60_000, 15_000 * 2 ** Math.min(q[id].tries! - 1, 7))
          saveQueue(q)
          result.error = e instanceof Error ? e.message : '网络或服务器错误'
          q[id].lastError = result.error
          saveQueue(q)
        }
      }
      await new Promise((r) => setTimeout(r, 250)) // 写接口逐条慢速,不冲 API
    }
    if (generation === queueGeneration) {
      const pending = Object.values(loadQueue())
      result.pending = pending.length
      if (pending.length) result.nextRetryAt = Math.min(...pending.map(patch => patch.retryAt ?? Date.now() + 1500))
      if (volatileQueue) result.error = '本机同步队列未能写入磁盘，请保持客户端运行并导出备份。' + (result.error ? ` ${result.error}` : '')
    }
    return result
  })().finally(() => { if (drainTask?.promise === promise) drainTask = null })
  drainTask = { username: acc.username, generation, promise }
  return promise
}

export async function readSubjectProgress(acc: BgmAccount, id: number): Promise<number> {
  return continuousEpisodeProgress((await fetchEpisodeCollections(acc, id)).items)
}
/** Explicitly resolving ONE subject must leave all other queued edits intact. */
export function discardSubjectPush(username: string, id: number) {
  queueGeneration++
  const q = loadQueue(), old = q[id]
  // Progress resolution must not silently lose a pending rating/private comment.
  if (old && [old.rate, old.tags, old.comment, old.private].some(x => x !== undefined)) {
    q[id] = { ...old, ep: undefined, rewind: undefined, tries: 0, retryAt: undefined, lastError: undefined, revision: (old.revision ?? 0) + 1 }
  } else delete q[id]
  saveQueue(q)
  const proofs = loadConfirmed(username); delete proofs[id]; saveConfirmed(username, proofs)
  clearPullCache(username)
}
export interface SyncDetail { id: number; local: number; cloud?: number; state: 'pending' | 'conflict' | 'verified' | 'unknown'; error?: string; retryAt?: number }
export function syncDetails(local: Tracking, remote: RemotePull | null): SyncDetail[] {
  const q = loadQueue()
  return [...new Set([...Object.keys(local.status), ...Object.keys(local.watched), ...Object.keys(remote?.status ?? {}), ...Object.keys(q)])].map(Number).map(id => {
    const cloud = remote?.observed?.[id] ?? remote?.watched[id]
    const value = local.watched[id] ?? 0
    const error = q[id]?.lastError ?? remote?.issues?.[id]
    return { id, local: value, cloud, error, retryAt: q[id]?.retryAt,
      state: q[id] ? 'pending' as const : error || (cloud !== undefined && cloud !== value) ? 'conflict' as const
        : remote?.checkedProgress?.includes(id) && cloud === value ? 'verified' as const : 'unknown' as const }
  })
}

/**
 * 云端状态合并进本机。
 * 首次连接:状态本机优先、进度取较大值,差异作为 pushes 返回(推回 bgm)。
 * 此后:bgm 为准(写回队列里尚未推送的条目除外)，明确的零进度也同步。
 * 升级后的首次修复只补传本机较大的历史进度，不自动倒退云端进度。
 */
export function mergeRemote(
  local: Tracking,
  remote: RemotePull,
  firstMerge: boolean,
  queued: Set<number>,
  repairProgress = false,
): { tracking: Tracking; pushes: Record<number, PushPatch> } {
  const status = { ...local.status }
  const watched = { ...local.watched }
  const rates = { ...local.rates }
  const memos = { ...local.memos }
  const pushes: Record<number, PushPatch> = {}
  // 兼容旧版缓存/调用者的 onHold 数组。
  const remoteStatus = { ...remote.status }
  for (const id of remote.onHold ?? []) remoteStatus[id] ??= 'paused'

  const ids = new Set<number>(Object.keys(remoteStatus).map(Number))
  if (firstMerge) for (const k of Object.keys(local.status)) ids.add(Number(k))
  if (repairProgress) for (const k of Object.keys(local.watched)) ids.add(Number(k))

  for (const id of ids) {
    if (queued.has(id) || remote.issues?.[id]) continue
    const rs = remoteStatus[id]
    const rw = remote.watched[id] ?? 0
    const rr = remote.rates[id] ?? 0
    const rm = remote.memos[id]
    if (firstMerge) {
      const ls = local.status[id]
      const merged = ls ?? rs
      const mw = Math.max(local.watched[id] ?? 0, rw)
      const mr = local.rates[id] ?? rr // 评分:本机优先
      const lm = local.memos[id] // 标签/吐槽:本机有就优先
      const mm = lm ?? rm
      if (merged) status[id] = merged
      if (mw > 0) watched[id] = mw
      if (mr > 0) rates[id] = mr
      if (mm) memos[id] = mm
      const memoDiff = lm && JSON.stringify(lm) !== JSON.stringify(rm ?? {})
      if (merged && (merged !== rs || mw > rw || (mr > 0 && mr !== rr) || memoDiff)) {
        pushes[id] = {
          type: STATUS_TO_TYPE[merged],
          ...(mw > rw ? { ep: mw } : {}),
          ...(mr > 0 && mr !== rr ? { rate: mr } : {}),
          ...(memoDiff
            ? { tags: lm.tags ?? [], comment: lm.comment ?? '', private: lm.private ?? false }
            : {}),
        }
      }
    } else {
      if (rs) status[id] = rs
      if (Object.prototype.hasOwnProperty.call(remote.watched, id)) watched[id] = rw
      if (rr > 0) rates[id] = rr
      if (rs) {
        if (rm) memos[id] = rm
        else delete memos[id] // bgm 为准:云端清空了就清空
      }
      if (repairProgress && (local.watched[id] ?? 0) > rw) {
        const type = rs ?? local.status[id] ?? 'watching'
        watched[id] = local.watched[id]
        pushes[id] = { type: STATUS_TO_TYPE[type], ep: watched[id], rewind: false }
      }
    }
  }
  return { tracking: { status, watched, rates, memos }, pushes }
}
