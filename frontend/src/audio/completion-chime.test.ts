import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompletionChime } from './completion-chime'

const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext')
const originalWebkitAudioContext = Object.getOwnPropertyDescriptor(window, 'webkitAudioContext')

function restoreAudioContexts() {
  if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext)
  else Reflect.deleteProperty(window, 'AudioContext')
  if (originalWebkitAudioContext) {
    Object.defineProperty(window, 'webkitAudioContext', originalWebkitAudioContext)
  } else {
    Reflect.deleteProperty(window, 'webkitAudioContext')
  }
}

describe('completion chime', () => {
  afterEach(() => {
    restoreAudioContexts()
  })

  it('prepares silently, then plays a short low-volume tone on demand', async () => {
    const oscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    const context = {
      state: 'running',
      currentTime: 2,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const AudioContextMock = vi.fn(() => context)
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextMock,
    })

    const chime = new CompletionChime()
    chime.prepare()

    expect(AudioContextMock).toHaveBeenCalledOnce()
    expect(context.createOscillator).not.toHaveBeenCalled()

    await chime.play()

    expect(context.createOscillator).toHaveBeenCalledOnce()
    expect(oscillator.start).toHaveBeenCalledWith(2)
    expect(oscillator.stop).toHaveBeenCalledWith(2.14)
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.045, 2)
  })

  it('silently skips preparation and playback without Web Audio', async () => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined })
    const chime = new CompletionChime()

    expect(() => chime.prepare()).not.toThrow()
    await expect(chime.play()).resolves.toBeUndefined()
  })
})
