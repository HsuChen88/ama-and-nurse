import { describe, expect, it, vi } from 'vitest'
import { playOnAudioElement, unlockAudioElement } from './player'

function createAudioElement() {
  const audio = {
    src: '',
    pause: vi.fn(),
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLAudioElement
  return audio
}

describe('reusable audio player', () => {
  it('unlocks and later plays the result on the same element', async () => {
    const audio = createAudioElement()

    unlockAudioElement(audio)
    expect(audio.src).toMatch(/^data:audio\/wav;base64,/)
    expect(audio.play).toHaveBeenCalledTimes(1)

    await playOnAudioElement(audio, '/api/audio/result-1')
    expect(audio.src).toBe('/api/audio/result-1')
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(audio.load).toHaveBeenCalledTimes(2)
  })

  it('does not surface an unlock rejection', async () => {
    const audio = createAudioElement()
    vi.mocked(audio.play).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))

    expect(() => unlockAudioElement(audio)).not.toThrow()
    await Promise.resolve()
  })
})
