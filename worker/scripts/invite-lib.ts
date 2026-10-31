import { INVITE_ALPHABET, inviteKey, normalizeInviteCode } from '../src/session'

const APP_ORIGIN = 'https://app.ama-ama.com'

export type Runner = (args: string[]) => string
export type Writer = (line: string) => void

interface InviteMetadata {
  label: string
  created_at: string
}

interface ListedKey {
  name: string
  metadata?: Partial<InviteMetadata>
}

export function generateInviteCode(randomIndex: (maximum: number) => number): string {
  return Array.from(
    { length: 8 },
    () => INVITE_ALPHABET[randomIndex(INVITE_ALPHABET.length)],
  ).join('')
}

export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export function createCommand(code: string, metadata: InviteMetadata): string[] {
  const value = JSON.stringify(metadata)
  return [
    'kv',
    'key',
    'put',
    inviteKey(code),
    value,
    '--binding',
    'INVITES',
    '--remote',
    '--metadata',
    value,
  ]
}

export function listCommand(): string[] {
  return ['kv', 'key', 'list', '--binding', 'INVITES', '--remote', '--prefix', 'invite:']
}

export function revokeCommand(code: string): string[] {
  return ['kv', 'key', 'delete', inviteKey(code), '--binding', 'INVITES', '--remote']
}

export async function runInviteCli(
  argv: string[],
  run: Runner,
  write: Writer,
  renderQr: (url: string) => void,
  generateCode: () => string,
): Promise<void> {
  const [action, ...rest] = argv
  if (action === 'create') {
    const label = rest.join(' ').trim()
    if (!label) throw new Error('Usage: pnpm invite create <label>')
    const code = generateCode()
    const metadata = { label, created_at: new Date().toISOString() }
    run(createCommand(code, metadata))
    const url = `${APP_ORIGIN}/join/${code}`
    write(formatInviteCode(code))
    write(url)
    renderQr(url)
    return
  }

  if (action === 'list' && rest.length === 0) {
    const keys = JSON.parse(run(listCommand())) as ListedKey[]
    for (const key of keys) {
      const code = key.name.startsWith('invite:') ? key.name.slice('invite:'.length) : ''
      if (!normalizeInviteCode(code)) continue
      const masked = `${code.slice(0, 2)}****${code.slice(6)}`
      write(`${masked}\t${key.metadata?.label ?? ''}\t${key.metadata?.created_at ?? ''}`)
    }
    return
  }

  if (action === 'revoke' && rest.length === 1) {
    const code = normalizeInviteCode(rest[0])
    if (!code) throw new Error('Invite code must be 8 valid characters')
    run(revokeCommand(code))
    write(`Revoked ${code.slice(0, 2)}****${code.slice(6)}`)
    return
  }

  throw new Error('Usage: pnpm invite <create|list|revoke> ...')
}
