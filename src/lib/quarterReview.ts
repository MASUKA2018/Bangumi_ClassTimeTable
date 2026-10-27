import type { Show, Tracking } from '../types'
import { occurrencesBetween } from './schedule'
import { adjacentSeason, seasonStartOf } from './seasons'
export function quarterReview(shows: Show[], tracking: Tracking, quarter: string, now: number) {
  const lo=seasonStartOf(quarter), hi=Math.min(now,seasonStartOf(adjacentSeason(quarter,1))-1)
  let followed=0, completed=0, watched=0, behind=0, unknown=0
  const unique=[...new Map(shows.map(s=>[s.id,s])).values()]
  for (const show of unique) {
    const status=tracking.status[show.id]
    if (!status) continue
    followed++; if (status==='done') completed++
    if ((!show.begin || show.timePending) && !show.airFix?.epDates && !show.airFix?.anchorAt) unknown++
    if (hi<lo) continue
    for (const o of occurrencesBetween(show,lo,hi)) {
      const seen=Math.max(0,Math.min(tracking.watched[show.id]??0,o.epEnd)-o.ep+1)
      watched+=seen
      if (status==='watching') behind+=o.epEnd-o.ep+1-seen
    }
  }
  return { followed, completed, watched, behind, unknown }
}
