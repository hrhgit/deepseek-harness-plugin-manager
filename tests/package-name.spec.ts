import { describe, expect, it } from 'vitest'
import { packageRoot } from '../src/host/package-name.js'

describe('packageRoot', () => {
  it('groups scoped and unscoped module subpaths without merging Cordis builtins', () => {
    expect(packageRoot('@scope/tool/client')).toBe('@scope/tool')
    expect(packageRoot('dsh-example/host')).toBe('dsh-example')
    expect(packageRoot('cordis:group')).toBe('cordis:group')
  })
})
