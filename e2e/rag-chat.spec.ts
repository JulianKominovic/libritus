// AiSettingsSection parked in settings.tsx with RAG — restore this test when AI UI returns.
// import { test, expect } from '@playwright/test'
// import { launchApp } from './helpers/launch'
// import { tmpAppData } from './helpers/canvas'
// import { seedLibrary } from './helpers/seed'
//
// test('settings AI section is reachable', async () => {
//   const appDataDir = await tmpAppData('libritus-e2e-rag-settings-')
//   await seedLibrary({ appDataDir, pages: 1 })
//
//   const { page, close } = await launchApp({ appDataDir })
//   try {
//     await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
//       timeout: 30_000
//     })
//     await page.getByRole('link', { name: 'Settings' }).click()
//     await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
//     await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible()
//     await expect(page.getByText(/OpenRouter API key/i)).toBeVisible()
//     await expect(page.getByText(/Embeddings run locally/i)).toBeVisible()
//   } finally {
//     await close()
//   }
// })
