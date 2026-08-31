import { describe, expect, it } from 'vitest'
import { installTargetKey } from '../src/host/install-target.js'

describe('marketplace install target key', () => {
  it('keeps distinct published versions independently installable', () => {
    expect(installTargetKey({ packageName: 'dsh-example', version: '1.0.0' }))
      .not.toBe(installTargetKey({ packageName: 'dsh-example', version: '1.1.0' }))
  })
})
