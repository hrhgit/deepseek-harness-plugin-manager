import { describe, expect, it } from 'vitest'
import { TYPERT, TYPERT_REMOTE } from '../src/remote.js'

describe('marketplace Remote contribution', () => {
  it('publishes strict list, candidate search, and install descriptors', () => {
    expect(TYPERT_REMOTE.descriptors.map(item => `${item.namespace}/${item.method}`)).toEqual([
      'pluginMarketplace/list', 'pluginMarketplace/searchGithub', 'pluginMarketplace/install',
    ])
    expect(TYPERT.invocations).toBe(TYPERT_REMOTE.descriptors)
    for (const descriptor of TYPERT_REMOTE.descriptors) {
      expect(descriptor.result.mode).toBe('strict')
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode).toBe('strict')
    }
  })
})
