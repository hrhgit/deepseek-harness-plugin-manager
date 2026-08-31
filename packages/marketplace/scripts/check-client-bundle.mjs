import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const match = bundle.match(/window\.__ModuleLoader__\.load\(\{\s*id:\s*(["'])(.*?)\1/)

if (typeof packageJson.name !== 'string' || match?.[2] !== packageJson.name) {
  throw new Error(`client bundle registration does not match package.json name: expected ${String(packageJson.name)}, got ${match?.[2] ?? 'none'}`)
}

console.log(`client bundle registration verified: ${packageJson.name}`)
