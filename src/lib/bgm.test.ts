import { describe, expect, it } from 'vitest'
import { mergeRemote, STATUS_TO_TYPE, type RemotePull } from './bgm'
import type { Tracking } from '../types'
const local: Tracking = { status: { 1: 'watching' }, watched: { 1: 5 }, rates: {}, memos: {} }
const remote: RemotePull = { status: { 1: 'paused' }, watched: { 1: 3 }, rates: {}, memos: {}, onHold: [] }
describe('Bangumi on-hold collections', () => {
  it('maps on-hold to official collection type 4', () => expect(STATUS_TO_TYPE.paused).toBe(4))
  it('uses remote on-hold without discarding progress on subsequent sync', () => {
    const result = mergeRemote(local, { ...remote, watched: {} }, false, new Set())
    expect(result.tracking.status[1]).toBe('paused'); expect(result.tracking.watched[1]).toBe(5)
  })
  it('preserves local-first initial merge including a deliberate on-hold status', () => {
    const result = mergeRemote({ ...local, status: { 1: 'paused' } }, { ...remote, status: { 1: 'watching' } }, true, new Set())
    expect(result.tracking.status[1]).toBe('paused'); expect(result.pushes[1].type).toBe(4)
  })
  it('protects queued local changes and migrates legacy onHold data', () => {
    expect(mergeRemote(local, remote, false, new Set([1])).tracking.status[1]).toBe('watching')
    expect(mergeRemote(local, { ...remote, status: {}, onHold: [1] }, false, new Set()).tracking.status[1]).toBe('paused')
  })
})
