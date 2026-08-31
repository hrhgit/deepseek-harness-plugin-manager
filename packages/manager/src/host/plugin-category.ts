import type { PluginCategory } from '../types.js'
import { isOfficialPackage } from './official-package-registry.js'

export const OFFICIAL_CATEGORY = 'official'
export const THIRD_PARTY_CATEGORY = 'third-party'
export const AUTOMATIC_CATEGORIES = [OFFICIAL_CATEGORY, THIRD_PARTY_CATEGORY] as const satisfies readonly PluginCategory[]

/** Classify every package root against the checked-in official registry. */
export function pluginCategory(packageName: string): PluginCategory {
  return isOfficialPackage(packageName) ? OFFICIAL_CATEGORY : THIRD_PARTY_CATEGORY
}
