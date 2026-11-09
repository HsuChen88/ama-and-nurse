import type { ApiLanguage } from './types'

export const SPEECH_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60
const SPEECH_SIGNATURE_PREFIX = 'speech:v1:'

export interface SpeechPayload {
  v: 1
  lang: ApiLanguage
  text: string
  exp: number
}

export async function issueSpeechToken(
  lang: ApiLanguage,
  text: string,
  signingKey: string,
  nowSeconds = currentUnixSeconds(),
): Promise<string> {
  const payload: SpeechPayload = {
    v: 1,
    lang,
    text,
    exp: nowSeconds + SPEECH_TOKEN_MAX_AGE_SECONDS,
  }
  const encodedPayload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const signature = await signSpeechPayload(encodedPayload, signingKey)
  return `${encodedPayload}.${base64UrlEncode(signature)}`
}

export async function validateSpeechToken(
  token: string,
  signingKey: string,
  nowSeconds = currentUnixSeconds(),
): Promise<SpeechPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  let suppliedSignature: Uint8Array
  try {
    suppliedSignature = base64UrlDecode(parts[1])
  } catch {
    return null
  }
  const expectedSignature = await signSpeechPayload(parts[0], signingKey)
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
  } catch {
    return null
  }
  if (!isSpeechPayload(payload) || payload.exp <= nowSeconds) return null
  return payload
}

async function signSpeechPayload(value: string, signingKey: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${SPEECH_SIGNATURE_PREFIX}${value}`),
  )
  return new Uint8Array(signature)
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  for (let index = 0; index < right.length; index += 1) {
    difference |= (left[index] ?? 0) ^ right[index]
  }
  return difference === 0
}

function isSpeechPayload(value: unknown): value is SpeechPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<SpeechPayload>
  return payload.v === 1
    && (payload.lang === 'id' || payload.lang === 'nan-TW')
    && typeof payload.text === 'string'
    && payload.text.length > 0
    && Number.isInteger(payload.exp)
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url')
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
