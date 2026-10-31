import type { Env } from '../src/types'

export interface TestServiceAccount {
  json: string
  publicKey: CryptoKey
}

export const baseEnv: Env = {
  INFERENCE_BASE_URL: 'https://inference.example',
  INFERENCE_API_TOKEN: 'inference-token',
  INFERENCE_CF_ACCESS_CLIENT_ID: 'access-client-id',
  INFERENCE_CF_ACCESS_CLIENT_SECRET: 'access-client-secret',
  GOOGLE_TRANSLATE_SA_JSON: '',
  GOOGLE_TTS_SA_JSON: '',
  TTS_ID_VOICE: 'id-ID-Chirp3-HD-Pulcherrima',
  TTS_ID_SPEAKING_RATE: '0.9',
  INFERENCE_TIMEOUT_MS: '30000',
  GOOGLE_TIMEOUT_MS: '15000',
}

export async function makeServiceAccount(
  clientEmail = 'worker-test@example.invalid',
  projectId = 'worker-test-project',
): Promise<TestServiceAccount> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const pem = `-----BEGIN PRIVATE KEY-----\n${toBase64(privateKey).match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`
  return {
    json: JSON.stringify({
      type: 'service_account',
      project_id: projectId,
      private_key_id: 'test-key',
      private_key: pem,
      client_email: clientEmail,
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
    publicKey: pair.publicKey,
  }
}

export function audioRequest(
  speaker: string = 'ama',
  audio: Blob = new Blob(['browser-audio'], { type: 'audio/webm' }),
): Request {
  const form = new FormData()
  form.append('speaker', speaker)
  form.append('audio', audio, 'recording.webm')
  return new Request('https://ama.example/api/translate', { method: 'POST', body: form })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function toBase64(value: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
