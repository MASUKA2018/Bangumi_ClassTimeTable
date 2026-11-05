import { flushSync } from 'react-dom'

let active = false
let finishSlide: (() => void) | undefined

/** Animate the timetable itself, including WebViews without View Transitions. */
export function withPageSlide(update: () => void, direction: -1 | 1) {
  finishSlide?.()
  const area = document.querySelector<HTMLElement>('.view-area')
  if (!area?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return }
  let applied = false
  let incoming: Animation | undefined
  const outgoing = area.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-direction * 32}px)`, opacity: 0 }], { duration: 100, easing: 'ease-in', fill: 'forwards' })
  const apply = () => { if (!applied) { applied = true; flushSync(update) } }
  const finish = () => { outgoing.cancel(); incoming?.cancel(); apply(); if (finishSlide === finish) finishSlide = undefined }
  finishSlide = finish
  outgoing.finished.then(() => {
    apply(); outgoing.cancel()
    incoming = area.animate([{ transform: `translateX(${direction * 48}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' })
    return incoming.finished
  }).then(() => { if (finishSlide === finish) finishSlide = undefined }).catch(() => {})
}

/**
 * 视图/翻页切换用 View Transitions API 做真正的交叉淡化:
 * 旧画面淡出与新画面淡入同时进行,任何时刻都没有"暗帧",
 * 消除"内容瞬间替换再补一次淡入"造成的闪烁感。
 *
 * - 不支持的浏览器 / 系统减弱动态偏好 → 直接执行(瞬时切换)
 * - 连续快速翻页(上一次还没播完)→ 跳过动画直接更新,保持跟手
 */
export function withViewTransition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }
  if (!doc.startViewTransition || active || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  active = true
  const t = doc.startViewTransition(() => flushSync(update))
  t.finished.finally(() => {
    active = false
  })
}
