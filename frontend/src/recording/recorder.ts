const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg',
] as const

export class RecordingError extends Error {
  constructor(public readonly code: 'INSECURE_CONTEXT' | 'MIC_DENIED' | 'MIC_UNAVAILABLE') {
    super(code)
  }
}

export interface RecordingResult {
  blob: Blob
  filename: string
}

export class AudioRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private stopPromise: Promise<RecordingResult> | null = null
  private resolveStop: ((result: RecordingResult) => void) | null = null

  async start(): Promise<void> {
    if (!window.isSecureContext) throw new RecordingError('INSECURE_CONTEXT')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new RecordingError('MIC_UNAVAILABLE')
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) {
        throw new RecordingError('MIC_DENIED')
      }
      throw new RecordingError('MIC_UNAVAILABLE')
    }

    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    this.chunks = []

    try {
      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream)
    } catch {
      this.closeTracks()
      throw new RecordingError('MIC_UNAVAILABLE')
    }

    this.stopPromise = new Promise((resolve) => {
      this.resolveStop = resolve
    })
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })
    this.recorder.addEventListener('stop', () => {
      const type = this.recorder?.mimeType || this.chunks[0]?.type || 'application/octet-stream'
      const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm'
      this.resolveStop?.({
        blob: new Blob(this.chunks, { type }),
        filename: `recording.${extension}`,
      })
      this.reset()
    })
    await new Promise<void>((resolve, reject) => {
      const handleStart = () => {
        this.recorder?.removeEventListener('error', handleError)
        resolve()
      }
      const handleError = () => {
        this.recorder?.removeEventListener('start', handleStart)
        reject(new RecordingError('MIC_UNAVAILABLE'))
      }

      this.recorder?.addEventListener('start', handleStart, { once: true })
      this.recorder?.addEventListener('error', handleError, { once: true })
      try {
        this.recorder?.start(250)
      } catch {
        handleError()
      }
    }).catch((error: unknown) => {
      this.closeTracks()
      this.reset()
      throw error
    })
  }

  stop(): Promise<RecordingResult> {
    if (!this.recorder || this.recorder.state === 'inactive' || !this.stopPromise) {
      return Promise.reject(new RecordingError('MIC_UNAVAILABLE'))
    }
    this.recorder.stop()
    this.closeTracks()
    return this.stopPromise
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    this.closeTracks()
  }

  private closeTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }

  private reset(): void {
    this.recorder = null
    this.stopPromise = null
    this.resolveStop = null
    this.chunks = []
  }
}
