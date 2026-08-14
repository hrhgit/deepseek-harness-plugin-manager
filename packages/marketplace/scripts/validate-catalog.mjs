import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { catalogDocumentSchema } from '../lib/types/manifest.js'

const target = join(resolve('../..'), 'catalog', 'v1', 'catalog.json')
const catalog = catalogDocumentSchema.parse(JSON.parse(await readFile(target, 'utf8')))
const sorted = [...catalog.entries].sort((left, right) => left.id.localeCompare(right.id))
if (catalog.entries.some((entry, index) => entry.id !== sorted[index]?.id)) {
  throw new Error(`${target} entries must be sorted by id`)
}
console.log(`Catalog valid: ${catalog.entries.length} entries.`)
