/** User-authorized downloads and separate installation of one version-bound Desktop release. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { gt, valid } from 'semver'
import type { DesktopUpdateState } from './ipc.ts'
import { DesktopUpdateHttpExecutor } from './update-http-executor.ts'
import { DesktopUpdatePreparationError } from './update-error.ts'

const { autoUpdater } = electronUpdater

/** Upstream repo for fallback version checks when the branch feed has no newer build. */
const UPSTREAM_REPO = 'deepseek-ai/deepseek-harness'
const FALLBACK_HTTP_TIMEOUT_MS = 15_000

/**
 * Whether the packaged application has an update source. On Linux the generic
 * provider writes latest-linux.yml instead of app-update.yml.
 */
function updateSourceExists(): boolean {
  if (!app.isPackaged) return false
  if (process.platform === 'linux') return existsSync(join(process.resourcesPath, 'latest-linux.yml'))
  return existsSync(join(process.resourcesPath, 'app-update.yml'))
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
  private candidate: string | undefined
  private downloaded = false
  private disposed = false
  private checkOperation: Promise<DesktopUpdateState> | undefined
  private downloadOperation: Promise<DesktopUpdateState> | undefined
  private installOperation: Promise<DesktopUpdateState> | undefined

  private readonly onProgress = (progress: ProgressInfo): void => {
    if (this.downloadOperation === undefined || this.downloaded) return
    const percent = Math.min(100, Math.max(0, progress.percent))
    this.setState({ phase: percent >= 100 ? 'verifying' : 'downloading', ...this.target(), percent })
  }

  private readonly onDownloaded = (info: UpdateInfo): void => {
    if (this.downloadOperation === undefined || info.version !== this.candidate) return
    this.downloaded = true
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
   * @param downloadResult - Once per completed download attempt, including platform preparation failures.
   */
  constructor(
    private readonly publish: (state: DesktopUpdateState) => DesktopUpdateState,
    private readonly beforeRestart: () => Promise<boolean>,
    private readonly updater: AppUpdater = autoUpdater,
    private readonly enabled: () => boolean = () => updateSourceExists(),
    private readonly currentVersion: () => string = () => app.getVersion(),
    private readonly downloadResult?: (success: boolean, reason?: string) => void,
    private readonly channel: 'nightly' | 'latest' = 'nightly',
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
    this.updater.channel = channel
    this.updater.allowPrerelease = channel === 'nightly'
    this.updater.allowDowngrade = false
    this.updater.on('download-progress', this.onProgress)
    this.updater.on('update-downloaded', this.onDownloaded)
    this.updater.on('error', this.onError)
  }

  get state(): DesktopUpdateState { return this.current }

  async check(manual = false): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloadOperation !== undefined || this.installOperation !== undefined || this.downloaded) return this.current
    if (!manual && this.current.phase === 'error' && this.current.failedOperation === 'download') return this.current
    this.checkOperation ??= Promise.resolve().then(() => this.doCheck())
      .finally(() => { this.checkOperation = undefined })
    const result = await this.checkOperation
    if (manual && result.phase === 'error') this.setState(result)
    return result
  }

  async download(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloaded || this.installOperation !== undefined) return this.current
    this.downloadOperation ??= Promise.resolve().then(async () => {
      await this.checkOperation
      this.assertLive()
      if (this.candidate === undefined) throw new Error('desktop update: no checked update is available')
      if (version !== this.candidate) throw new Error('desktop update: download confirmation is stale')
      this.setState({ phase: 'downloading', version, percent: 0 })
      try {
        await this.updater.downloadUpdate()
        if (!this.downloaded) throw new Error('desktop update: platform preparation did not report readiness')
        this.downloadResult?.(true)
        return this.setState({ phase: 'ready', version })
      } catch (error) {
        this.downloaded = false
        this.downloadResult?.(false, error instanceof DesktopUpdatePreparationError ? error.kind : 'download_failed')
        return this.setState(this.failure(error, 'download'))
      }
    }).finally(() => { this.downloadOperation = undefined })
    return this.downloadOperation
  }

  async install(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    if (!this.downloaded || this.downloadOperation !== undefined || version !== this.candidate) throw new Error('desktop update: confirmed target is not ready')
    this.installOperation ??= Promise.resolve().then(async () => {
      this.setState({ phase: 'installing', version })
      try {
        if (!await this.beforeRestart()) return this.setState({ phase: 'ready', version })
        this.assertLive()
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
    void Promise.allSettled([this.checkOperation, this.downloadOperation, this.installOperation])
      .then(() => { this.updater.off('error', this.onError) })
  }

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
      ...(error instanceof DesktopUpdatePreparationError ? {
        preparationFailure: error.kind,
        ...(error.technicalDetails === undefined ? {} : { technicalDetails: error.technicalDetails }),
      } : {}) }
  }

  private target(): { version?: string } {
    return this.candidate === undefined ? {} : { version: this.candidate }
  }

  private async doCheck(): Promise<DesktopUpdateState> {
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
          if (this.channel === 'latest' && version.includes('-')) throw new Error('desktop update: latest feed contains a prerelease')
          const hasBranchUpdate = result.isUpdateAvailable && gt(version, this.currentVersion())
          if (hasBranchUpdate) {
            const notes = desktopUpdateReleaseNotes(result.updateInfo)
            this.candidate = version
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
      this.candidate = undefined
      if (branchCheckFailed) {
        return this.setState({ phase: 'no_release' })
      }
      return this.setState({ phase: 'idle' })
    } catch (error) {
      return this.failure(error, 'check')
    }
  }
}