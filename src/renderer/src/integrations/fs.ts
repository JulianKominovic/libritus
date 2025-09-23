function convertFileSrc(path: string): string {
  return `asset://${path}`
}

export async function writeFile(filename: string, data: Uint8Array): Promise<string> {
  const fullPath = await window.electron.ipcRenderer.invoke('write-file', { filename, data })
  return convertFileSrc(fullPath)
}

export async function readFile(filename: string): Promise<Uint8Array | null> {
  return await window.electron.ipcRenderer.invoke('read-file', { filename })
}
