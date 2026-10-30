// 10 ms mono PCM silence used to unlock an existing audio element in iOS Safari.
const SILENT_AUDIO_URL =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export function unlockAudioElement(audio: HTMLAudioElement): void {
  audio.pause()
  audio.src = SILENT_AUDIO_URL
  audio.load()
  try {
    void audio.play().catch(() => {
      // Autoplay fallback is handled after the translated audio is ready.
    })
  } catch {
    // Older browsers may throw synchronously; translated playback still has a manual fallback.
  }
}

export async function playOnAudioElement(audio: HTMLAudioElement, url: string): Promise<void> {
  audio.pause()
  audio.src = url
  audio.load()
  await audio.play()
}
