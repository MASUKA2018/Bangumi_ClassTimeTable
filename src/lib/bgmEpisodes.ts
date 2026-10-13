/** The client records a continuous prefix of main-story episodes, not an episode count. */
export interface BgmEpisodeCollection {
  episode: { id: number; type: number; sort: number; ep?: number }
  type: number
}

function numberOf(item: BgmEpisodeCollection): number {
  return (item.episode.ep ?? 0) > 0 ? item.episode.ep! : item.episode.sort
}

export function mainEpisodes(items: BgmEpisodeCollection[]): BgmEpisodeCollection[] {
  return items.filter(item => item.episode?.type === 0 && Number.isSafeInteger(item.episode.id) && item.episode.id > 0
    && Number.isSafeInteger(numberOf(item)) && numberOf(item) > 0)
}

export function continuousEpisodeProgress(items: BgmEpisodeCollection[]): number {
  const groups = new Map<number, boolean>()
  for (const item of mainEpisodes(items)) {
    const n = numberOf(item)
    groups.set(n, (groups.get(n) ?? true) && item.type === 2)
  }
  let progress = 0
  while (groups.get(progress + 1)) progress++
  return progress
}

export function planEpisodeProgress(items: BgmEpisodeCollection[], target: number, rewind: boolean) {
  if (!Number.isSafeInteger(target) || target < 0 || target > 100000) throw new Error('Invalid episode progress')
  const episodes = mainEpisodes(items)
  const numbers = new Set(episodes.map(numberOf))
  for (let n = 1; n <= target; n++) if (!numbers.has(n)) throw new Error(`Bangumi 尚未收录第 ${n} 集，已保留本机进度等待重试`)
  return {
    watched: episodes.filter(item => numberOf(item) <= target && item.type !== 2).map(item => item.episode.id),
    unwatched: rewind ? episodes.filter(item => numberOf(item) > target && item.type === 2).map(item => item.episode.id) : [],
  }
}
