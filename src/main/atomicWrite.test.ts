import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile, access } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { atomicWriteFile } from './atomicWrite'

describe('atomicWriteFile', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('overwrite replaces content and leaves no tmp', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'))
    const file = path.join(dir, 'session.json')
    await writeFile(file, 'A')

    await atomicWriteFile(file, 'B')

    expect(await readFile(file, 'utf8')).toBe('B')
    await expect(access(`${file}.tmp`)).rejects.toThrow()
  })

  test('concurrent writes do not ENOENT on shared tmp', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'))
    const file = path.join(dir, 'categories.json')
    await writeFile(file, '[]')

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => atomicWriteFile(file, `[{"n":${i}}]`))
    )

    const text = await readFile(file, 'utf8')
    expect(JSON.parse(text)).toEqual([{ n: expect.any(Number) }])
  })

  test('crash before rename leaves original intact', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'))
    const file = path.join(dir, 'session.json')
    await writeFile(file, 'GOOD')

    // Simulate interrupt after tmp write, before rename.
    await writeFile(`${file}.orphan.tmp`, '{truncated')

    expect(await readFile(file, 'utf8')).toBe('GOOD')
  })

  test('failed tmp write does not touch original', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'))
    const file = path.join(dir, 'session.json')
    await writeFile(file, 'GOOD')

    const missingParent = path.join(dir, 'no-such-dir', 'session.json')
    await expect(atomicWriteFile(missingParent, 'BAD')).rejects.toThrow()

    expect(await readFile(file, 'utf8')).toBe('GOOD')
  })
})
