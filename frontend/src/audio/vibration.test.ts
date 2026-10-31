import { afterEach, describe, expect, it, vi } from 'vitest'
import { vibrateRecordingStart, vibrateRecordingStop } from './vibration'

const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate')

describe('recording vibration', () => {
  afterEach(() => {
    if (originalVibrate) Object.defineProperty(navigator, 'vibrate', originalVibrate)
    else Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('uses distinct start and stop patterns when vibration is supported', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })

    vibrateRecordingStart()
    vibrateRecordingStop()

    expect(vibrate).toHaveBeenNthCalledWith(1, 50)
    expect(vibrate).toHaveBeenNthCalledWith(2, [40, 60, 40])
  })

  it('silently skips vibration when unsupported', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })

    expect(() => vibrateRecordingStart()).not.toThrow()
    expect(() => vibrateRecordingStop()).not.toThrow()
  })
})
