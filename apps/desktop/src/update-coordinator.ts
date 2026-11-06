/** User-authorized downloads and separate installation of one version-bound Desktop release. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo, type UpdateCheckResult } from 'electron-updater'
import { gt, valid } from 'semver'
import type { DesktopUpdateState } from './ipc.ts'
import { DesktopUpdateHttpExecutor } from './updates/electron-updater/http-executor.ts'
import { DesktopUpdatePreparationError, downloadFailureDetails } from './update-error.ts'
import type { DesktopUpdateChannel } from './update-channel.ts'
import { selectUpdateChannel } from './updates/electron-updater/channel.ts'
import { discardDesktopUpdate } from './updates/electron-updater/discard.ts'

const { autoUpdater } = electronUpdater

/** Upstream repo for fallback version checks when the branch feed has no newer build. */
const UPSTREAM_REPO = 'deepseek-ai/deepseek-harness'
const FALLBACK_HTTP_TIMEOUT_MS = 15_000

/**
 * Whether the packaged application has an update source. On Linux the generic
 * provider writes app-update.yml (and publishes latest-linux.yml to the feed
 * URL); on Windows and macOS the provider writes app-update.yml.
 */
function updateSourceExists(): boolean {
  if (!app.isPackaged) return false
  return existsSync(join(process.resourcesPath, 'app-update.yml'))
    || existsSync(join(process.resourcesPath, 'latest-linux.yml'))
}

/**
 * Extract markdown release notes from an updater check result. Generic feeds
 * carry the notes as a plain markdown string in the update metadata.
 * @param updateInfo - Checked update metadata.
 * @returns Markdown notes, or undefined when the feed carries none.
 */
