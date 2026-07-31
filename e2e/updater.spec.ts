import { expect, test } from '@playwright/test'
import { launchApp } from './helpers/launch'

test('update chip hidden when idle; shows Restart when ready', async () => {
  const { page, close } = await launchApp()
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })

    await expect(page.getByTestId('update-available-indicator')).toHaveCount(0)

    const status = await page.evaluate(() =>
      (window as any).electron.ipcRenderer.invoke('updater:get-status')
    )
    expect(status).toEqual({ phase: 'idle' })

    await page.evaluate(() =>
      (window as any).electron.ipcRenderer.invoke('updater:__set-status', {
        phase: 'ready',
        version: '9.9.9'
      })
    )

    const chip = page.getByTestId('update-available-indicator')
    await expect(chip).toBeVisible()
    await expect(chip.getByText('v9.9.9 ready')).toBeVisible()
    await expect(chip.getByRole('button', { name: 'Restart' })).toBeVisible()
    // Do not click Restart — quitAndInstall would tear down the app.
  } finally {
    await close()
  }
})

test('update chip shows progress while downloading', async () => {
  const { page, close } = await launchApp()
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })

    await page.evaluate(() =>
      (window as any).electron.ipcRenderer.invoke('updater:__set-status', {
        phase: 'downloading',
        version: '9.9.9',
        percent: 42
      })
    )

    const chip = page.getByTestId('update-available-indicator')
    await expect(chip).toBeVisible()
    await expect(chip.getByText('Downloading v9.9.9…')).toBeVisible()
    await expect(chip.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  } finally {
    await close()
  }
})
