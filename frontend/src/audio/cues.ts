interface Tone {
  offset: number
  duration: number
}

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

const START_TONES: Tone[] = [{ offset: 0, duration: 0.15 }]
const STOP_TONES: Tone[] = [
  { offset: 0, duration: 0.07 },
  { offset: 0.13, duration: 0.07 },
]

export class RecordingCues {
  private context: AudioContext | null = null
  private resumePromise: Promise<boolean> = Promise.resolve(true)

  prepare(): void {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext
      if (!Context) return
      try {
        this.context = new Context()
      } catch {
        return
      }
    }

    if (this.context.state === 'suspended') {
      this.resumePromise = this.context.resume().then(() => true).catch(() => false)
    }
  }

  async playStart(): Promise<void> {
    await this.play(START_TONES)
  }

  async playStop(): Promise<void> {
    await this.play(STOP_TONES)
  }

  close(): void {
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined)
    this.context = null
  }

  private async play(tones: Tone[]): Promise<void> {
    const context = this.context
    if (!context) return

    if (!(await this.resumePromise)) return
    try {
      await Promise.all(tones.map((tone) => playTone(context, tone)))
    } catch {
      // Audio cues are optional and must never block recording.
    }
  }
}

export function vibrateRecordingStart(): void {
  vibrate(50)
}

export function vibrateRecordingStop(): void {
  vibrate([40, 60, 40])
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Vibration is optional and unsupported on iPhone.
  }
}

function playTone(context: AudioContext, tone: Tone): Promise<void> {
  return new Promise((resolve) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startAt = context.currentTime + tone.offset
    const stopAt = startAt + tone.duration

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, startAt)
    gain.gain.setValueAtTime(0.12, startAt)
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.addEventListener('ended', () => resolve(), { once: true })
    oscillator.start(startAt)
    oscillator.stop(stopAt)
  })
}
