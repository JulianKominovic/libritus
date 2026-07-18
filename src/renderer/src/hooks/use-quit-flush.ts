import { flushActiveSession } from '@renderer/lib/pdf-canvas/active-session-flush'
import { useEffect } from 'react'

/** Flush PDF session (if any) before Electron closes the window / quits. */
export function useQuitFlush(): void {
  useEffect(() => {
    const onQuitRequest = (): void => {
      void flushActiveSession().finally(() => {
        window.electron.ipcRenderer.send('app-quit-ready')
      })
    }
    return window.electron.ipcRenderer.on('app-quit-request', onQuitRequest)
  }, [])
}
