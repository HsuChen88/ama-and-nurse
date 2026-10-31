import type { ApiErrorBody, Speaker, TranslationResult } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const UPLOAD_TIMEOUT_MS = 45_000

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

export async function getSession(): Promise<{ activated: boolean }> {
  if (USE_MOCK) return { activated: true }
  return requestJson<{ activated: boolean }>(`${API_BASE}/api/session`)
}

export async function activateDevice(code: string): Promise<{ activated: true }> {
  return requestJson<{ activated: true }>(`${API_BASE}/api/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
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
      signal: controller.signal,
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach server')
  } finally {
    window.clearTimeout(timeout)
  }

  await throwApiError(response)

  return (await response.json()) as TranslationResult
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach server')
  }
  await throwApiError(response)
  return (await response.json()) as T
}

async function throwApiError(response: Response): Promise<void> {
  if (response.ok) return
  let body: ApiErrorBody | undefined
  try {
    body = (await response.clone().json()) as ApiErrorBody
  } catch {
    // An invalid error body is handled as a generic server error.
  }
  throw new ApiError(body?.error.code ?? 'UNKNOWN_ERROR', body?.error.message ?? response.statusText)
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
    translated_text: isAma ? 'Apakah kamu sudah makan?' : '阿嬤，妳食飽未？',
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
