export function vibrateRecordingStart(): void {
  vibrate(50)
}

export function vibrateRecordingStop(): void {
  vibrate([40, 60, 40])
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Vibration is optional and unsupported on iPhone.
  }
}
