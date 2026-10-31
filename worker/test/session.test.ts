import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import {
  DEVICE_MAX_AGE_SECONDS,
  DEVICE_REFRESH_THRESHOLD_SECONDS,
  inviteKey,
  issueDeviceToken,
  normalizeInviteCode,
  validateDeviceToken,
} from '../src/session'
import { audioRequest, makeTestEnv } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('device sessions', () => {
  it.each([
    ['abcd-efgh', 'ABCDEFGH'],
    [' ABCD EFGH ', 'ABCDEFGH'],
    ['a-b c-d e-f g-h', 'ABCDEFGH'],
    ['ABCD-EFGO', null],
    ['ABCD-EFG1', null],
    ['short', null],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeInviteCode(input)).toBe(expected)
  })

  it('signs and verifies a valid token', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY, 1_000)

    await expect(validateDeviceToken(token, env.DEVICE_SIGNING_KEY, env.INVITES, 1_001)).resolves.toEqual({
      inviteId: 'ABCDEFGH',
      refresh: false,
    })
  })

  it('rejects tampered and expired tokens', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY, 1_000)
    const [payload, signature] = token.split('.')

    await expect(
      validateDeviceToken(`${payload}A.${signature}`, env.DEVICE_SIGNING_KEY, env.INVITES, 1_001),
    ).resolves.toBeNull()
    await expect(
      validateDeviceToken(token, env.DEVICE_SIGNING_KEY, env.INVITES, 1_000 + DEVICE_MAX_AGE_SECONDS),
    ).resolves.toBeNull()
  })

  it('marks a session for refresh only below 30 remaining days', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY, 1_000)
    const exp = 1_000 + DEVICE_MAX_AGE_SECONDS

    await expect(
      validateDeviceToken(
        token,
        env.DEVICE_SIGNING_KEY,
        env.INVITES,
        exp - DEVICE_REFRESH_THRESHOLD_SECONDS,
      ),
    ).resolves.toMatchObject({ refresh: false })
    await expect(
      validateDeviceToken(
        token,
        env.DEVICE_SIGNING_KEY,
        env.INVITES,
        exp - DEVICE_REFRESH_THRESHOLD_SECONDS + 1,
      ),
    ).resolves.toMatchObject({ refresh: true })
  })

  it('invalidates an existing token after its invite is revoked', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)
    await env.INVITES.delete(inviteKey('ABCDEFGH'))

    await expect(validateDeviceToken(token, env.DEVICE_SIGNING_KEY, env.INVITES)).resolves.toBeNull()

    const response = await worker.fetch(
      audioRequest('ama', undefined, `ama_device=${token}`),
      env,
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_ACTIVATED' } })
  })

  it('activates a valid code and reports the session', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), JSON.stringify({ label: 'Home' }))
    const activate = await worker.fetch(
      new Request('https://app.ama-ama.com/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: ' abcd-efgh ' }),
      }),
      env,
    )

    expect(activate.status).toBe(200)
    expect(await activate.json()).toEqual({ activated: true })
    const setCookie = activate.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('ama_device=')
    expect(setCookie).toContain('HttpOnly; Secure; SameSite=Lax; Path=/')
    expect(setCookie).toContain(`Max-Age=${DEVICE_MAX_AGE_SECONDS}`)

    const cookie = setCookie.split(';', 1)[0]
    const session = await worker.fetch(
      new Request('https://app.ama-ama.com/api/session', { headers: { Cookie: cookie } }),
      env,
    )
    expect(await session.json()).toEqual({ activated: true })
  })

  it.each(['bad-code', 'ABCD-EFGO', 'ABCDEFGH'])(
    'returns INVALID_CODE without logging the submitted code for %s',
    async (code) => {
      const env = makeTestEnv()
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const response = await worker.fetch(
        new Request('https://app.ama-ama.com/api/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        }),
        env,
      )

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CODE' } })
      expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain(code)
    },
  )

  it('redirects a valid join and an invalid join to the contract locations', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')

    const valid = await worker.fetch(
      new Request('https://app.ama-ama.com/join/abcd-efgh'),
      env,
    )
    expect(valid.status).toBe(302)
    expect(valid.headers.get('Location')).toBe('/')
    expect(valid.headers.get('Set-Cookie')).toContain('ama_device=')

    const invalid = await worker.fetch(
      new Request('https://app.ama-ama.com/join/ABCD-EFGO'),
      env,
    )
    expect(invalid.status).toBe(302)
    expect(invalid.headers.get('Location')).toBe('/?invite=invalid')
    expect(invalid.headers.get('Set-Cookie')).toBeNull()
  })

  it('returns false for missing and revoked sessions and refreshes an expiring cookie', async () => {
    const env = makeTestEnv()
    const missing = await worker.fetch(new Request('https://app.ama-ama.com/api/session'), env)
    expect(missing.status).toBe(200)
    expect(await missing.json()).toEqual({ activated: false })

    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const now = Math.floor(Date.now() / 1000)
    const oldIssuedAt = now - DEVICE_MAX_AGE_SECONDS + DEVICE_REFRESH_THRESHOLD_SECONDS - 1
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY, oldIssuedAt)
    const refreshed = await worker.fetch(
      new Request('https://app.ama-ama.com/api/session', {
        headers: { Cookie: `ama_device=${token}` },
      }),
      env,
    )
    expect(await refreshed.json()).toEqual({ activated: true })
    expect(refreshed.headers.get('Set-Cookie')).toContain('ama_device=')

    await env.INVITES.delete(inviteKey('ABCDEFGH'))
    const revoked = await worker.fetch(
      new Request('https://app.ama-ama.com/api/session', {
        headers: { Cookie: `ama_device=${token}` },
      }),
      env,
    )
    expect(await revoked.json()).toEqual({ activated: false })
  })

  it('rejects translation without activation before reading the upload', async () => {
    const env = makeTestEnv()
    const response = await worker.fetch(audioRequest(), env)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_ACTIVATED' } })
  })

  it('refreshes an expiring cookie even when translation returns an API error', async () => {
    const env = makeTestEnv()
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    const now = Math.floor(Date.now() / 1000)
    const issuedAt = now - DEVICE_MAX_AGE_SECONDS + DEVICE_REFRESH_THRESHOLD_SECONDS - 1
    const token = await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY, issuedAt)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    const response = await worker.fetch(
      audioRequest('ama', undefined, `ama_device=${token}`),
      env,
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('Set-Cookie')).toContain('ama_device=')
  })
})
