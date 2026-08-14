import { spawn } from 'node:child_process'
import { valid as validVersion } from 'semver'
import type { InstallReceipt } from '../types.js'
import type { ProfileLocation } from './profile.js'

const OUTPUT_LIMIT = 16_384

export interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type CommandRunner = (arguments_: readonly string[], cwd: string) => Promise<CommandResult>

export interface MarketplaceInstallTarget {
  readonly packageName: string
  readonly version: string
}

function boundedAppend(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8')
  return next.length <= OUTPUT_LIMIT ? next : next.slice(next.length - OUTPUT_LIMIT)
}

/** Execute the current Node-based dsh launcher without shell interpolation. */
export function currentDshRunner(timeoutMs = 120_000): CommandRunner {
  return async (arguments_, cwd) => {
    const launcher = process.argv[1]
    if (launcher === undefined || launcher === '') throw new Error('Cannot locate the current dsh launcher entrypoint.')
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(process.execPath, [launcher, ...arguments_], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => { stdout = boundedAppend(stdout, chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = boundedAppend(stderr, chunk) })
      child.once('error', reject)
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error(`dsh plugin install timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      child.once('close', code => {
        clearTimeout(timeout)
        resolve({ exitCode: code ?? 1, stdout, stderr })
      })
    })
  }
}

/** Serialized exact-version npm installation through the official dsh plugin boundary. */
export class MarketplaceInstaller {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly runner: CommandRunner = currentDshRunner()) {}

  async install(
    plugin: MarketplaceInstallTarget,
    location: ProfileLocation,
    dependencies: Readonly<Record<string, string>>,
  ): Promise<InstallReceipt> {
    return await this.serialize(async () => {
      if (validVersion(plugin.version) !== plugin.version) throw new Error('Marketplace install requires an exact semantic version.')
      const installed = dependencies[plugin.packageName]
      if (installed !== undefined) {
        return {
          status: 'already-installed',
          profileName: location.profileName,
          packageName: plugin.packageName,
          version: installed,
          restartRequired: false,
          message: `${plugin.packageName} is already present in profile ${location.profileName}.`,
        }
      }
      const result = await this.runner([
        'plugin', '--profile', location.profileName, 'add', `${plugin.packageName}@${plugin.version}`, '--save-exact',
      ], location.directory)
      if (result.exitCode !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`
        throw new Error(`Failed to install ${plugin.packageName}@${plugin.version}: ${detail}`)
      }
      return {
        status: 'installed',
        profileName: location.profileName,
        packageName: plugin.packageName,
        version: plugin.version,
        restartRequired: true,
        message: `Installed ${plugin.packageName}@${plugin.version}. Restart profile ${location.profileName} to load its bundle.`,
      }
    })
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise(resolve => { release = resolve })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}
