import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FRIENDLY_ERROR_CODES, friendlyError } from '../errors'
import { ErrorDialog } from './ErrorDialog'

describe('ErrorDialog', () => {
  afterEach(() => cleanup())

  it('presents every friendly error code as the same accessible modal', () => {
    for (const code of FRIENDLY_ERROR_CODES) {
      const message = friendlyError(code)
      const [traditionalChinese, indonesian] = message.split(' / ', 2)
      render(<ErrorDialog message={message} onDismiss={vi.fn()} />)

      const dialog = screen.getByRole('alertdialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.getAttribute('aria-labelledby')).toBe('error-dialog-title')
      expect(dialog.getAttribute('aria-describedby')).toBe('error-dialog-description')
      expect(screen.getByText(traditionalChinese)).toBeTruthy()
      if (indonesian) expect(screen.getByText(indonesian)).toBeTruthy()
      expect(screen.getAllByRole('button')).toHaveLength(1)

      cleanup()
    }
  })
})
