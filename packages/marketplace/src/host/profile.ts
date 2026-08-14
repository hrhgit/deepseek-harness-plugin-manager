import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ProfileLocation {
  readonly directory: string
  readonly profileName: string
}

export function profileLocation(baseUrl: string): ProfileLocation {
  if (!baseUrl.startsWith('file:')) throw new Error('dsh-plugin-marketplace requires a file-backed profile config')
  const root = fileURLToPath(baseUrl)
  const directory = resolve(baseUrl.endsWith('/') ? root : dirname(root))
  if (!baseUrl.endsWith('/') && basename(root) !== 'cordis.yml') {
    throw new Error(`dsh-plugin-marketplace expected a profile directory or cordis.yml, received ${root}`)
  }
  return { directory, profileName: basename(directory) }
}

export async function installedDependencies(directory: string): Promise<Readonly<Record<string, string>>> {
  const raw = await readFile(join(directory, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as { dependencies?: unknown }
  if (parsed.dependencies === undefined) return {}
  if (parsed.dependencies === null || typeof parsed.dependencies !== 'object' || Array.isArray(parsed.dependencies)) {
    throw new Error(`profile manifest ${join(directory, 'package.json')} has invalid dependencies`)
  }
  return parsed.dependencies as Readonly<Record<string, string>>
}
