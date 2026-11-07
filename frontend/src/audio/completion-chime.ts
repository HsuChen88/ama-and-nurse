type SafariWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

export class CompletionChime {
  private context: AudioContext | null = null

  prepare(): void {
    const AudioContextClass = window.AudioContext
      ?? (window as SafariWindow).webkitAudioContext
    if (!AudioContextClass) return

    try {
      this.context ??= new AudioContextClass()
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => undefined)
      }
    } catch {
      this.context = null
    }
  }

  async play(): Promise<void> {
    const context = this.context
    if (!context || context.state === 'closed') return

    try {
      if (context.state === 'suspended') await context.resume()

      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      const duration = 0.14

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, now)
      oscillator.frequency.exponentialRampToValueAtTime(1040, now + duration)
      gain.gain.setValueAtTime(0.045, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + duration)
    } catch {
      // Completion audio is optional and must never block recording or translation.
    }
  }

  close(): void {
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined)
    }
  }
}
