import type { Env } from '../src/types'

export interface TestServiceAccount {
  json: string
  publicKey: CryptoKey
}

export class MemoryInvites {
  private readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }
}

export interface StoredTranslation {
  key: string
  normalized_zh: string
  taigi_han: string
  created_at: string
  provider_version: string
}

export class MemoryDatabase {
  readonly translations = new Map<string, StoredTranslation>()
  readonly usage: unknown[][] = []

  prepare(query: string): MemoryStatement {
    return new MemoryStatement(this, query)
  }
}

class MemoryStatement {
  private values: unknown[] = []

  constructor(
    private readonly database: MemoryDatabase,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values
    return this
  }

  async first<T>(): Promise<T | null> {
    if (this.query.includes('FROM translation_cache')) {
      return (this.database.translations.get(String(this.values[0])) as T | undefined) ?? null
    }
    return null
  }

  async run(): Promise<Record<string, unknown>> {
    if (this.query.includes('INTO translation_cache')) {
      const [key, normalized_zh, taigi_han, created_at, provider_version] = this.values.map(String)
      this.database.translations.set(key, {
        key,
        normalized_zh,
        taigi_han,
        created_at,
        provider_version,
      })
    } else if (this.query.includes('INTO usage_log')) {
      this.database.usage.push([...this.values])
    }
    return { success: true }
  }
}

export class MemoryAudioBucket {
  readonly values = new Map<string, { bytes: Uint8Array; contentType: string }>()

  async head(key: string): Promise<object | null> {
    return this.values.has(key) ? { key } : null
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<object> {
    let bytes: Uint8Array
    if (typeof value === 'string') bytes = new TextEncoder().encode(value)
    else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
    } else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
    else bytes = new Uint8Array(await new Response(value).arrayBuffer())
    this.values.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
    })
    return { key }
  }

  async get(key: string): Promise<object | null> {
    const value = this.values.get(key)
    if (!value) return null
    return {
      key,
      body: new Blob([value.bytes.buffer.slice(0) as ArrayBuffer]).stream(),
      httpMetadata: { contentType: value.contentType },
      arrayBuffer: async () => value.bytes.buffer.slice(0),
    }
  }
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
  INFERENCE_TTS_TIMEOUT_MS: '30000',
  GOOGLE_TIMEOUT_MS: '15000',
  DEVICE_SIGNING_KEY: 'test-device-signing-key',
  TAIGI_TRANSLATE_API_KEY: 'taigi-translate-secret',
  TAIGI_TTS_API_KEY: 'taigi-tts-secret',
  TAIGI_TRANSLATE_TIMEOUT_MS: '5000',
  TAIGI_TTS_TIMEOUT_MS: '8000',
  TAIGI_TTS_MODEL: 'model7',
  TAIGI_TTS_VOICE: 'normal_f2',
  TAIGI_TTS_SPEED: '1.0',
  INVITES: new MemoryInvites() as unknown as KVNamespace,
  CACHE_DB: new MemoryDatabase() as unknown as D1Database,
  AUDIO_BUCKET: new MemoryAudioBucket() as unknown as R2Bucket,
}

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...baseEnv,
    INVITES: new MemoryInvites() as unknown as KVNamespace,
    CACHE_DB: new MemoryDatabase() as unknown as D1Database,
    AUDIO_BUCKET: new MemoryAudioBucket() as unknown as R2Bucket,
    ...overrides,
  }
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
  cookie?: string,
): Request {
  const form = new FormData()
  form.append('speaker', speaker)
  form.append('audio', audio, 'recording.webm')
  return new Request('https://ama.example/api/translate', {
    method: 'POST',
    body: form,
    headers: cookie ? { Cookie: cookie } : undefined,
  })
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
