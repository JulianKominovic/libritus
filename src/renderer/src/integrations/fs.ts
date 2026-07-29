/** Map an absolute OS path to the custom `asset:` protocol (Windows-safe). */
function convertFileSrc(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  // pathToFileURL-style: Windows drive → /C:/…, POSIX already starts with /
  const pathname = /^[a-zA-Z]:\//.test(normalized) ? `/${normalized}` : normalized
  return `asset://${pathname}`
}

export async function writeFile(filename: string, data: Uint8Array): Promise<string> {
  const fullPath = await window.electron.ipcRenderer.invoke('write-file', { filename, data })
  return convertFileSrc(fullPath)
}

export async function readFile(filename: string): Promise<Uint8Array | null> {
  return await window.electron.ipcRenderer.invoke('read-file', { filename })
}

export async function mkdir(filename: string): Promise<boolean> {
  return await window.electron.ipcRenderer.invoke('mkdir', { filename })
}
