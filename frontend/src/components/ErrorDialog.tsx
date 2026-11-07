import { useEffect, useRef, type KeyboardEvent } from 'react'

interface ErrorDialogProps {
  message: string
  onDismiss: () => void
}

const TITLE_ID = 'error-dialog-title'
const DESCRIPTION_ID = 'error-dialog-description'

export function ErrorDialog({ message, onDismiss }: ErrorDialogProps) {
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
  const [traditionalChinese, indonesian] = message.split(' / ', 2)

  useEffect(() => {
    dismissButtonRef.current?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      dismissButtonRef.current?.focus()
    }
  }

  return (
    <div className="error-modal-backdrop" onKeyDown={handleKeyDown}>
      <section
        className="error-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
      >
        <div className="error-dialog-icon" aria-hidden="true">!</div>
        <h2 id={TITLE_ID}>請注意 / Perhatian</h2>
        <p id={DESCRIPTION_ID}>
          <span>{traditionalChinese}</span>
          {indonesian && <span lang="id">{indonesian}</span>}
        </p>
        <button ref={dismissButtonRef} type="button" onClick={onDismiss}>
          知道了 / Mengerti
        </button>
      </section>
    </div>
  )
}
