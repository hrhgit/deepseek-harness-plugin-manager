import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { CatalogCollector } from '../lib/types/host/collector.js'
import { catalogDocumentSchema } from '../lib/types/manifest.js'

const root = resolve('../..')
const directory = join(root, 'catalog', 'v2')
const target = join(directory, 'catalog.json')
const scanStateTarget = join(directory, 'scan-state.json')
const scanStateSchema = z.object({ schemaVersion: z.literal(2), completedAt: z.string().datetime() }).strict()

function optionalNumber(name) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
  return value
}

const fullReconcile = process.env.CATALOG_FULL_RECONCILE === 'true'
let previous
try {
  previous = catalogDocumentSchema.parse(JSON.parse(await readFile(target, 'utf8')))
} catch {
  previous = undefined
}
let scanState
try {
  scanState = scanStateSchema.parse(JSON.parse(await readFile(scanStateTarget, 'utf8')))
} catch {
  scanState = undefined
}
const scanStartedAt = new Date().toISOString()

const collector = new CatalogCollector({
  githubToken: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  githubTopic: process.env.GITHUB_TOPIC,
  githubApiUrl: process.env.GITHUB_API_URL,
  rawGithubUrl: process.env.RAW_GITHUB_URL,
  npmRegistryUrl: process.env.NPM_REGISTRY_URL,
  requestTimeoutMs: optionalNumber('REQUEST_TIMEOUT_MS'),
  githubRepositoryBatchSize: optionalNumber('GITHUB_REPOSITORY_BATCH_SIZE'),
  githubRepositoryLimit: optionalNumber('GITHUB_REPOSITORY_LIMIT'),
  ...(previous === undefined || fullReconcile ? {} : {
    previousCatalog: previous,
    incrementalSince: scanState?.completedAt ?? previous.generatedAt,
  }),
})

const next = await collector.collect()

if (previous !== undefined && JSON.stringify({ entries: previous.entries, warnings: previous.warnings })
  === JSON.stringify({ entries: next.entries, warnings: next.warnings })) {
  console.log(`Catalog unchanged: ${next.entries.length} entries.`)
} else {
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.catalog.${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(next, undefined, 2) + '\n', 'utf8')
  await rename(temporary, target)
  console.log(`Catalog updated: ${next.entries.length} entries, generated at ${next.generatedAt}.`)
}

await mkdir(directory, { recursive: true })
const scanStateTemporary = join(directory, `.scan-state.${randomUUID()}.tmp`)
await writeFile(scanStateTemporary, JSON.stringify({ schemaVersion: 2, completedAt: scanStartedAt }, undefined, 2) + '\n', 'utf8')
await rename(scanStateTemporary, scanStateTarget)
