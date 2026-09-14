import { describe, expect, it } from 'vitest'
import { normalizeBgmImageUrl } from './api'

describe('normalizeBgmImageUrl', () => {
  it('upgrades legacy Bangumi cover URLs used by the live calendar', () => {
    expect(normalizeBgmImageUrl('http://lain.bgm.tv/pic/cover/c/a1/d3/example.jpg')).toBe(
      'https://lain.bgm.tv/pic/cover/c/a1/d3/example.jpg',
    )
    expect(normalizeBgmImageUrl('//lain.bgm.tv/pic/cover/c/a1/d3/example.jpg')).toBe(
      'https://lain.bgm.tv/pic/cover/c/a1/d3/example.jpg',
    )
  })

  it('keeps existing HTTPS and missing images unchanged', () => {
    expect(normalizeBgmImageUrl('https://lain.bgm.tv/r/400/pic/cover/example.jpg')).toBe(
      'https://lain.bgm.tv/r/400/pic/cover/example.jpg',
    )
    expect(normalizeBgmImageUrl()).toBeUndefined()
  })
})
