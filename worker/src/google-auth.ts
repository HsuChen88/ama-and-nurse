import { upstreamError } from './errors'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const TOKEN_REFRESH_MARGIN_SECONDS = 60

interface ServiceAccount {
  project_id: string
  private_key: string
  client_email: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, CachedToken>()

export function parseServiceAccount(json: string): ServiceAccount {
  try {
    const value = JSON.parse(json) as Partial<ServiceAccount>
    if (!value.project_id || !value.private_key || !value.client_email) throw new Error()
    return value as ServiceAccount
  } catch {
    throw upstreamError()
  }
}

export async function getGoogleAccessToken(
  credentialJson: string,
  timeoutMs: number,
): Promise<{ token: string; projectId: string }> {
  const credentials = parseServiceAccount(credentialJson)
  const cached = tokenCache.get(credentialJson)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS > now) {
    return { token: cached.accessToken, projectId: credentials.project_id }
  }

  const assertion = await createJwt(credentials, now)
  const started = performance.now()
  let response: Response
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    console.warn('Google OAuth request failed', { elapsed_ms: elapsedMs(started) })
    throw upstreamError()
  }
  console.log('Google OAuth request completed', {
    status_code: response.status,
    elapsed_ms: elapsedMs(started),
  })
  if (!response.ok) throw upstreamError()

  try {
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') throw new Error()
    tokenCache.set(credentialJson, {
      accessToken: body.access_token,
      expiresAt: now + body.expires_in,
    })
    return { token: body.access_token, projectId: credentials.project_id }
  } catch {
    throw upstreamError()
  }
}

async function createJwt(credentials: ServiceAccount, issuedAt: number): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: CLOUD_PLATFORM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  )
  const unsigned = `${header}.${payload}`
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(credentials.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(unsigned),
    )
    return `${unsigned}.${base64Url(signature)}`
  } catch {
    throw upstreamError()
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const encoded = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(encoded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function base64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started)
}

export function resetGoogleTokenCacheForTests(): void {
  tokenCache.clear()
}
