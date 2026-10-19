import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockStorage } from './testStorage'
import { remoteFetch } from './native'
import { clearQueue, drainQueue, enqueuePush, mergeRemote, pullCollections, queuedIds, syncDetails, discardSubjectPush } from './bgm'
import type { BgmAccount, Tracking } from '../types'
import type { BgmEpisodeCollection } from './bgmEpisodes'
vi.mock('./native', () => ({ remoteFetch: vi.fn() }))

const account: BgmAccount = { username: 'reader', nickname: 'Reader', token: 'local-test-token', mergedOnce: true, episodeSyncVersion: 1 }
const fetch = vi.mocked(remoteFetch)
let episodes: BgmEpisodeCollection[]
let collected: boolean
let collectionType: number
let failPatch: boolean
let ignorePatch: boolean
let posts: Record<string, unknown>[]
let patches: { episode_id: number[]; type: number }[]

const makeEpisodes = (count: number, watched = 0) => Array.from({ length: count }, (_, i) => ({
  episode: { id: i + 101, type: 0, sort: i + 1, ep: i + 1 }, type: i < watched ? 2 : 0,
}))
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

async function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${account.token}`)
  if (init?.method === 'POST') {
    const body = JSON.parse(String(init.body))
    posts.push(body)
    // The official API rejects ep_status on non-book subjects.
    if ('ep_status' in body) return new Response(null, { status: 400 })
    collected = true; collectionType = body.type
    return new Response(null, { status: 204 })
  }
  if (init?.method === 'PATCH') {
    const body = JSON.parse(String(init.body))
    patches.push(body)
    if (failPatch) return new Response(null, { status: 503 })
    if (!collected) return new Response(null, { status: 400 })
    if (!ignorePatch) for (const id of body.episode_id) episodes.find(item => item.episode.id === id)!.type = body.type
    return new Response(null, { status: 204 })
  }
  if (url.pathname.endsWith('/episodes')) {
    expect(url.searchParams.get('episode_type')).toBe('0')
    const items = episodes.filter(item => item.episode.type === 0)
    const offset = Number(url.searchParams.get('offset'))
    return response({ data: items.slice(offset, offset + 1000), total: items.length })
  }
  const data = collected && Number(url.searchParams.get('type')) === collectionType
    ? [{ subject_id: 1, ep_status: episodes.filter(item => item.type === 2).length, rate: 0, tags: [], comment: '', private: false, updated_at: '2026-10-13' }] : []
  return response({ data, total: data.length })
}

async function finish<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(value => ({ value }), error => ({ error }))
  await vi.runAllTimersAsync()
  const outcome = await settled
  if ('error' in outcome) throw outcome.error
  return outcome.value
}

beforeEach(() => {
  mockStorage(); clearQueue(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  episodes = makeEpisodes(12); collected = true; collectionType = 3; failPatch = false; ignorePatch = false; posts = []; patches = []
  fetch.mockReset(); fetch.mockImplementation(server)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('anime progress uploads', () => {
  it('creates the collection first, writes episode IDs 1–3, and verifies them', async () => {
    collected = false
    enqueuePush(1, { type: 3, ep: 3, rate: 7, tags: ['anime'], comment: 'test', private: true })
    const result = await finish(drainQueue(account))
    expect(posts).toEqual([{ type: 3, rate: 7, tags: ['anime'], comment: 'test', private: true }])
    expect(patches).toEqual([{ type: 2, episode_id: [101, 102, 103] }])
    expect(result).toMatchObject({ uploaded: 1, pending: 0, confirmedProgress: { 1: 3 } })
    expect(queuedIds().size).toBe(0)
  })

  it('syncs client A progress 3 into client B despite B having a cached 0', async () => {
    const storageB = localStorage
    const before = await pullCollections(account)
    expect(before.watched[1]).toBe(0)
    mockStorage() // Device A has its own local storage, but the simulated cloud is shared.
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    vi.stubGlobal('localStorage', storageB)
    const remote = await pullCollections(account, true)
    const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 0 }, rates: {}, memos: {} }
    expect(mergeRemote(local, remote, false, new Set()).tracking.watched[1]).toBe(3)
    expect(patches).toHaveLength(1)
  })

  it('does not roll an acknowledged upload back when the collection summary still says zero', async () => {
    fetch.mockImplementation(async (input, init) => {
      const result = await server(input, init)
      if (!init?.method && !new URL(String(input)).pathname.endsWith('/episodes')) {
        const data = await result.json()
        for (const item of data.data) item.ep_status = 0
        return response(data)
      }
      return result
    })
    enqueuePush(1, { type: 3, ep: 3 })
    const uploaded = await finish(drainQueue(account, true))
    expect(uploaded.confirmedProgress[1]).toBe(3)
    const remote = await pullCollections(account, true)
    const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 3 }, rates: {}, memos: {} }
    expect(mergeRemote(local, remote, false, queuedIds()).tracking.watched[1]).toBe(3)
  })

  it('reads chapter states for a watching subject even when its aggregate is absent', async () => {
    episodes = makeEpisodes(12, 3)
    fetch.mockImplementation(async (input, init) => {
      const result = await server(input, init)
      if (!init?.method && !new URL(String(input)).pathname.endsWith('/episodes')) {
        const data = await result.json()
        for (const item of data.data) delete item.ep_status
        return response(data)
      }
      return result
    })
    expect((await pullCollections(account, true)).watched[1]).toBe(3)
  })

  it('invalidates its own old pull cache after an upload', async () => {
    episodes = makeEpisodes(12, 1)
    expect((await pullCollections(account)).watched[1]).toBe(1)
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    expect((await pullCollections(account)).watched[1]).toBe(3)
  })

  it('expires personal progress cache after one minute, not an hour', async () => {
    episodes = makeEpisodes(12, 1)
    await pullCollections(account)
    episodes = makeEpisodes(12, 3)
    vi.advanceTimersByTime(61_000)
    expect((await pullCollections(account)).watched[1]).toBe(3)
  })

  it('does not mistake SPs or watched later episodes for continuous progress', async () => {
    episodes = makeEpisodes(5, 1)
    episodes[2].type = 2
    episodes.push({ episode: { id: 999, type: 1, sort: 1 }, type: 2 })
    expect((await pullCollections(account, true)).watched[1]).toBe(1)
  })

  it('never rewinds a newer cloud progress on an ordinary advance', async () => {
    episodes = makeEpisodes(12, 5)
    enqueuePush(1, { type: 3, ep: 3, rewind: false })
    const result = await finish(drainQueue(account))
    expect(patches).toEqual([])
    expect(result.confirmedProgress[1]).toBe(5)
  })

  it('supports explicit decreases and zero without touching SP or OP', async () => {
    episodes = makeEpisodes(5, 5)
    episodes.push({ episode: { id: 900, type: 1, sort: 1 }, type: 2 }, { episode: { id: 901, type: 2, sort: 1 }, type: 2 })
    enqueuePush(1, { type: 4, ep: 3, rewind: true })
    expect((await finish(drainQueue(account))).confirmedProgress[1]).toBe(3)
    expect(patches).toEqual([{ type: 0, episode_id: [104, 105] }])
    enqueuePush(1, { type: 4, ep: 0, rewind: true })
    expect((await finish(drainQueue(account))).confirmedProgress[1]).toBe(0)
    const remote = await pullCollections(account, true)
    expect(remote.status[1]).toBe('paused'); expect(remote.watched[1]).toBe(0)
    expect(episodes.filter(item => item.episode.id >= 900).every(item => item.type === 2)).toBe(true)
  })

  it('paginates more than 1000 episodes and sends bounded batches', async () => {
    episodes = makeEpisodes(1002)
    enqueuePush(1, { type: 3, ep: 1001 })
    const result = await finish(drainQueue(account))
    expect(result.confirmedProgress[1]).toBe(1001)
    expect(patches).toHaveLength(11)
    expect(patches.every(patch => patch.episode_id.length <= 100)).toBe(true)
    expect(episodes[1001].type).toBe(0)
  })

  it('does not report success if the API accepted but failed to apply episode changes', async () => {
    ignorePatch = true
    enqueuePush(1, { type: 3, ep: 3 })
    const result = await finish(drainQueue(account))
    expect(result).toMatchObject({ uploaded: 0, pending: 1 })
    expect(result.error).toContain('尚未确认')
  })

  it('preserves progress when Bangumi has not recorded the requested episode yet', async () => {
    episodes = makeEpisodes(2)
    enqueuePush(1, { type: 3, ep: 3 })
    const result = await finish(drainQueue(account))
    expect(result.pending).toBe(1); expect(result.error).toContain('第 3 集')
    expect(patches).toEqual([])
  })
})

describe('persistent retry queue and concurrency', () => {
  it('protects in-memory edits and reports when queue persistence is unavailable', async () => {
    const persist = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'btt:bgm:queue') throw new Error('quota')
      persist(key, value)
    })
    failPatch = true
    enqueuePush(1, { type: 3, ep: 3 })
    const result = await finish(drainQueue(account))
    expect(result.pending).toBe(1); expect(result.error).toContain('未能写入磁盘')
    expect(queuedIds().has(1)).toBe(true)
    const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 3 }, rates: {}, memos: {} }
    expect(mergeRemote(local, { status: { 1: 'watching' }, watched: { 1: 0 }, rates: {}, memos: {}, onHold: [] }, false, queuedIds()).tracking.watched[1]).toBe(3)
    vi.restoreAllMocks()
  })
  it('retains failed uploads after more than five attempts and applies backoff', async () => {
    failPatch = true
    enqueuePush(1, { type: 3, ep: 3 })
    for (let i = 0; i < 6; i++) expect((await finish(drainQueue(account, true))).pending).toBe(1)
    expect(queuedIds().has(1)).toBe(true)
    const calls = fetch.mock.calls.length
    await finish(drainQueue(account))
    expect(fetch.mock.calls).toHaveLength(calls)
    failPatch = false
    expect((await finish(drainQueue(account, true))).pending).toBe(0)
  })

  it('retains a network failure until connection returns', async () => {
    fetch.mockRejectedValueOnce(new TypeError('offline'))
    enqueuePush(1, { type: 3, ep: 3 })
    expect((await finish(drainQueue(account))).pending).toBe(1)
    expect((await finish(drainQueue(account, true))).confirmedProgress[1]).toBe(3)
  })

  it('keeps unauthorized work queued and does not continue requests', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 401 }))
    enqueuePush(1, { type: 3, ep: 3 })
    await expect(finish(drainQueue(account))).rejects.toThrow('HTTP 401')
    expect(queuedIds().has(1)).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('waits for an existing upload rather than pretending it already finished', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    fetch.mockImplementationOnce(async (input, init) => { await gate; return server(input, init) })
    enqueuePush(1, { type: 3, ep: 3 })
    const first = drainQueue(account)
    expect(drainQueue(account)).toBe(first)
    release()
    expect((await finish(first)).confirmedProgress[1]).toBe(3)
  })

  it('cannot delete a newer edit queued while an older request is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    fetch.mockImplementationOnce(async (input, init) => { await gate; return server(input, init) })
    enqueuePush(1, { type: 3, ep: 3 })
    const first = drainQueue(account)
    enqueuePush(1, { type: 3, ep: 4 })
    release()
    expect((await finish(first)).pending).toBe(1)
    expect(patches).toEqual([])
    expect((await finish(drainQueue(account))).confirmedProgress[1]).toBe(4)
  })

  it('stops subsequent episode writes if the account queue is cleared', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    fetch.mockImplementationOnce(async (input, init) => { await gate; return server(input, init) })
    enqueuePush(1, { type: 3, ep: 3 })
    const first = drainQueue(account)
    clearQueue(); release()
    await finish(first)
    expect(patches).toEqual([]); expect(queuedIds().size).toBe(0)
  })

  it('retries a pull whose snapshot became stale during a concurrent upload', async () => {
    episodes = makeEpisodes(12, 1)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    fetch.mockImplementationOnce(async (input, init) => { const snapshot = await server(input, init); await gate; return snapshot })
    const pulling = pullCollections(account, true)
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    release()
    expect((await pulling).watched[1]).toBe(3)
    expect(fetch.mock.calls.filter(([input]) => String(input).includes('collections?subject_type=2&type=3'))).toHaveLength(2)
  })
})

describe('legacy progress migration', () => {
  const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 3 }, rates: {}, memos: {} }
  const remote = { status: { 1: 'paused' as const }, watched: { 1: 0 }, rates: {}, memos: {}, onHold: [] }
  it('repairs the old ignored uploads without changing cloud status or lowering progress', () => {
    const result = mergeRemote(local, remote, false, new Set(), true)
    expect(result.tracking.status[1]).toBe('paused')
    expect(result.pushes[1]).toEqual({ type: 4, ep: 3, rewind: false })
  })
  it('accepts an explicit zero from another device after migration', () => {
    expect(mergeRemote(local, remote, false, new Set(), false).tracking.watched[1]).toBe(0)
  })
  it('does not overwrite locally queued progress with an old remote value', () => {
    const result = mergeRemote(local, remote, false, new Set([1]))
    expect(result.tracking.watched[1]).toBe(3)
    expect(result.pushes).toEqual({})
  })
})

describe('progress receipts and partial reads', () => {
  const local: Tracking = { status: { 1: 'watching', 2: 'watching' }, watched: { 1: 3, 2: 7 }, rates: {}, memos: {} }

  it('protects a verified upload from a later stale chapter snapshot and retries without caching the failure', async () => {
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    const actual = episodes
    episodes = makeEpisodes(12)
    const stale = await pullCollections(account, true)
    expect(stale.watched[1]).toBeUndefined()
    expect(stale.issues?.[1]).toContain('已保留本机记录')
    const merged = mergeRemote(local, stale, false, queuedIds(), true)
    expect(merged.tracking.watched[1]).toBe(3)
    expect(merged.pushes[1]).toBeUndefined()
    const calls = fetch.mock.calls.length
    episodes = actual
    expect((await pullCollections(account)).watched[1]).toBe(3)
    expect(fetch.mock.calls.length).toBeGreaterThan(calls)
  })

  it('keeps the receipt across a process restart until the cloud pull agrees', async () => {
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    vi.resetModules()
    const restarted = await import('./bgm')
    episodes = makeEpisodes(12)
    const stale = await restarted.pullCollections(account, true)
    expect(stale.watched[1]).toBeUndefined()
    expect(stale.issues?.[1]).toBeTruthy()
    episodes = makeEpisodes(12, 3)
    expect((await restarted.pullCollections(account, true)).watched[1]).toBe(3)
    expect(localStorage.getItem('btt:bgm:confirmed:v1')).toBeNull()
  })

  it('does not let an older snapshot undo an explicit reset to zero', async () => {
    episodes = makeEpisodes(12, 3)
    enqueuePush(1, { type: 3, ep: 0, rewind: true })
    expect((await finish(drainQueue(account))).confirmedProgress[1]).toBe(0)
    episodes = makeEpisodes(12, 3)
    const stale = await pullCollections(account, true)
    expect(mergeRemote({ ...local, watched: { 1: 0 } }, stale, false, queuedIds()).tracking.watched[1]).toBe(0)
    expect(stale.issues?.[1]).toBeTruthy()
  })

  it('accepts a genuinely newer reset on the other device rather than permanently taking the larger number', async () => {
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    episodes = makeEpisodes(12) // Device B resets after A's confirmed write.
    fetch.mockImplementation(async (input, init) => {
      const result = await server(input, init)
      if (!new URL(String(input)).pathname.endsWith('/episodes')) {
        const data = await result.json()
        for (const item of data.data) item.updated_at = '2026-10-13T00:01:00Z'
        return response(data)
      }
      return result
    })
    const remote = await pullCollections(account, true)
    expect(remote.watched[1]).toBe(0)
    expect(remote.issues).toBeUndefined()
    expect(mergeRemote(local, remote, false, queuedIds()).tracking.watched[1]).toBe(0)
  })

  it('uses the server response clock when the client clock is inaccurate', async () => {
    fetch.mockImplementation(async (input, init) => {
      const result = await server(input, init)
      result.headers.set('Date', 'Tue, 13 Oct 2026 01:00:00 GMT')
      return result
    })
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    const proof = JSON.parse(localStorage.getItem('btt:bgm:confirmed:v1')!).progress[1]
    expect(proof.confirmedAt).toBe(Date.parse('2026-10-13T01:00:00Z'))
  })

  it('releases the receipt after agreement so a later intentional decrease still synchronizes', async () => {
    enqueuePush(1, { type: 3, ep: 3 })
    await finish(drainQueue(account))
    expect((await pullCollections(account, true)).watched[1]).toBe(3)
    episodes = makeEpisodes(12)
    const reset = await pullCollections(account, true)
    expect(reset.watched[1]).toBe(0)
    expect(reset.issues).toBeUndefined()
  })

  it('also verifies a just-uploaded completed subject instead of trusting its stale aggregate', async () => {
    enqueuePush(1, { type: 2, ep: 3 })
    await finish(drainQueue(account))
    fetch.mockImplementation(async (input, init) => {
      const result = await server(input, init)
      if (!new URL(String(input)).pathname.endsWith('/episodes')) {
        const data = await result.json()
        for (const item of data.data) item.ep_status = 0
        return response(data)
      }
      return result
    })
    expect((await pullCollections(account, true)).watched[1]).toBe(3)
  })

  it('isolates an inaccessible subject without discarding healthy progress or fabricating zero', async () => {
    episodes = makeEpisodes(12, 3)
    fetch.mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/collections/2/episodes')) return new Response(null, { status: 404 })
      const result = await server(input, init)
      if (url.searchParams.get('type') === '3') {
        const data = await result.json()
        data.data.push({ subject_id: 2, ep_status: 7 })
        data.total++
        return response(data)
      }
      return result
    })
    const remote = await pullCollections(account, true)
    expect(remote.watched[1]).toBe(3)
    expect(remote.watched[2]).toBeUndefined()
    expect(remote.issues?.[2]).toContain('404')
    const merged = mergeRemote(local, remote, false, queuedIds(), true)
    expect(merged.tracking.watched).toEqual({ 1: 3, 2: 7 })
    expect(merged.pushes).toEqual({})
  })

  it('accepts the official null/zero response for a subject with no chapters yet', async () => {
    episodes = []
    fetch.mockImplementation(async (input, init) => new URL(String(input)).pathname.endsWith('/episodes')
      ? response({ data: null, total: 0 }) : server(input, init))
    const remote = await pullCollections(account, true)
    expect(remote.watched[1]).toBe(0)
    expect(remote.issues).toBeUndefined()
  })

  it('does not infer zero if a nonzero summary has no readable chapters', async () => {
    episodes = makeEpisodes(12, 3)
    fetch.mockImplementation(async (input, init) => new URL(String(input)).pathname.endsWith('/episodes')
      ? response({ data: null, total: 0 }) : server(input, init))
    const remote = await pullCollections(account, true)
    expect(remote.watched[1]).toBeUndefined()
    expect(remote.issues?.[1]).toContain('暂无可核对')
    expect(mergeRemote(local, remote, false, queuedIds()).tracking.watched[1]).toBe(3)
  })

  it('rejects an invalid collection response instead of showing an empty successful sync', async () => {
    fetch.mockResolvedValue(response({ error: 'upstream unavailable' }))
    await expect(pullCollections(account, true)).rejects.toThrow('收藏数据无效')
  })
})

describe('per-subject synchronization controls', () => {
  it('retries only the requested subject and leaves another queued subject untouched', async () => {
    enqueuePush(1, { type: 3, ep: 3 }); enqueuePush(2, { type: 3, ep: 4 })
    const result = await finish(drainQueue(account, true, 1))
    expect(result.uploaded).toBe(1); expect(queuedIds()).toEqual(new Set([2]))
    expect(fetch.mock.calls.some(([input]) => String(input).includes('/collections/2'))).toBe(false)
  })
  it('discarding one explicitly resolved subject preserves all other edits', () => {
    enqueuePush(1, { type: 3, ep: 3 }); enqueuePush(2, { type: 3, ep: 4 })
    discardSubjectPush(account.username, 1)
    expect(queuedIds()).toEqual(new Set([2]))
  })
  it('resolving progress keeps a pending rating/comment for the same show', async () => {
    enqueuePush(1, { type: 3, ep: 3, rate: 8, comment: 'test-only comment' })
    discardSubjectPush(account.username, 1)
    expect(queuedIds()).toEqual(new Set([1]))
    await finish(drainQueue(account, true, 1))
    const writes = fetch.mock.calls.filter(([input, init]) => String(input).endsWith('/collections/1') && init?.method === 'POST')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ rate: 8, comment: 'test-only comment' })
    expect(episodes.every(ep => ep.type !== 2)).toBe(true)
  })
  it('shows the actual cloud observation even when a receipt protects local progress', async () => {
    enqueuePush(1, { type: 3, ep: 3 }); await finish(drainQueue(account))
    episodes = makeEpisodes(12)
    const remote = await pullCollections(account, true)
    const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 3 }, rates: {}, memos: {} }
    expect(syncDetails(local, remote)[0]).toMatchObject({ local: 3, cloud: 0, state: 'conflict' })
  })
  it('labels untouched unread subjects unknown, never falsely verified', () => {
    const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 3 }, rates: {}, memos: {} }
    expect(syncDetails(local, null)[0].state).toBe('unknown')
  })
})
