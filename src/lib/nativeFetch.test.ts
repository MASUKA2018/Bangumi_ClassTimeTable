import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { remoteFetch } from './native'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn(async () => new Response('{}')) }))
const native = vi.mocked(nativeFetch)
beforeEach(() => { native.mockClear() })
afterEach(() => { vi.unstubAllGlobals() })

describe('personal HTTP caching on Windows and macOS', () => {
  it('forwards no-store to a normal browser without adding forbidden CORS headers', async () => {
    const browser = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('window', { fetch: browser })
    const init: RequestInit = { cache: 'no-store', headers: { Authorization: 'Bearer test-only' } }
    await remoteFetch('https://api.bgm.tv/v0/me', init)
    expect(browser).toHaveBeenCalledWith('https://api.bgm.tv/v0/me', init)
    expect(native).not.toHaveBeenCalled()
  })

  it('uses explicit native HTTP cache directives and preserves authorization', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    await remoteFetch('https://api.bgm.tv/v0/me', { cache: 'no-store', headers: { Authorization: 'Bearer test-only' } })
    const headers = new Headers(native.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-only')
    expect(headers.get('Cache-Control')).toBe('no-cache, no-store')
    expect(headers.get('Pragma')).toBe('no-cache')
  })

  it('does not mutate caller headers or request body when writing progress', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const headers = { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }
    const body = JSON.stringify({ type: 2, episode_id: [101] })
    await remoteFetch('https://api.bgm.tv/v0/users/-/collections/1/episodes', { method: 'PATCH', cache: 'no-store', headers, body })
    expect(headers).not.toHaveProperty('Cache-Control')
    expect(native.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body })
  })

  it('leaves public data requests and their existing cache policy unchanged', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    await remoteFetch('https://api.bgm.tv/calendar')
    expect(native).toHaveBeenCalledWith('https://api.bgm.tv/calendar', undefined)
  })
})
