import { useEffect, useRef, useState } from 'react'

type PageDirection = -1 | 1

/** Touch-only paging: scrolling, controls and system edge gestures retain priority. */
export function useSwipePaging(onPage: (direction: PageDirection) => void, enabled: boolean, scope: string) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const latestPage = useRef(onPage)
  latestPage.current = onPage
  const latestEnabled = useRef(enabled)
  latestEnabled.current = enabled

  useEffect(() => {
    if (!element) return
    let gesture: {
      id: number
      x: number
      y: number
      at: number
      horizontal: boolean
      direction: PageDirection | null
      scrolls: { left: number; max: number }[]
    } | null = null
    let blockClickUntil = 0
    let blockedTouch = false

    const pointerStart = (event: PointerEvent) => {
      // Outside pointerdown can close a popover before touchstart fires.
      if (event.pointerType === 'touch') blockedTouch = !latestEnabled.current
    }

    const start = (event: TouchEvent) => {
      gesture = null
      blockClickUntil = 0
      if (blockedTouch || !latestEnabled.current || event.touches.length !== 1) return
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('input, textarea, select, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-no-swipe], button:not(.show-card):not(.mg-entry)')) return
      const touch = event.touches[0]
      // Leave Android/iOS back gestures at the screen edges to the system.
      if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return
      const scrolls: { left: number; max: number }[] = []
      const inNavigation = target.closest('.month-nav') !== null
      for (let node: Element | null = target; node; node = node.parentElement) {
        // The sticky date title can page even when the table below is wider than the screen.
        if (!(inNavigation && node === element) && node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) {
          scrolls.push({ left: node.scrollLeft, max: node.scrollWidth - node.clientWidth })
        }
        if (node === element) break
      }
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now(), horizontal: false, direction: null, scrolls }
    }
    const move = (event: TouchEvent) => {
      if (!gesture) return
      if (!latestEnabled.current || event.touches.length !== 1 || performance.now() - gesture.at > 900) { gesture = null; return }
      const touch = Array.from(event.touches).find(t => t.identifier === gesture!.id)
      if (!touch) { gesture = null; return }
      const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y
      if (!gesture.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
        // Once scrolling vertically or diagonally, never turn that drag into a page.
        if (Math.abs(dx) < Math.abs(dy) * 1.5) { gesture = null; return }
        const direction: PageDirection = dx < 0 ? 1 : -1
        // Use the position at touchstart: reaching a week-grid edge does not also flip it.
        if (gesture.scrolls.some(s => direction === 1 ? s.left < s.max - 2 : s.left > 2)) { gesture = null; return }
        gesture.horizontal = true
        gesture.direction = direction
      }
      if (event.cancelable) event.preventDefault()
    }
    const end = (event: TouchEvent) => {
      const current = gesture
      gesture = null
      blockedTouch = false
      if (!latestEnabled.current || !current?.horizontal || current.direction === null || event.touches.length !== 0) return
      // A drag starting on a show card must not open its detail after release.
      blockClickUntil = performance.now() + 500
      if (event.cancelable) event.preventDefault()
      const touch = Array.from(event.changedTouches).find(t => t.identifier === current.id)
      if (!touch || performance.now() - current.at > 900) return
      const dx = touch.clientX - current.x, dy = touch.clientY - current.y
      const threshold = Math.max(48, Math.min(96, element.clientWidth * 0.16))
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if ((dx < 0 ? 1 : -1) !== current.direction) return
      element.scrollTop = 0
      latestPage.current(current.direction)
    }
    const cancel = () => { gesture = null; blockedTouch = false }
    const click = (event: MouseEvent) => {
      if (event.detail !== 0 && performance.now() < blockClickUntil) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    element.addEventListener('pointerdown', pointerStart, true)
    element.addEventListener('touchstart', start, { passive: true })
    // React's delegated touch handlers are passive; native listeners can claim only a horizontal drag.
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', end, { passive: false })
    element.addEventListener('touchcancel', cancel, { passive: true })
    element.addEventListener('click', click, true)
    return () => {
      element.removeEventListener('pointerdown', pointerStart, true)
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', cancel)
      element.removeEventListener('click', click, true)
    }
  }, [element, scope])

  return setElement
}
