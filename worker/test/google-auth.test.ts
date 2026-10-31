import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGoogleAccessToken, resetGoogleTokenCacheForTests } from '../src/google-auth'
import { decodeBase64Url, jsonResponse, makeServiceAccount } from './helpers'

describe('Google service account authentication', () => {
  beforeEach(() => resetGoogleTokenCacheForTests())
  afterEach(() => vi.unstubAllGlobals())

  it('signs an RS256 JWT with the required claims', async () => {
    const account = await makeServiceAccount()
    let assertion = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        assertion = new URLSearchParams(init?.body as string).get('assertion') ?? ''
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 })
      }),
    )

    await expect(getGoogleAccessToken(account.json, 15_000)).resolves.toEqual({
      token: 'access-token',
      projectId: 'worker-test-project',
    })

    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split('.')
    expect(JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader)))).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as Record<string, unknown>
    expect(payload).toMatchObject({
      iss: 'worker-test@example.invalid',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
    })
    expect((payload.exp as number) - (payload.iat as number)).toBe(3600)
    await expect(
      crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        account.publicKey,
        decodeBase64Url(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      ),
    ).resolves.toBe(true)
  })

  it('caches a token per credential until its refresh window', async () => {
    const account = await makeServiceAccount()
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'cached-token', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)

    await getGoogleAccessToken(account.json, 15_000)
    await getGoogleAccessToken(account.json, 15_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
