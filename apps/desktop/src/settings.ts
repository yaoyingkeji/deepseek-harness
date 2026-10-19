/**
 * Local Electron shell settings, loaded once per process independently of the Host.
 * Ownership: .agents/notes/implemented/architecture/2026-10-08-desktop-shell-configuration.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Resolved shell preferences; absent fields use the defaults without rewriting existing files. */
export interface DesktopSettings {
  readonly updates: {
    readonly allowTestAuthPopupWindow: boolean
  }
  readonly window: {
    /** Behavior of the window close button: hide to the tray or quit. */
    readonly closeBehavior: DesktopCloseBehavior
  }
  readonly notifications: {
    /** Desktop notifications when the model requests permission approval. */
    readonly approval: boolean
    /** Desktop notifications when the model asks the user a question. */
    readonly question: boolean
    /** Desktop notifications when a background job settles. */
    readonly job: boolean
  }
}

/** Close-button behavior: keep the app in the background tray or exit completely. */
export type DesktopCloseBehavior = 'hide' | 'quit'

/** Notification categories that can be toggled from the General settings. */
export type DesktopNotificationCategory = 'approval' | 'question' | 'job' | 'subagent' | 'credential' | 'remote'

/** Resolved notification category switches, all enabled by default. */
export type DesktopNotificationSettings = Record<DesktopNotificationCategory, boolean>

/**
 * Categories that can flood the user with notices and are therefore off by
 * default; the General settings marks them with a recommendation warning.
 */
export const DESKTOP_NOTIFICATION_RECOMMENDED_DISABLED: readonly DesktopNotificationCategory[] = ['subagent', 'credential', 'remote']

/** Every notification category with its default-enabled state. */
export const DESKTOP_NOTIFICATION_DEFAULTS: DesktopNotificationSettings = {
  approval: true,
  question: true,
  job: true,
  subagent: false,
  credential: false,
  remote: false,
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read shell settings, creating the default document exclusively when missing.
 * @param userData - Electron's userData directory, independent of DSH_HOME.
 * @returns Validated settings, or defaults when reading, creating or validating fails; changes require a restart.
 */
export function readDesktopSettings(userData: string): DesktopSettings {
  const directory = join(userData, 'desktop')
  const path = join(directory, 'settings.json')
  const defaults: DesktopSettings = {
    updates: { allowTestAuthPopupWindow: false },
    window: { closeBehavior: 'hide' },
    notifications: { ...DESKTOP_NOTIFICATION_DEFAULTS },
  }
  try {
    let raw: string
    try { raw = readFileSync(path, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      try { writeFileSync(path, `${JSON.stringify(defaults, null, 2)}\n`, { flag: 'wx', mode: 0o600 }) } catch (error) {
        // An existing document belongs to the user, including one created during initialization.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      raw = readFileSync(path, 'utf8')
    }
    const value: unknown = JSON.parse(raw)
    if (!record(value) || (value.updates !== undefined && !record(value.updates))) {
      throw new Error('expected a JSON object with an optional updates object')
    }
    const allow = value.updates?.allowTestAuthPopupWindow
    if (allow !== undefined && typeof allow !== 'boolean') {
      throw new Error('updates.allowTestAuthPopupWindow must be true or false')
    }
    if (value.window !== undefined && !record(value.window)) {
      throw new Error('window must be an object')
    }
    const closeBehavior = value.window?.closeBehavior
    if (closeBehavior !== undefined && closeBehavior !== 'hide' && closeBehavior !== 'quit') {
      throw new Error('window.closeBehavior must be "hide" or "quit"')
    }
    if (value.notifications !== undefined && !record(value.notifications)) {
      throw new Error('notifications must be an object')
    }
    const notifications: DesktopNotificationSettings = { ...DESKTOP_NOTIFICATION_DEFAULTS }
    for (const category of ['approval', 'question', 'job', 'subagent', 'credential', 'remote'] as const) {
      const enabled = value.notifications?.[category]
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        throw new Error(`notifications.${category} must be true or false`)
      }
      notifications[category] = enabled ?? DESKTOP_NOTIFICATION_DEFAULTS[category]
    }
    return {
      updates: { allowTestAuthPopupWindow: allow ?? false },
      window: { closeBehavior: closeBehavior ?? 'hide' },
      notifications,
    }
  } catch (error) {
    try {
      console.warn(`desktop settings: ${path}: using defaults because settings could not be loaded`, error)
    } catch (_logError) {
      // Diagnostic output is best effort; its failure must not make optional settings fatal.
      // TODO: Persist settings diagnostics when console output is unavailable, without blocking startup.
    }
    return defaults
  }
}

/**
 * Persist shell settings after a runtime change. The document is created or
 * replaced atomically enough for the single main process that owns it.
 * @param userData - Electron's userData directory, independent of DSH_HOME.
 * @param settings - Complete validated settings document to write.
 */
export function writeDesktopSettings(userData: string, settings: DesktopSettings): void {
  const directory = join(userData, 'desktop')
  const path = join(directory, 'settings.json')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
}
