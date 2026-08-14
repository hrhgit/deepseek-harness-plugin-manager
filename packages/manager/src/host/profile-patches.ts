import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMap, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from 'yaml'

const PATCH_FILENAME = 'cordis.patch.yml'
const OWNER_MARKER = 'Managed by dsh-plugin-manager. Remove this row to return control to higher-level configuration.'

/** Profile patch location inferred from the running Loader tree. */
export interface ProfileLocation {
  readonly directory: string
  readonly filename: string
  readonly profileName: string
}

/** Resolve and validate the running profile directory from a Loader file URL. */
export function profileLocation(baseUrl: string): ProfileLocation {
  if (!baseUrl.startsWith('file:')) throw new Error('dsh-plugin-manager requires a file-backed profile config')
  const root = fileURLToPath(baseUrl)
  const directory = resolve(baseUrl.endsWith('/') ? root : dirname(root))
  if (!baseUrl.endsWith('/') && basename(root) !== 'cordis.yml') {
    throw new Error(`dsh-plugin-manager expected a profile directory or cordis.yml, received ${root}`)
  }
  return { directory, filename: join(directory, PATCH_FILENAME), profileName: basename(directory) }
}

function emptyDocument(): Document.Parsed {
  return parseDocument('[]\n')
}

async function readDocument(filename: string): Promise<Document.Parsed> {
  let source: string
  try {
    source = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument()
    throw error
  }
  const document = parseDocument(source)
  if (document.errors.length > 0) throw new Error(`cannot parse ${filename}: ${document.errors[0]?.message}`)
  if (!isSeq(document.contents)) throw new Error(`${filename} must contain a YAML sequence of patches`)
  return document
}

function scalarString(map: YAMLMap, key: string): string | undefined {
  const value = map.get(key)
  return typeof value === 'string' ? value : undefined
}

function ownedPatch(sequence: YAMLSeq, configId: string, moduleName: string): YAMLMap | undefined {
  return sequence.items.find((item): item is YAMLMap => {
    if (!isMap(item) || scalarString(item, 'id') !== configId || scalarString(item, 'name') !== moduleName) return false
    return item.commentBefore?.includes('Managed by dsh-plugin-manager') === true
  })
}

/** Store one explicit desired enablement without changing user-authored patches. */
export async function writeDesiredState(
  location: ProfileLocation,
  configId: string,
  moduleName: string,
  enabled: boolean,
): Promise<void> {
  const document = await readDocument(location.filename)
  const sequence = document.contents
  if (!isSeq(sequence)) throw new Error(`${location.filename} must contain a YAML sequence of patches`)
  let patch = ownedPatch(sequence, configId, moduleName)
  if (patch === undefined) {
    sequence.add(document.createNode({ id: configId, name: moduleName, disabled: !enabled }) as never)
    const added = sequence.items.at(-1)
    if (!isMap(added)) throw new Error('failed to create a plugin-manager YAML patch')
    patch = added as unknown as YAMLMap
    patch.commentBefore = OWNER_MARKER
  } else {
    patch.set('disabled', !enabled)
  }
  await atomicWrite(location.filename, String(document))
}

async function atomicWrite(filename: string, content: string): Promise<void> {
  await mkdir(dirname(filename), { recursive: true })
  const temporary = join(dirname(filename), `.${basename(filename)}.${process.pid}.${randomUUID()}.tmp`)
  await writeFile(temporary, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  await rename(temporary, filename)
}
