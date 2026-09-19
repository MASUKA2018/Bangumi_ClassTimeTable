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
    ).toEqual({ x: 1364, y: 799 })
  })

  it('uses physical pixels at 125% scaling and stacks a second reminder above it', () => {
    const workArea = { position: { x: 1920, y: 0 }, size: { width: 2560, height: 1400 } }
    expect(reminderPhysicalPosition(workArea, 1.25, false)).toEqual({ x: 3785, y: 1099 })
    expect(reminderPhysicalPosition(workArea, 1.25, true)).toEqual({ x: 3785, y: 803 })
  })
})
