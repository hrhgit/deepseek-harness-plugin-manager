import { describe, expect, it } from 'vitest'
import { OFFICIAL_PACKAGE_REGISTRY } from '../src/host/official-package-registry.js'
import { AUTOMATIC_CATEGORIES, OFFICIAL_CATEGORY, pluginCategory, THIRD_PARTY_CATEGORY } from '../src/host/plugin-category.js'

describe('pluginCategory', () => {
  it('classifies only exact official registry entries as official', () => {
    expect(AUTOMATIC_CATEGORIES).toEqual([OFFICIAL_CATEGORY, THIRD_PARTY_CATEGORY])
    expect(pluginCategory('@deepseek-ai/dsh-session')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('@deepseek-ai/dsh-client-runtime')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('cordis:include')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('dsh-plugin-manager')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('dsh-model-manager')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('dsh-oauth-newapi')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('@community/plugin')).toBe(THIRD_PARTY_CATEGORY)
  })

  it('keeps the checked-in official registry unique and ordered', () => {
    expect(OFFICIAL_PACKAGE_REGISTRY).toContain('@deepseek-ai/dsh-client-runtime')
    expect(new Set(OFFICIAL_PACKAGE_REGISTRY).size).toBe(OFFICIAL_PACKAGE_REGISTRY.length)
    expect(OFFICIAL_PACKAGE_REGISTRY).toEqual([...OFFICIAL_PACKAGE_REGISTRY].sort((left, right) => left.localeCompare(right)))
  })
})
