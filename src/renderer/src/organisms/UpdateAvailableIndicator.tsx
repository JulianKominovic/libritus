import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import {
  getUpdateStatus,
  onUpdateStatus,
  quitAndInstall,
  type UpdateStatus
} from '@renderer/integrations/updater'
import { flushActiveSession } from '@renderer/lib/pdf-canvas/active-session-flush'
import { useEffect, useState } from 'react'

const IDLE: UpdateStatus = { phase: 'idle' }

/**
 * Auto-update chip above Settings. Hidden when idle / no packaged updater.
 */
export function UpdateAvailableIndicator() {
  const [status, setStatus] = useState<UpdateStatus>(IDLE)

  useEffect(() => {
    let alive = true
    void getUpdateStatus().then((s) => {
      if (alive) setStatus(s)
    })
    const unsub = onUpdateStatus((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
      unsub()
    }
  }, [])

  if (status.phase === 'idle') return null

  if (status.phase === 'error') {
    return (
      <div
        data-testid="update-available-indicator"
        className="mb-2 w-full space-y-1 rounded-md bg-morphing-50 px-2.5 py-2 ring-1 ring-morphing-200"
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-morphing-500">Update</p>
        <p className="text-xs text-morphing-700">Update failed</p>
      </div>
    )
  }

  const pct =
    status.phase === 'downloading' && status.percent != null
      ? Math.round(status.percent)
      : null

  return (
    <div
      data-testid="update-available-indicator"
      className="mb-2 w-full space-y-1.5 rounded-md bg-morphing-50 px-2.5 py-2 ring-1 ring-morphing-200"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-morphing-500">Update</p>
      <p className="text-xs text-morphing-900">
        {status.phase === 'ready'
          ? `v${status.version} ready`
          : status.phase === 'downloading'
            ? `Downloading v${status.version}…`
            : `Update v${status.version}`}
      </p>
      {pct != null ? <Progress value={pct} className="h-1" /> : null}
      {status.phase === 'ready' ? (
        <Button
          type="button"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={() => {
            void flushActiveSession().finally(() => quitAndInstall())
          }}
        >
          Restart
        </Button>
      ) : null}
    </div>
  )
}