export function desktopUpdateReleaseNotes(updateInfo: UpdateInfo): string | undefined {
  const notes = updateInfo.releaseNotes
  if (typeof notes !== 'string') return undefined
  const trimmed = notes.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Query the upstream GitHub repository for its latest release tag version.
 * Returns the tag name without the leading "dsh-" prefix when it's a dsh-*
 * tag, otherwise returns the full tag name.
 * @returns Latest upstream version string, or undefined on any error.
 */
async function fetchUpstreamLatestVersion(): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FALLBACK_HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(
      `https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: controller.signal,
      },
    )
    if (!response.ok) return undefined
    const release = await response.json() as { tag_name?: string }
    if (typeof release.tag_name !== 'string') return undefined
    // Strip "dsh-v" prefix to get the semver: dsh-v0.2.3-alpha.1 → 0.2.3-alpha.1
    return release.tag_name.startsWith('dsh-') ? release.tag_name.slice(4) : release.tag_name
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Owns one updater target until its download and installation settle. */
export class DesktopUpdateCoordinator {
  private current: DesktopUpdateState = { phase: 'idle' }
  private release: { kind: 'none' } | { kind: 'checked' | 'downloaded' | 'handed-off'; version: string } = { kind: 'none' }
  private disposed = false
  private generation = 0
  private switching = 0
  private downloadGeneration = 0
  private switchTail: Promise<void> = Promise.resolve()
  private cancellation: UpdateCheckResult['cancellationToken']
  private configurationError: 'startup' | 'cleanup' | undefined
  private checkOperation: Promise<DesktopUpdateState> | undefined
  private downloadOperation: Promise<DesktopUpdateState> | undefined
  private installOperation: Promise<DesktopUpdateState> | undefined

  private readonly onProgress = (progress: ProgressInfo): void => {
    if (this.downloadGeneration !== this.generation || this.downloadOperation === undefined || this.downloaded) return
    const percent = Math.min(100, Math.max(0, progress.percent))
    this.setState({ phase: percent >= 100 ? 'verifying' : 'downloading', ...this.target(), percent })
  }

  private readonly onDownloaded = (info: UpdateInfo): void => {
    if (this.downloadGeneration !== this.generation || this.downloadOperation === undefined || info.version !== this.candidate) return
    this.release = { kind: 'downloaded', version: info.version }
  }

  private readonly onError = (error: Error): void => {
    if (this.current.phase === 'installing') {
      this.setState(this.failure(error, 'install'))
    }
  }

  /**
   * @param publish - Receives observable states for every Desktop window.
   * @param beforeRestart - Completes task authorization, admission locking, and owned-process shutdown.
   * @param updater - Process-owned Electron updater, replaceable at the network/platform test boundary.
   * @param enabled - Whether this process has a packaged update source.
   * @param currentVersion - Actual installed application version.
   * @param channel - Installed package channel; omitted test/local callers retain nightly.
   * @param discard - Clears settled library targets and platform resources before another channel is used.
   * @param downloadResult - Once per completed download attempt, including platform preparation failures.
   */
  constructor(
    private readonly publish: (state: DesktopUpdateState) => DesktopUpdateState,
    private readonly beforeRestart: () => Promise<boolean>,
    private readonly updater: AppUpdater = autoUpdater,
    private readonly enabled: () => boolean = () => updateSourceExists(),
    private readonly currentVersion: () => string = () => app.getVersion(),
    private readonly downloadResult?: (success: boolean, reason?: string) => void,
    private channel: DesktopUpdateChannel = 'nightly',
    private readonly discard: (updater: AppUpdater) => Promise<void> = discardDesktopUpdate,
  ) {
    if (updater === autoUpdater) {
      const transportOwner = updater as AppUpdater & { httpExecutor: DesktopUpdateHttpExecutor }
      transportOwner.httpExecutor = new DesktopUpdateHttpExecutor(
        Number(process.env.DSH_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS ?? 60_000),
        (authInfo, callback) => { updater.emit('login', authInfo, callback) },
      )
    }
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    selectUpdateChannel(this.updater, channel)
    this.updater.on('download-progress', this.onProgress)
    this.updater.on('update-downloaded', this.onDownloaded)
    this.updater.on('error', this.onError)
  }

  get state(): DesktopUpdateState { return this.current }

  /** Reason ordinary updates are suspended, independently of the last operation result. */
  get configurationFailure(): 'startup' | 'cleanup' | undefined { return this.configurationError }

  /** Selected runtime channel, including while a new feed is being checked. */
  get selectedChannel(): DesktopUpdateChannel { return this.channel }

  /** Revision captured by confirmations so channel changes invalidate old user actions. */
  get revision(): number { return this.generation }

  /**
   * Suspend ordinary updates when settings or previous-target cleanup are invalid.
   * @param detail - File path and safe diagnostic, without document contents.
   * @param reason - Startup validation or retirement of a previous target.
   */
  suspendConfiguration(detail: string, reason: 'startup' | 'cleanup' = 'startup'): void {
    this.configurationError = reason
    this.setState({ phase: 'error', failedOperation: 'configuration', message: detail })
  }

  /**
   * Persist a UI choice, retire the old target, and check the selected feed.
   * Accepted choices serialize; installation cannot start while any choice is pending.
   * Persistence failure leaves the previous channel and target intact. Cleanup failure
   * suspends updates until another explicit switch successfully retires the target.
   * @param channel - Validated UI choice.
   * @param persist - Atomic settings save; rejects before a choice is applied on failure.
   * @returns Whether the selection changed; healthy repeated choices preserve the current operation.
   */
  switchChannel(channel: DesktopUpdateChannel, persist: () => Promise<void>): Promise<'applied' | 'unchanged'> {
    this.assertLive()
    if (this.installOperation !== undefined || this.current.phase === 'installing' || this.release.kind === 'handed-off') {
      return Promise.reject(new Error('desktop update: installation is in progress'))
    }
    this.switching++
    const operation = this.switchTail.then(async () => {
      this.assertLive()
      if (channel === this.channel && this.configurationError === undefined) return 'unchanged' as const
      await persist()
      this.generation++
      this.cancellation?.cancel()
      await Promise.allSettled([this.checkOperation, this.downloadOperation])
      this.assertLive()
      this.release = { kind: 'none' }
      this.cancellation = undefined
      try { await this.discard(this.updater) } catch (error) {
        this.suspendConfiguration('desktop update: could not retire the previous update', 'cleanup')
        throw error
      }
      this.channel = channel
      selectUpdateChannel(this.updater, channel)
      this.configurationError = undefined
      this.setState({ phase: 'checking' })
      const result = await this.doCheck()
      if (result.phase === 'error') this.setState(result)
      return 'applied' as const
    }).finally(() => { this.switching-- })
    this.switchTail = operation.then(() => {}).catch(() => { /* The caller reports this selection's failure; later choices may retry. */ })
    return operation
  }

  /**
   * Check metadata without downloading, joining any current check.
   * @param manual - Whether a failed check must remain visible in the status indicator.
   * @returns The check result, including a silent automatic failure when applicable.
   */
  async check(manual = false): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.configurationError !== undefined || this.switching > 0
      || this.downloadOperation !== undefined || this.installOperation !== undefined || this.downloaded) return this.current
    if (!manual && this.current.phase === 'error' && this.current.failedOperation === 'download') return this.current
    this.checkOperation ??= Promise.resolve().then(() => this.doCheck())
      .finally(() => { this.checkOperation = undefined })
    const result = await this.checkOperation
    if (manual && result.phase === 'error') this.setState(result)
    return result
  }

  /**
   * @param version - Version shown in the user's download confirmation.
   * @param revision - Revision captured by the download confirmation; omitted uses the current target.
   * @returns Download readiness or failure, without authorizing installation.
   */
  async download(version: string, revision = this.generation): Promise<DesktopUpdateState> {
    this.assertLive()
    if (revision !== this.generation || this.configurationError !== undefined || this.switching > 0) return this.current
    if (this.downloaded || this.installOperation !== undefined) return this.current
    const generation = this.generation
    this.downloadGeneration = generation
    this.downloadOperation ??= Promise.resolve().then(async () => {
      await this.checkOperation
      if (generation !== this.generation) return this.current
      this.assertLive()
      if (this.candidate === undefined) throw new Error('desktop update: no checked update is available')
      if (version !== this.candidate) throw new Error('desktop update: download confirmation is stale')
      this.setState({ phase: 'downloading', version, percent: 0 })
      try {
        await this.updater.downloadUpdate(this.cancellation)
        if (generation !== this.generation || this.disposed) return this.current
        if (!this.downloaded) throw new Error('desktop update: platform preparation did not report readiness')
        this.downloadResult?.(true)
        return this.setState({ phase: 'ready', version })
      } catch (error) {
        if (generation !== this.generation || this.disposed) return this.current
        this.release = { kind: 'checked', version }
        this.downloadResult?.(false, error instanceof DesktopUpdatePreparationError ? error.kind : 'download_failed')
        return this.setState(this.failure(error, 'download'))
      }
    }).finally(() => { this.downloadOperation = undefined })
    return this.downloadOperation
  }

  /**
   * Install a prepared target after a separate user confirmation.
   * @param version - Exact version displayed in the confirmation, never a renderer-selected URL.
   * @param revision - Revision captured when the confirmation began; omitted uses the current target.
   * @returns Installation handoff or a recoverable preparation error.
   */
  async install(version: string, revision = this.generation): Promise<DesktopUpdateState> {
    this.assertLive()
    if (revision !== this.generation) return this.current
    if (this.configurationError !== undefined || this.switching > 0) throw new Error('desktop update: channel selection is not ready')
    if (!this.downloaded || this.downloadOperation !== undefined || version !== this.candidate) throw new Error('desktop update: confirmed target is not ready')
    this.installOperation ??= Promise.resolve().then(async () => {
      this.setState({ phase: 'installing', version })
      try {
        if (!await this.beforeRestart()) return this.setState({ phase: 'ready', version })
        this.assertLive()
        this.release = { kind: 'handed-off', version }
        this.updater.quitAndInstall(true, true)
        return this.current
      } catch (error) {
        if (this.current.phase === 'error' && this.current.failedOperation === 'install') return this.current
        return this.setState(this.failure(error, 'install'))
      }
    }).finally(() => { this.installOperation = undefined })
    return this.installOperation
  }

  dispose(): void {
    this.disposed = true
    this.updater.off('download-progress', this.onProgress)
    this.updater.off('update-downloaded', this.onDownloaded)
    // Pending updater promises can still emit EventEmitter errors during shutdown.
    void Promise.allSettled([this.checkOperation, this.downloadOperation, this.installOperation, this.switchTail])
      .then(() => { this.updater.off('error', this.onError) })
  }

  private get candidate(): string | undefined { return this.release.kind === 'none' ? undefined : this.release.version }

  private get downloaded(): boolean { return this.release.kind === 'downloaded' || this.release.kind === 'handed-off' }

  private assertLive(): void {
    if (this.disposed) throw new Error('desktop update: coordinator is disposed')
  }

  private setState(state: DesktopUpdateState): DesktopUpdateState {
    if (!this.disposed) {
      this.current = state
      this.publish(state)
    }
    return state
  }

  private failure(error: unknown, failedOperation: 'check' | 'download' | 'install'): DesktopUpdateState {
    return { phase: 'error', ...this.target(), failedOperation,
      message: error instanceof Error ? error.message : String(error),
      ...(failedOperation === 'download' ? downloadFailureDetails(error) : {}),
      ...(error instanceof DesktopUpdatePreparationError ? {
        preparationFailure: error.kind,
        ...(error.technicalDetails === undefined ? {} : { technicalDetails: error.technicalDetails }),
      } : {}) }
  }

  private target(): { version?: string } {
    return this.candidate === undefined ? {} : { version: this.candidate }
  }  private async doCheck(): Promise<DesktopUpdateState> {
    try {
      this.assertLive()
      if (!this.enabled()) throw new Error('desktop update: this application has no packaged update source')
      // Level 1: check the branch's own update feed
      let branchCheckFailed = false
      try {
        const result = await this.updater.checkForUpdates()
        if (result !== null) {
          const version = result.updateInfo.version
          if (valid(version) === null) throw new Error('desktop update: feed version is invalid')
          if (this.channel === 'stable' && version.includes('-')) throw new Error('desktop update: stable feed contains a prerelease')
          const hasBranchUpdate = result.isUpdateAvailable && gt(version, this.currentVersion())
          if (hasBranchUpdate) {
            const notes = desktopUpdateReleaseNotes(result.updateInfo)
            this.release = { kind: 'checked', version }
            return this.setState({ phase: 'available', version, ...(notes === undefined ? {} : { notes }) })
          }
        }
      } catch (_branchError) {
        // Branch feed failed (e.g. no linux-latest tag published yet) — proceed to upstream
        branchCheckFailed = true
      }
      // Level 2: fall back to upstream GitHub releases
      const upstreamVersion = await fetchUpstreamLatestVersion()
      if (upstreamVersion !== undefined && gt(upstreamVersion, this.currentVersion())) {
        return this.setState({ phase: 'upstream_available', version: upstreamVersion })
      }
      // Both branch and upstream have nothing newer
      this.release = { kind: 'none' }
      if (branchCheckFailed) {
        return this.setState({ phase: 'no_release' })
      }
      return this.setState({ phase: 'idle' })
    } catch (error) {
      return this.failure(error, 'check')
    }
  }
}
