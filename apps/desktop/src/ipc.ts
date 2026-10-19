/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@deepseek-ai/dsh-client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  shortcutsInput: 'dsh-desktop:shortcuts-input',
  shortcutsCloseWindow: 'dsh-desktop:shortcuts-close-window',
  shortcutsGet: 'dsh-desktop:shortcuts-get',
  shortcutsEdit: 'dsh-desktop:shortcuts-edit',
  shortcutsChanged: 'dsh-desktop:shortcuts-changed',
  shortcutsRecording: 'dsh-desktop:shortcuts-recording',
  boot: 'dsh-desktop:boot',
  enterWorkspace: 'dsh-desktop:enter-workspace',
  onboardingActive: 'dsh-desktop:onboarding-active',
  onboardingApiKey: 'dsh-desktop:onboarding-api-key',
  bootFailed: 'dsh-desktop:boot-failed',
  browserAcquire: 'dsh-desktop:browser-acquire',
  browserRelease: 'dsh-desktop:browser-release',
  browserOpenRequested: 'dsh-desktop:browser-open-requested',
  directoryPick: 'dsh-desktop:directory-pick',
  deviceInfo: 'dsh-desktop:device-info',
  localeBootstrap: 'dsh-desktop:locale-bootstrap',
  localeChanged: 'dsh-desktop:locale-changed',
  updatesStatus: 'dsh-desktop:updates-status',
  updatesOpen: 'dsh-desktop:updates-open',
  updatesPresentation: 'dsh-desktop:updates-presentation',
  windowCloseBehaviorGet: 'dsh-desktop:window-close-behavior-get',
  windowCloseBehaviorSet: 'dsh-desktop:window-close-behavior-set',
  notificationsGet: 'dsh-desktop:notifications-get',
  notificationsSet: 'dsh-desktop:notifications-set',
  notify: 'dsh-desktop:notify',
  notifyAction: 'dsh-desktop:notify-action',
  nativeThemeSet: 'dsh-desktop:native-theme-set',
  windowFullscreen: 'dsh-desktop:window-fullscreen',
  windowMaximized: 'dsh-desktop:window-maximized',
  windowMinimize: 'dsh-desktop:window-minimize',
  windowToggleMaximize: 'dsh-desktop:window-toggle-maximize',
  windowClose: 'dsh-desktop:window-close',
  windowsAppearance: 'dsh-desktop:windows-appearance',
  windowsMenu: 'dsh-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  /** Markdown release notes carried by the update feed, shown in the update prompt. */
  readonly notes?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
}

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

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** Close-button behavior: keep the app in the background tray or exit completely. */
export type DesktopCloseBehavior = 'hide' | 'quit'

/** Desktop notification categories configurable from the General settings. */
export type DesktopNotificationCategory = 'approval' | 'question' | 'job' | 'subagent' | 'credential' | 'remote'

/** Resolved notification category switches. */
export type DesktopNotificationSettings = Record<DesktopNotificationCategory, boolean>

/** Localized notification payload sent by the web client. */
export interface DesktopNotifyInput {
  readonly category: DesktopNotificationCategory
  readonly title: string
  readonly body: string
  /** Session the notification belongs to; returned on notification click so the UI can surface its panel. */
  readonly sessionId?: string
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface DshDesktopProductApi {
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  readonly updates: {
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
  readonly closeBehavior: {
    get(): Promise<DesktopCloseBehavior>
    set(behavior: DesktopCloseBehavior): Promise<void>
  }
  /**
   * Show a native desktop notification (approval requests, user questions,
   * finished jobs) while the application window is not focused. Categories
   * disabled in the General settings are filtered out here.
   * @param input - Category plus localized title and body.
   */
  notify(input: DesktopNotifyInput): Promise<void>
  readonly notifications: {
    get(): Promise<DesktopNotificationSettings>
    set(category: DesktopNotificationCategory, enabled: boolean): Promise<void>
  }
  /**
   * Subscribe to notification clicks. The shell focuses the window and then
   * pushes the notification's session (when known) so the UI can surface its
   * pending approval or question panel.
   * @param listener - Receives the notification session id, or undefined.
   * @returns unsubscribe function.
   */
  onNotifyAction(listener: (sessionId: string | undefined) => void): () => void
}

/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'dsh-app'

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('dsh desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error('dsh desktop: rejected IPC from an unowned renderer')
  }
}
