import { describe, expect, it, vi } from 'vitest'
import {
  createCommand,
  formatInviteCode,
  generateInviteCode,
  listCommand,
  revokeCommand,
  runInviteCli,
} from '../scripts/invite-lib'

describe('invite management script', () => {
  it('generates eight characters from the contract alphabet', () => {
    let index = 0
    const code = generateInviteCode((maximum) => index++ % maximum)
    expect(code).toBe('ABCDEFGH')
    expect(formatInviteCode(code)).toBe('ABCD-EFGH')
  })

  it('assembles remote Wrangler create/list/revoke arguments', () => {
    const metadata = { label: 'Grandma phone', created_at: '2026-10-31T00:00:00.000Z' }
    expect(createCommand('ABCDEFGH', metadata)).toEqual([
      'kv', 'key', 'put', 'invite:ABCDEFGH', JSON.stringify(metadata),
      '--binding', 'INVITES', '--remote', '--metadata', JSON.stringify(metadata),
    ])
    expect(listCommand()).toEqual([
      'kv', 'key', 'list', '--binding', 'INVITES', '--remote', '--prefix', 'invite:',
    ])
    expect(revokeCommand('ABCDEFGH')).toEqual([
      'kv', 'key', 'delete', 'invite:ABCDEFGH', '--binding', 'INVITES', '--remote',
    ])
  })

  it('creates an invite and prints its formatted code, URL, and QR', async () => {
    const run = vi.fn().mockReturnValue('')
    const write = vi.fn()
    const renderQr = vi.fn()

    await runInviteCli(
      ['create', 'Grandma phone'],
      run,
      write,
      renderQr,
      () => 'ABCDEFGH',
    )

    expect(run.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining(['put', 'invite:ABCDEFGH', '--remote', '--metadata']),
    )
    expect(write).toHaveBeenNthCalledWith(1, 'ABCD-EFGH')
    expect(write).toHaveBeenNthCalledWith(2, 'https://app.ama-ama.com/join/ABCDEFGH')
    expect(renderQr).toHaveBeenCalledWith('https://app.ama-ama.com/join/ABCDEFGH')
  })

  it('prints masked list output from KV metadata', async () => {
    const write = vi.fn()
    const run = vi.fn().mockReturnValue(JSON.stringify([{
      name: 'invite:ABCDEFGH',
      metadata: { label: 'Home', created_at: '2026-10-31T00:00:00.000Z' },
    }]))

    await runInviteCli(['list'], run, write, vi.fn(), () => 'ABCDEFGH')

    expect(run).toHaveBeenCalledWith(listCommand())
    expect(write).toHaveBeenCalledWith('AB****GH\tHome\t2026-10-31T00:00:00.000Z')
  })

  it('normalizes revoke input without exposing the full code', async () => {
    const write = vi.fn()
    const run = vi.fn().mockReturnValue('')
    await runInviteCli(['revoke', 'abcd-efgh'], run, write, vi.fn(), () => 'ABCDEFGH')
    expect(run).toHaveBeenCalledWith(revokeCommand('ABCDEFGH'))
    expect(write).toHaveBeenCalledWith('Revoked AB****GH')
  })
})
