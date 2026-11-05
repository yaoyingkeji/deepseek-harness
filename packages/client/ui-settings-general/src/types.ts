/** Type-only Electron update declarations shared by the settings UI and Desktop compatibility checks. */

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
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
}

/** Optional carrier API; it cannot select artifacts or authorize installation. */
export interface DesktopUpdateBridge {
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
export type DesktopNotificationCategory = 'approval' | 'question' | 'job' | 'subagent' | 'credential' | 'remote' | 'session'

/** Notification switch keys: the seven categories plus the focus-mode preference. */
export type DesktopNotificationSwitchKey = DesktopNotificationCategory | 'focused'

/**
 * Resolved notification category switches plus the focus-mode preference.
 * Category keys select which event kinds notify; `focused` decides whether
 * notifications also appear while the window has focus (false = only while
 * unfocused; true = always).
 */
export type DesktopNotificationSettings = Record<DesktopNotificationCategory, boolean> & { focused: boolean }

/** Categories off by default because they can flood the user with notices. */
export const DESKTOP_NOTIFICATION_RECOMMENDED_DISABLED: readonly DesktopNotificationCategory[] = ['subagent', 'credential', 'remote', 'session']

/** Optional carrier API for the desktop notification category switches. */
export interface DesktopNotificationsBridge {
  get(): Promise<DesktopNotificationSettings>
  set(category: DesktopNotificationSwitchKey, enabled: boolean): Promise<void>
}

/** Shared carrier status for the account row and collapsed sidebar badge. */
export interface DesktopUpdateView {
  readonly presentation?: DesktopUpdatePresentation
  readonly failed: boolean
  readonly opening: boolean
}