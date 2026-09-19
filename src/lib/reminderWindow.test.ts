import { describe, expect, it } from 'vitest'
import { reminderPhysicalPosition } from './reminderWindow'

describe('reminderPhysicalPosition', () => {
  it('anchors a reminder to the bottom-right of the Windows work area', () => {
    expect(
      reminderPhysicalPosition(
        { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
        1,
        false,
      ),
    ).toEqual({ x: 1184, y: 724 })
  })

  it('uses physical pixels at 125% scaling and stacks a second reminder above it', () => {
    const workArea = { position: { x: 1920, y: 0 }, size: { width: 2560, height: 1400 } }
    expect(reminderPhysicalPosition(workArea, 1.25, false)).toEqual({ x: 3560, y: 1005 })
    expect(reminderPhysicalPosition(workArea, 1.25, true)).toEqual({ x: 3560, y: 615 })
  })
})
