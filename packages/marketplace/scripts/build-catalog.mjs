import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { catalogDocumentSchema, catalogPluginFromManifest, packageManifestSchema } from '../lib/types/manifest.js'

const root = resolve('../..')
const directory = join(root, 'catalog', 'v1')
const sourceFile = join(directory, 'sources.json')
const sources = JSON.parse(await readFile(sourceFile, 'utf8'))
if (!Array.isArray(sources) || !sources.every(value => typeof value === 'string')) {
  throw new Error(`${sourceFile} must contain an array of package directories`)
}
const plugins = []
for (const source of sources) {
  const manifestPath = join(root, source, 'package.json')
  const manifest = packageManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  plugins.push(catalogPluginFromManifest(
    manifest,
    `https://raw.githubusercontent.com/hrhgit/deepseek-harness-plugin-manager/main/${source}/package.json`,
  ))
}
const document = catalogDocumentSchema.parse({ schemaVersion: 1, plugins })
await mkdir(directory, { recursive: true })
const target = join(directory, 'catalog.json')
const temporary = join(directory, `.catalog.${randomUUID()}.tmp`)
await writeFile(temporary, JSON.stringify(document, undefined, 2) + '\n', 'utf8')
await rename(temporary, target)
