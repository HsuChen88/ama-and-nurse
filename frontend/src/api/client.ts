import type { ApiErrorBody, Speaker, TranslationResult } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const UPLOAD_TIMEOUT_MS = 45_000

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

export async function translateAudio(
  audio: Blob,
  filename: string,
  speaker: Speaker,
): Promise<TranslationResult> {
  if (USE_MOCK) return mockTranslate(speaker)

  const formData = new FormData()
  formData.append('audio', audio, filename)
  formData.append('speaker', speaker)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      body: formData,
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach server')
  } finally {
    window.clearTimeout(timeout)
  }

  handleAccessRedirect(response)

  if (!response.ok) {
    let body: ApiErrorBody | undefined
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      // An invalid error body is handled as a generic server error.
    }
    throw new ApiError(body?.error.code ?? 'UNKNOWN_ERROR', body?.error.message ?? response.statusText)
  }

  return (await response.json()) as TranslationResult
}

export function handleAccessRedirect(
  response: Response,
  reload: () => void = () => window.location.reload(),
): void {
  const contentType = response.headers.get('content-type') ?? ''
  const accessResponse =
    response.type === 'opaqueredirect' ||
    ([401, 403].includes(response.status) && !contentType.toLowerCase().includes('application/json'))
  if (!accessResponse) return

  reload()
  throw new ApiError('AUTH_REQUIRED', 'Authentication is required')
}

export function resolveAudioUrl(url: string): string {
  if (/^(blob:|data:|https?:\/\/)/.test(url)) return url
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

async function mockTranslate(speaker: Speaker): Promise<TranslationResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 900))
  const isAma = speaker === 'ama'
  return {
    id: `mock-${Date.now()}`,
    speaker,
    source_lang: isAma ? 'nan-TW' : 'id',
    target_lang: isAma ? 'id' : 'nan-TW',
    source_text: isAma ? '你食飽未？' : 'Nenek sudah makan?',
    translated_text: isAma ? 'Apakah kamu sudah makan?' : '阿罵，妳食飽未？',
    audio_url: createToneUrl(),
    audio_mime: 'audio/wav',
    timings_ms: { asr: 300, translate: 180, tts: 240, total: 720 },
  }
}

function createToneUrl(): string {
  const sampleRate = 8_000
  const duration = 0.45
  const samples = Math.floor(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  write(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(i / 200, (samples - i) / 200, 1)
    const sample = Math.sin((2 * Math.PI * 520 * i) / sampleRate) * 0.18 * envelope
    view.setInt16(44 + i * 2, sample * 0x7fff, true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}
