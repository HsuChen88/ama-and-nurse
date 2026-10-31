import { randomInt } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import qrcode from 'qrcode-terminal'
import { generateInviteCode, runInviteCli } from './invite-lib'

function runWrangler(args: string[]): string {
  return execFileSync('pnpm', ['wrangler', ...args], { encoding: 'utf8' })
}

function printQr(url: string): void {
  qrcode.generate(url, { small: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runInviteCli(
    process.argv.slice(2),
    runWrangler,
    console.log,
    printQr,
    () => generateInviteCode(randomInt),
  ).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Invite command failed')
    process.exitCode = 1
  })
}
