import { randomUUID } from 'crypto'
import fs from 'fs/promises'

/** Write via tmp + fsync + rename so a crash mid-write cannot truncate the destination. */
export async function atomicWriteFile(
  fullPath: string,
  data: Uint8Array | string
): Promise<void> {
  // Unique tmp: concurrent writes to the same path must not share one `.tmp`.
  const tmp = `${fullPath}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, data)
  const fh = await fs.open(tmp, 'r+')
  try {
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, fullPath)
}
