import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const root = process.cwd()
const mainEntry = path.join(root, 'out/main/index.js')

function electronExecutable(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron') as string
}

export type CloseOpts = {
  /** Keep appDataDir on disk (for quit-flush reopen). Default deletes it. */
  keepAppData?: boolean
}

export type LaunchedApp = {
  app: ElectronApplication
  page: Page
  appDataDir: string
  close: (opts?: CloseOpts) => Promise<void>
}

export async function launchApp(opts?: { appDataDir?: string }): Promise<LaunchedApp> {
  const appDataDir = opts?.appDataDir ?? (await mkdtemp(path.join(tmpdir(), 'libritus-e2e-')))

  const env = { ...process.env } as Record<string, string | undefined>
  delete env.ELECTRON_RUN_AS_NODE
  env.NODE_ENV = 'production'
  env.LIBRITUS_APP_DATA_DIR = appDataDir

  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [mainEntry],
    env: env as Record<string, string>,
    timeout: 60_000
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    appDataDir,
    close: async (closeOpts?: CloseOpts) => {
      await app.close().catch(() => undefined)
      if (!closeOpts?.keepAppData) {
        await rm(appDataDir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }
}
