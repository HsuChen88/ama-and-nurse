import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingCues, vibrateRecordingStart, vibrateRecordingStop } from './cues'

const audioContext = vi.hoisted(() => ({
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  oscillatorStarts: [] as number[],
  oscillatorStops: [] as number[],
}))

class MockAudioContext {
  state: AudioContextState = 'suspended'
  currentTime = 10
  destination = {}
  resume = audioContext.resume
  close = audioContext.close

  createOscillator() {
    let ended: (() => void) | undefined
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      addEventListener: (_event: string, listener: () => void) => { ended = listener },
      start: (time: number) => audioContext.oscillatorStarts.push(time),
      stop: (time: number) => {
        audioContext.oscillatorStops.push(time)
        ended?.()
      },
    }
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
  }
}

const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate')

describe('RecordingCues', () => {
  beforeEach(() => {
    audioContext.resume.mockReset().mockResolvedValue(undefined)
    audioContext.close.mockReset().mockResolvedValue(undefined)
    audioContext.oscillatorStarts.length = 0
    audioContext.oscillatorStops.length = 0
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalVibrate) Object.defineProperty(navigator, 'vibrate', originalVibrate)
    else Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('creates and resumes Web Audio during prepare, then schedules one start beep', async () => {
    const cues = new RecordingCues()

    cues.prepare()
    expect(audioContext.resume).toHaveBeenCalledOnce()
    await cues.playStart()

    expect(audioContext.oscillatorStarts).toEqual([10])
    expect(audioContext.oscillatorStops).toEqual([10.15])
  })

  it('schedules two separate stop beeps', async () => {
    const cues = new RecordingCues()
    cues.prepare()

    await cues.playStop()

    expect(audioContext.oscillatorStarts).toEqual([10, 10.13])
    expect(audioContext.oscillatorStops[0]).toBeCloseTo(10.07)
    expect(audioContext.oscillatorStops[1]).toBeCloseTo(10.2)
  })

  it('silently skips cues when Web Audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const cues = new RecordingCues()

    expect(() => cues.prepare()).not.toThrow()
    await expect(cues.playStart()).resolves.toBeUndefined()
  })

  it('does not block recording cues when AudioContext cannot resume', async () => {
    audioContext.resume.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    const cues = new RecordingCues()

    cues.prepare()

    await expect(cues.playStart()).resolves.toBeUndefined()
    expect(audioContext.oscillatorStarts).toHaveLength(0)
  })
})

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
