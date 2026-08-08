import { expect, test } from '@playwright/test'
import { launchApp } from './helpers/launch'

/**
 * Cold-start benchmark. Numbers are logged (STARTUP_BENCHMARK) for before/after
 * comparison — CI asserts only that startup completes and paints the home page,
 * so machine speed never flakes the suite.
 */
test('cold start reaches painted home page', async () => {
  const t0 = Date.now()
  const { app, page, close } = await launchApp()
  try {
    const tWindow = Date.now() - t0

    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    const tPainted = Date.now() - t0

    const rendererMarks = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const paint = performance.getEntriesByType('paint')
      return {
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        load: nav ? nav.loadEventEnd : null,
        firstPaint: paint.find((p) => p.name === 'first-paint')?.startTime ?? null,
        firstContentfulPaint:
          paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null
      }
    })

    console.log(
      'STARTUP_BENCHMARK',
      JSON.stringify({
        mainWindowMs: tWindow,
        homeVisibleMs: tPainted,
        ...rendererMarks
      })
    )

    // Sanity: the eager shell actually works after startup.
    await expect(page.locator('nav').first()).toBeVisible()
    expect(await app.evaluate(() => typeof process.pid)).toBe('number')
  } finally {
    await close()
  }
})
