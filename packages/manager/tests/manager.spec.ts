import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import PluginManager from '../lib/index.js'

const contexts: Context[] = []
const empty: Plugin.Function = () => {}

async function harness(): Promise<{ ctx: Context; manager: PluginManager; featureId: string; siblingId: string; selfId: string; patch: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-'))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(join(directory, 'cordis.yml')).href
  await writeFile(join(directory, 'cordis.yml'), '[]\n', 'utf8')
  await ctx.plugin(Loader)
  ctx.loader.builtins.empty = empty
  const featureId = await ctx.loader.create({ name: 'cordis:empty' })
  const siblingId = await ctx.loader.create({ name: 'cordis:empty' })
  const selfId = await ctx.loader.create({ name: 'cordis:empty' })
  ctx.loader.resolve(featureId).options.name = '@fixture/tool/client'
  ctx.loader.resolve(siblingId).options.name = '@fixture/tool/host'
  ctx.loader.resolve(selfId).options.name = 'dsh-plugin-manager'
  await ctx.plugin(PluginManager, { settleTimeoutMs: 500 })
  const manager = ctx.get('pluginManager') as PluginManager
  return { ctx, manager, featureId, siblingId, selfId, patch: join(directory, 'cordis.patch.yml') }
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function emulateHmr(ctx: Context, entryIds: readonly string[], enabled: boolean): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
  await Promise.all(entryIds.map(id => ctx.loader.update(id, { disabled: !enabled })))
}

describe('PluginManager', () => {
  it('projects source categories and protects itself', async () => {
    const { ctx, manager, featureId, selfId } = await harness()
    const includeId = await ctx.loader.create({ name: 'cordis:empty' })
    ctx.loader.resolve(includeId).options.id = 'include'
    ctx.loader.resolve(includeId).options.name = 'cordis:include'
    const timerId = await ctx.loader.create({ name: 'cordis:empty' })
    ctx.loader.resolve(timerId).options.id = 'timer'
    ctx.loader.resolve(timerId).options.name = '@deepseek-ai/cordis-plugin-timer'
    const snapshot = manager.list()
    expect(snapshot.profileName).toMatch(/^dsh-plugin-manager-/)
    expect(snapshot.entries.filter(entry => entry.packageName === '@fixture/tool')).toHaveLength(2)
    expect(snapshot.categories).toEqual(['official', 'third-party'])
    expect(snapshot.entries.find(entry => entry.entryId === selfId)).toMatchObject({ category: 'third-party', protected: true, enabled: true })
    expect(snapshot.entries.find(entry => entry.configId === 'include')).toMatchObject({ category: 'official', protected: true })
    expect(snapshot.entries.find(entry => entry.configId === 'timer')).toMatchObject({ category: 'official', protected: true })
    expect(snapshot.entries.find(entry => entry.entryId === featureId)).toMatchObject({ category: 'third-party' })
  })

  it('persists and waits for the Loader state before reporting success', async () => {
    const { ctx, manager, featureId, patch } = await harness()
    const hmr = emulateHmr(ctx, [featureId], false)
    const receipt = await manager.setEnabled(featureId, false)
    await hmr
    expect(receipt.items).toEqual([{ entryId: featureId, status: 'changed', message: null }])
    expect(receipt.snapshot.entries.find(entry => entry.entryId === featureId)?.enabled).toBe(false)
    expect(await readFile(patch, 'utf8')).toContain('disabled: true')
  })

  it('handles package batches, skips protected entries, and reports saved states that need restart', async () => {
    const { ctx, manager, featureId, siblingId, selfId } = await harness()
    const hmr = emulateHmr(ctx, [featureId, siblingId], false)
    const receipt = await manager.setPackageEnabled('@fixture/tool', false)
    await hmr
    expect(receipt.items.map(item => item.status)).toEqual(['changed', 'changed'])
    const self = await manager.setPackageEnabled('dsh-plugin-manager', false)
    expect(self.items).toEqual([{ entryId: selfId, status: 'skipped', message: 'The plugin manager cannot disable itself.' }])

    const failed = await manager.setEnabled(featureId, true)
    expect(failed.items[0]?.status).toBe('restart-required')
    expect(failed.items[0]?.message).toContain('Timed out')
  })

  it('changes the automatically classified third-party category while skipping protected entries', async () => {
    const { ctx, manager, featureId, siblingId, selfId } = await harness()
    const hmr = emulateHmr(ctx, [featureId, siblingId], false)
    const receipt = await manager.setCategoryEnabled('third-party', false)
    await hmr
    expect(receipt.items).toEqual([
      { entryId: featureId, status: 'changed', message: null },
      { entryId: siblingId, status: 'changed', message: null },
      { entryId: selfId, status: 'skipped', message: 'The plugin manager cannot disable itself.' },
    ])
  })

  it('serializes concurrent mutations', async () => {
    const { ctx, manager, featureId, siblingId } = await harness()
    const firstHmr = emulateHmr(ctx, [featureId], false)
    const first = manager.setEnabled(featureId, false)
    await firstHmr
    const secondHmr = emulateHmr(ctx, [siblingId], false)
    const second = manager.setEnabled(siblingId, false)
    await secondHmr
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  })
})
