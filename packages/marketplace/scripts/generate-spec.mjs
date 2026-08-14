import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { catalogDocumentSchema, dshCatalogRootSchema, dshPluginManifestSchema } from '../lib/types/manifest.js'

const root = resolve('../..')
const output = join(root, 'spec', 'v1')
await mkdir(output, { recursive: true })

for (const [filename, schema, id] of [
  ['dsh-plugin.schema.json', dshPluginManifestSchema, 'https://github.com/hrhgit/deepseek-harness-plugin-manager/spec/v1/dsh-plugin.schema.json'],
  ['repository.schema.json', dshCatalogRootSchema, 'https://github.com/hrhgit/deepseek-harness-plugin-manager/spec/v1/repository.schema.json'],
  ['catalog.schema.json', catalogDocumentSchema, 'https://github.com/hrhgit/deepseek-harness-plugin-manager/spec/v1/catalog.schema.json'],
]) {
  const document = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id, ...z.toJSONSchema(schema) }
  const target = join(output, filename)
  const temporary = join(output, `.${filename}.${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(document, undefined, 2) + '\n', 'utf8')
  await rename(temporary, target)
}
