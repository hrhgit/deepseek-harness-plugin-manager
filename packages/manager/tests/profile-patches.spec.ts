import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { profileLocation, writeDesiredState } from '../src/host/profile-patches.js'

describe('profile patches', () => {
  it('infers the profile from Loader directory and legacy cordis.yml URLs', () => {
    const location = profileLocation(pathToFileURL(join('C:', 'profiles', 'web', 'cordis.yml')).href)
    expect(location.profileName).toBe('web')
    expect(location.filename.endsWith(join('web', 'cordis.patch.yml'))).toBe(true)
    const directory = profileLocation(`${pathToFileURL(join('C:', 'profiles', 'web')).href}/`)
    expect(directory).toEqual(location)
    expect(() => profileLocation(pathToFileURL(join('C:', 'profiles', 'web', 'other.yml')).href)).toThrow('expected a profile directory or cordis.yml')
    expect(() => profileLocation('https://example.test/cordis.yml')).toThrow('file-backed')
  })

  it('preserves user rows and updates only its marked patch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-patch-'))
    const location = { directory, filename: join(directory, 'cordis.patch.yml'), profileName: 'web' }
    await writeFile(location.filename, '# user note\n- id: custom\n  disabled: true\n', 'utf8')

    await writeDesiredState(location, 'feature', '@fixture/tool/client', false)
    let source = await readFile(location.filename, 'utf8')
    expect(source).toContain('# user note')
    expect(source).toContain('id: custom')
    expect(source).toContain('Managed by dsh-plugin-manager')
    expect(source).toContain('name: "@fixture/tool/client"')
    expect(source).toContain('disabled: true')

    await writeDesiredState(location, 'feature', '@fixture/tool/client', true)
    source = await readFile(location.filename, 'utf8')
    expect(source.match(/Managed by dsh-plugin-manager/g)).toHaveLength(1)
    expect(source).toContain('disabled: false')
  })

  it('fails loud on malformed or non-sequence user YAML', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-bad-patch-'))
    const location = { directory, filename: join(directory, 'cordis.patch.yml'), profileName: 'web' }
    await writeFile(location.filename, 'value: true\n', 'utf8')
    await expect(writeDesiredState(location, 'feature', 'fixture', false)).rejects.toThrow('YAML sequence')
  })
})
