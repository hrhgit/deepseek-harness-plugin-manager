import { rm } from 'node:fs/promises'

await Promise.all(['lib', 'dist'].map(path => rm(path, { recursive: true, force: true })))
