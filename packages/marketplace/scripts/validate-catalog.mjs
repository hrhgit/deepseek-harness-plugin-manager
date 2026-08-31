import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { catalogDocumentSchema } from '../lib/types/manifest.js'
import { compareCatalogEntries } from '../lib/types.js'

const target = join(resolve('../..'), 'catalog', 'v2', 'catalog.json')
const catalog = catalogDocumentSchema.parse(JSON.parse(await readFile(target, 'utf8')))
const sorted = [...catalog.entries].sort(compareCatalogEntries)
if (catalog.entries.some((entry, index) => entry.id !== sorted[index]?.id)) {
  throw new Error(`${target} entries must be sorted by availability, then id`)
}
console.log(`Catalog valid: ${catalog.entries.length} entries.`)
