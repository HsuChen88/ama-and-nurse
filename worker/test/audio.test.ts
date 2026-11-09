import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { inviteKey, issueDeviceToken } from '../src/session'
import type { Env } from '../src/types'
import { MemoryAudioBucket, makeTestEnv } from './helpers'

const AUDIO_KEY = 'a'.repeat(64)
let env: Env
let bucket: MemoryAudioBucket
let cookie: string

beforeEach(async () => {
  bucket = new MemoryAudioBucket()
  env = makeTestEnv({ AUDIO_BUCKET: bucket as unknown as R2Bucket })
  await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
  cookie = `ama_device=${await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)}`
})

describe('GET /api/audio/:id', () => {
  it('requires an activated device', async () => {
    await bucket.put(AUDIO_KEY, new Uint8Array([1, 2, 3]))

    const response = await worker.fetch(
      new Request(`https://app.ama-ama.com/api/audio/${AUDIO_KEY}`),
      env,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_ACTIVATED' } })
  })

  it('reads WAV audio from R2 with a private immutable cache policy', async () => {
    await bucket.put(AUDIO_KEY, new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: 'audio/wav' },
    })

    const response = await worker.fetch(
      new Request(`https://app.ama-ama.com/api/audio/${AUDIO_KEY}`, {
        headers: { Cookie: cookie },
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=31536000, immutable',
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it.each(['missing', 'not-a-sha256'])('returns JSON NOT_FOUND for %s audio', async (value) => {
    const key = value === 'missing' ? 'b'.repeat(64) : value
    const response = await worker.fetch(
      new Request(`https://app.ama-ama.com/api/audio/${key}`, {
        headers: { Cookie: cookie },
      }),
      env,
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })
})
