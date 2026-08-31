import type { MarketplaceInstallTarget } from './installer.js'

/** Stable authorization key for the exact npm artifact admitted by the catalog. */
export function installTargetKey(target: MarketplaceInstallTarget): string {
  return JSON.stringify([target.packageName, target.version])
}
