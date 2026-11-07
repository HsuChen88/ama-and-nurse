import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioRecorder } from './recorder'

const originalMediaRecorder = Object.getOwnPropertyDescriptor(window, 'MediaRecorder')
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn(() => true)
  state: RecordingState = 'inactive'
  mimeType = 'audio/webm;codecs=opus'

  constructor() {
    super()
    FakeMediaRecorder.instances.push(this)
  }

  start(): void {
    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
  }

  emitStart(): void {
    this.dispatchEvent(new Event('start'))
  }

  emitStop(): void {
    const dataEvent = new Event('dataavailable')
    Object.defineProperty(dataEvent, 'data', {
      value: new Blob(['audio'], { type: this.mimeType }),
    })
    this.dispatchEvent(dataEvent)
    this.dispatchEvent(new Event('stop'))
  }
}

describe('AudioRecorder', () => {
  const track = { stop: vi.fn() }

  beforeEach(() => {
    FakeMediaRecorder.instances = []
    FakeMediaRecorder.isTypeSupported.mockClear()
    track.stop.mockReset()
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }),
      },
    })
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    })
  })

  afterEach(() => {
    if (originalMediaRecorder) Object.defineProperty(window, 'MediaRecorder', originalMediaRecorder)
    else Reflect.deleteProperty(window, 'MediaRecorder')
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
    if (originalSecureContext) Object.defineProperty(window, 'isSecureContext', originalSecureContext)
    else Reflect.deleteProperty(window, 'isSecureContext')
  })

  it('resolves start only after the MediaRecorder start event', async () => {
    const recorder = new AudioRecorder()
    let started = false
    const startPromise = recorder.start().then(() => { started = true })
    await Promise.resolve()
    await Promise.resolve()

    expect(FakeMediaRecorder.instances).toHaveLength(1)
    expect(FakeMediaRecorder.instances[0].state).toBe('recording')
    expect(started).toBe(false)

    FakeMediaRecorder.instances[0].emitStart()
    await startPromise
    expect(started).toBe(true)
  })

  it('stops microphone tracks synchronously before the recording blob resolves', async () => {
    const recorder = new AudioRecorder()
    const startPromise = recorder.start()
    await Promise.resolve()
    await Promise.resolve()
    const mediaRecorder = FakeMediaRecorder.instances[0]
    mediaRecorder.emitStart()
    await startPromise

    let blobResolved = false
    const stopPromise = recorder.stop().then((result) => {
      blobResolved = true
      return result
    })

    expect(track.stop).toHaveBeenCalledOnce()
    expect(blobResolved).toBe(false)
    mediaRecorder.emitStop()
    await expect(stopPromise).resolves.toMatchObject({ filename: 'recording.webm' })
  })
})
