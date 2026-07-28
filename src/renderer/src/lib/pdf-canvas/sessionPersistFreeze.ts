/** Freeze session disk writes after a canvas crash (ErrorBoundary). */
let frozen = false

export function freezeSessionPersist(): void {
  frozen = true
}

export function clearSessionPersistFreeze(): void {
  frozen = false
}

export function isSessionPersistFrozen(): boolean {
  return frozen
}
