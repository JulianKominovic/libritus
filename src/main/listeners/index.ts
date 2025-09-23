import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '..'

const attachIPCListeners = (): void => {
  ipcMain.handle('write-file', async (_, { filename, data }) => {
    const fullPath = path.join(APP_DATA_DIR, filename)
    await fs.writeFile(fullPath, data)
    return fullPath
  })
  ipcMain.handle('read-file', (_, { filename }) => {
    const fullPath = path.join(APP_DATA_DIR, filename)
    return fs.readFile(fullPath)
  })
  ipcMain.handle('exists-file', (_, { filename }) => {
    return fs
      .access(path.join(APP_DATA_DIR, filename))
      .then(() => true)
      .catch(() => false)
  })
  ipcMain.handle('mkdir', (_, { filename }) => {
    return fs
      .mkdir(path.join(APP_DATA_DIR, filename), { recursive: true })
      .then(() => true)
      .catch(() => false)
  })
}
export default attachIPCListeners
