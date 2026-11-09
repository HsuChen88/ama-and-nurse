import { describe, expect, it } from 'vitest'
import { issueDeviceToken } from '../src/session'
import {
  SPEECH_TOKEN_MAX_AGE_SECONDS,
  issueSpeechToken,
  validateSpeechToken,
} from '../src/speech-token'

const SIGNING_KEY = 'speech-token-test-key'
const NOW = 1_800_000_000

describe('speech tokens', () => {
  it('issues a signed 24-hour token with the v1 payload', async () => {
    const token = await issueSpeechToken('id', 'Sudah makan?', SIGNING_KEY, NOW)

    await expect(validateSpeechToken(token, SIGNING_KEY, NOW)).resolves.toEqual({
      v: 1,
      lang: 'id',
      text: 'Sudah makan?',
      exp: NOW + SPEECH_TOKEN_MAX_AGE_SECONDS,
    })
  })

  it('rejects payload and signature tampering', async () => {
    const token = await issueSpeechToken('nan-TW', '阿嬤食飽未？', SIGNING_KEY, NOW)
    const [payload, signature] = token.split('.')
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`

    await expect(
      validateSpeechToken(`${tamperedPayload}.${signature}`, SIGNING_KEY, NOW),
    ).resolves.toBeNull()
    await expect(
      validateSpeechToken(`${payload}.${tamperedSignature}`, SIGNING_KEY, NOW),
    ).resolves.toBeNull()
  })

  it('rejects expired tokens', async () => {
    const token = await issueSpeechToken('id', 'Halo', SIGNING_KEY, NOW)

    await expect(
      validateSpeechToken(token, SIGNING_KEY, NOW + SPEECH_TOKEN_MAX_AGE_SECONDS),
    ).resolves.toBeNull()
  })

  it('rejects a valid payload signed without the speech domain prefix', async () => {
    const payload = base64UrlEncode(JSON.stringify({
      v: 1,
      lang: 'id',
      text: 'Halo',
      exp: NOW + SPEECH_TOKEN_MAX_AGE_SECONDS,
    }))
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SIGNING_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload),
    )
    const wrongPrefixToken = `${payload}.${base64UrlBytes(new Uint8Array(signature))}`

    await expect(
      validateSpeechToken(wrongPrefixToken, SIGNING_KEY, NOW),
    ).resolves.toBeNull()
  })

  it('does not accept a device-cookie token as a speech token', async () => {
    const deviceToken = await issueDeviceToken('ABCDEFGH', SIGNING_KEY, NOW)
    await expect(validateSpeechToken(deviceToken, SIGNING_KEY, NOW)).resolves.toBeNull()
  })
})

function base64UrlEncode(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value))
}

function base64UrlBytes(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
