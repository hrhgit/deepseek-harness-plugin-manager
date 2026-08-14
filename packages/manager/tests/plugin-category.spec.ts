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
  it('prefers an explicit functional group over repository layout', async () => {
    const baseUrl = await installManifest('@deepseek-ai/dsh-fixture', {
      dsh: { pluginManager: { group: 'llm' } },
      repository: {
        type: 'git',
        url: 'git+https://github.com/deepseek-ai/deepseek-harness.git',
        directory: 'packages/core/fixture',
      },
    })
    expect(pluginCategory('@deepseek-ai/dsh-fixture', baseUrl)).toBe('llm')
  })

  it('infers packages/<group>/<package> for official and third-party repositories', async () => {
    const thirdParty = await installManifest('@deepseek-ai/dsh-third-party', {
      repository: { url: 'https://github.com/example/project', directory: 'packages/core/plugin' },
    })
    const community = await installManifest('community-plugin', {
      repository: { url: 'https://github.com/example/community', directory: 'packages/tools/plugin' },
    })
    expect(pluginCategory('@deepseek-ai/dsh-third-party', thirdParty)).toBe('core')
    expect(pluginCategory('community-plugin', community)).toBe('tools')
  })

  it('falls back to ungrouped for missing or invalid metadata', async () => {
    const missing = await installManifest('missing-plugin', { repository: { url: 'https://github.com/example/project' } })
    const invalid = await installManifest('invalid-plugin', { dsh: { pluginManager: { group: 'Not a group' } } })
    expect(pluginCategory('missing-plugin', missing)).toBe('ungrouped')
    expect(pluginCategory('invalid-plugin', invalid)).toBe('ungrouped')
    expect(pluginCategory('cordis:include', missing)).toBe('cordis')
  })
})
