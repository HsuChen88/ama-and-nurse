import type { Env } from './types'

export const DEVICE_COOKIE_NAME = 'ama_device'
export const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
export const DEVICE_REFRESH_THRESHOLD_SECONDS = 30 * 24 * 60 * 60
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const INVITE_PATTERN = new RegExp(`^[${INVITE_ALPHABET}]{8}$`)

interface DevicePayload {
  invite_id: string
  iat: number
  exp: number
}

export interface ValidSession {
  inviteId: string
  refresh: boolean
}

export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const normalized = input.toUpperCase().replace(/[\s-]/g, '')
  return INVITE_PATTERN.test(normalized) ? normalized : null
}

export function inviteKey(code: string): string {
  return `invite:${code}`
}

export async function inviteExists(code: string, invites: KVNamespace): Promise<boolean> {
  return (await invites.get(inviteKey(code))) !== null
}

export async function issueDeviceToken(
  inviteId: string,
  signingKey: string,
  nowSeconds = currentUnixSeconds(),
): Promise<string> {
  const payload: DevicePayload = {
    invite_id: inviteId,
    iat: nowSeconds,
    exp: nowSeconds + DEVICE_MAX_AGE_SECONDS,
  }
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await sign(encodedPayload, signingKey)
  return `${encodedPayload}.${base64UrlEncode(signature)}`
}

export async function validateDeviceToken(
  token: string | null,
  signingKey: string,
  invites: KVNamespace,
  nowSeconds = currentUnixSeconds(),
): Promise<ValidSession | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  let signature: Uint8Array
  try {
    signature = base64UrlDecode(parts[1])
  } catch {
    return null
  }
  if (!(await verify(parts[0], signature, signingKey))) return null

  let payload: DevicePayload
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as DevicePayload
  } catch {
    return null
  }
  const inviteId = normalizeInviteCode(payload.invite_id)
  if (
    !inviteId ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > nowSeconds ||
    payload.exp <= payload.iat ||
    payload.exp <= nowSeconds
  ) {
    return null
  }
  if (!(await inviteExists(inviteId, invites))) return null

  return {
    inviteId,
    refresh: payload.exp - nowSeconds < DEVICE_REFRESH_THRESHOLD_SECONDS,
  }
}

export function readDeviceCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === DEVICE_COOKIE_NAME) return value.join('=') || null
  }
  return null
}

export function serializeDeviceCookie(token: string): string {
  return `${DEVICE_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEVICE_MAX_AGE_SECONDS}`
}

export async function authenticateDevice(
  request: Request,
  env: Env,
  nowSeconds = currentUnixSeconds(),
): Promise<ValidSession | null> {
  try {
    return await validateDeviceToken(
      readDeviceCookie(request),
      env.DEVICE_SIGNING_KEY,
      env.INVITES,
      nowSeconds,
    )
  } catch {
    return null
  }
}

export async function refreshedCookie(
  session: ValidSession,
  signingKey: string,
  nowSeconds = currentUnixSeconds(),
): Promise<string | null> {
  if (!session.refresh) return null
  return serializeDeviceCookie(await issueDeviceToken(session.inviteId, signingKey, nowSeconds))
}

async function hmacKey(signingKey: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  )
}

async function sign(value: string, signingKey: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(signingKey, ['sign']),
    new TextEncoder().encode(value),
  )
  return new Uint8Array(signature)
}

async function verify(
  value: string,
  signature: Uint8Array,
  signingKey: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await hmacKey(signingKey, ['verify']),
      Uint8Array.from(signature).buffer,
      new TextEncoder().encode(value),
    )
  } catch {
    return false
  }
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
