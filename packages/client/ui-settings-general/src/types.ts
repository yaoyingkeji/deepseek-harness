/** Type-only Electron update declarations shared by the settings UI and Desktop compatibility checks. */

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'configuration'
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'download-space'
  | 'download-permission'
  | 'download-busy'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'
  | 'fullscreen-timeout'
  | 'no-release'
  | 'upstream-available'

/** Public semantic preload fields consumed by the settings row. */
export interface DesktopUpdatePresentation {
  readonly phase: 'idle' | 'checking' | 'available' | 'upstream_available' | 'no_release' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
  readonly configurationError?: DesktopChannelState['error']
}

/** Optional carrier API; it cannot select artifacts or authorize installation. */
export interface DesktopUpdateBridge {
  readonly channels?: DesktopChannelBridge
  status(): Promise<DesktopUpdatePresentation>
  open(): Promise<void>
  subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
}

/** Close-button behavior: keep the app in the background tray or exit completely. */
export type DesktopCloseBehavior = 'hide' | 'quit'

/** Optional carrier API for the close-button behavior preference. */
export interface DesktopCloseBehaviorBridge {
  get(): Promise<DesktopCloseBehavior>
  set(behavior: DesktopCloseBehavior): Promise<void>
}

/** Desktop notification categories configurable from the General settings. */
export type DesktopNotificationCategory = 'approval' | 'question' | 'job' | 'subagent' | 'credential' | 'remote' | 'session' | 'plugin' | 'schedule' | 'goal'

/** Notification switch keys: the seven categories plus the focus-mode preference. */
export type DesktopNotificationSwitchKey = DesktopNotificationCategory | 'focused' | 'nonCurrentSession' | 'trayFlash' | `sticky:${DesktopNotificationCategory}`

/**
 * Resolved notification category switches plus the focus-mode preference.
 * Category keys select which event kinds notify; `focused` decides whether
 * notifications also appear while the window has focus (false = only while
 * unfocused; true = always). `sticky` records per-category whether the
 * notification stays open until the user dismisses it (timeoutType 'never').
 */
export type DesktopNotificationSettings = Record<DesktopNotificationCategory, boolean> & {
  focused: boolean
  nonCurrentSession: boolean
  trayFlash: boolean
  sticky: Record<DesktopNotificationCategory, boolean>
}

/** Categories off by default because they can flood the user with notices. */
export const DESKTOP_NOTIFICATION_RECOMMENDED_DISABLED: readonly DesktopNotificationCategory[] = ['subagent', 'credential', 'remote', 'session', 'plugin', 'schedule']

/** Default notification settings shared with the Desktop shell (apps/desktop/src/settings.ts). */
export const DESKTOP_NOTIFICATION_DEFAULTS: DesktopNotificationSettings = {
  approval: true, question: true, job: true, subagent: false, credential: false, remote: false, session: false,
  plugin: true, schedule: true, goal: true,
  focused: false, nonCurrentSession: true, trayFlash: true,
  sticky: { approval: false, question: false, job: false, subagent: false, credential: true, remote: true, session: false, plugin: false, schedule: false, goal: false },
}

/** Optional carrier API for the desktop notification category switches. */
export interface DesktopNotificationsBridge {
  get(): Promise<DesktopNotificationSettings>
  set(category: DesktopNotificationSwitchKey, enabled: boolean): Promise<void>
  reset(): Promise<DesktopNotificationSettings>
}

/** Shared carrier status for the account row and collapsed sidebar badge. */
export interface DesktopUpdateView {
  readonly presentation?: DesktopUpdatePresentation
  readonly failed: boolean
  readonly opening: boolean
}

/** Shell-owned channel choices exposed through the isolated preload. */
export type DesktopUpdateChannel = 'nightly' | 'stable'

/** Current runtime selection and application status; failure never implies a successful switch. */
export interface DesktopChannelState {
  readonly channel: DesktopUpdateChannel | null
  readonly packagedChannel: DesktopUpdateChannel
  readonly changing: boolean
  readonly error?: 'read' | 'format' | 'channel' | 'cleanup'
}

/** Outcome of one UI action; failures are not global updater state. */
export type DesktopChannelChangeResult =
  | { readonly kind: 'applied' | 'unchanged'; readonly state: DesktopChannelState }
  | { readonly kind: 'failed'; readonly state: DesktopChannelState; readonly reason: 'save' | 'format' | 'permission' | 'apply' | 'uncertain' }

/** UI choices persist in the shell configuration, independently of Host settings. */
export interface DesktopChannelBridge {
  /** @returns Current shell selection and application status, without reading disk again. */
  get(): Promise<DesktopChannelState>
  /**
   * @param channel - Explicit user choice to persist and apply.
   * @returns The resulting selection or failure; it does not authorize installation.
   */
  set(channel: DesktopUpdateChannel): Promise<DesktopChannelChangeResult>
  /**
   * @param listener - Receives changes made from any Desktop window.
   * @returns Removes this window's subscription.
   */
  subscribe(listener: (state: DesktopChannelState) => void): () => void
}
