import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pluginCategory } from '../src/host/plugin-category.js'

async function installManifest(name: string, manifest: object): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-category-'))
  const packageDirectory = join(directory, 'node_modules', ...name.split('/'))
  await mkdir(packageDirectory, { recursive: true })
  await writeFile(join(packageDirectory, 'package.json'), `${JSON.stringify({ name, ...manifest })}\n`, 'utf8')
  return pathToFileURL(join(directory, 'cordis.yml')).href
}

describe('pluginCategory', () => {
  it('discovers the official Harness workspace group from installed metadata', async () => {
    const baseUrl = await installManifest('@deepseek-ai/dsh-fixture', {
      repository: {
        type: 'git',
        url: 'git+https://github.com/deepseek-ai/deepseek-harness.git',
        directory: 'packages/core/fixture',
      },
    })
    expect(pluginCategory('@deepseek-ai/dsh-fixture', baseUrl)).toBe('core')
  })

  it('keeps missing or non-Harness metadata out of official groups', async () => {
    const thirdParty = await installManifest('@deepseek-ai/dsh-third-party', {
      repository: { url: 'https://github.com/example/project', directory: 'packages/core/plugin' },
    })
    const missingDirectory = await installManifest('@deepseek-ai/dsh-missing-directory', {
      repository: { url: 'https://github.com/deepseek-ai/deepseek-harness' },
    })
    expect(pluginCategory('@deepseek-ai/dsh-third-party', thirdParty)).toBe('harness-other')
    expect(pluginCategory('@deepseek-ai/dsh-missing-directory', missingDirectory)).toBe('harness-other')
    expect(pluginCategory('local-plugin', thirdParty)).toBe('community')
    expect(pluginCategory('cordis:include', thirdParty)).toBe('cordis')
  })
})
