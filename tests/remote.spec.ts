import { describe, expect, it } from 'vitest'
import { TYPERT, TYPERT_REMOTE } from '../src/remote.js'

describe('plugin manager Remote contribution', () => {
  it('publishes the same three strict descriptors to Host and Client faces', () => {
    expect(TYPERT_REMOTE.descriptors.map(item => `${item.namespace}/${item.method}`)).toEqual([
      'pluginManager/list', 'pluginManager/setEnabled', 'pluginManager/setPackageEnabled',
    ])
    expect(TYPERT.invocations).toBe(TYPERT_REMOTE.descriptors)
    for (const descriptor of TYPERT_REMOTE.descriptors) {
      expect(descriptor.result.mode).toBe('strict')
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode).toBe('strict')
    }
  })
})
