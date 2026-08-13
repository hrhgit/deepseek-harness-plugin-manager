import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const archive = resolve(process.argv[2] ?? '')
if (process.argv[2] === undefined) throw new Error('usage: node scripts/verify-package.mjs <package.tgz>')

const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-pack-'))
try {
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', directory], { encoding: 'utf8' })
  if (unpack.status !== 0) throw new Error(unpack.stderr || `tar exited with ${unpack.status}`)
  const packageRoot = join(directory, 'package')
  const pending = [join(packageRoot, 'lib', 'index.js'), join(packageRoot, 'lib', 'remote.js')]
  const visited = new Set()
  while (pending.length > 0) {
    const filename = pending.pop()
    if (filename === undefined || visited.has(filename)) continue
    visited.add(filename)
    const source = await readFile(filename, 'utf8')
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const imported = resolve(dirname(filename), match[1])
      await readFile(imported)
      if (imported.endsWith('.js')) pending.push(imported)
    }
  }
  console.log(`verified ${visited.size} packaged runtime modules in ${relative(process.cwd(), archive)}`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
