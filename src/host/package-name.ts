/** Derive the package-like root used to group module subpath entries. */
export function packageRoot(moduleName: string): string {
  if (moduleName.startsWith('cordis:')) return moduleName
  const parts = moduleName.split('/')
  if (moduleName.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : moduleName
  return parts[0] ?? moduleName
}
