/**
 * Desktop notification bridge: a best-effort wrapper around the Electron
 * preload's `globalThis.dshDesktop.notify` IPC. Shared by all UI plugin
 * packages so the language cache, error swallowing, and bridge typing live
 * in one place. Placed in ui-primitives per the Bundle Purity rule (shared
 * runtime code belongs in a static infrastructure owner such as ui-primitives).
 */

/** Every notification category the desktop shell recognises. */
export type DesktopNotifyCategory =
  | 'approval' | 'question' | 'job' | 'subagent' | 'credential'
  | 'remote' | 'session' | 'plugin' | 'schedule' | 'goal'

let cachedZh: boolean | undefined

/**
 * Send a desktop notification through the Electron preload bridge.
 *
 * Notifications are a best-effort enhancement: a missing DOM (tests, SSR),
 * a missing bridge, or a failing IPC must never break the core feature flow.
 * @param category - Notification category (filtered by the General settings).
 * @param titleZh - Chinese notification title.
 * @param bodyZh - Chinese notification body.
 * @param titleEn - English notification title.
 * @param bodyEn - English notification body.
 * @param sessionId - Session the notification belongs to.
 */
export function desktopNotify(
  category: DesktopNotifyCategory,
  titleZh: string,
  bodyZh: string,
  titleEn: string,
  bodyEn: string,
  sessionId?: string,
): void {
  try {
    if (cachedZh === undefined) {
      const root = typeof document === 'undefined' ? undefined : document.documentElement
      cachedZh = root === undefined
        ? false
        : (root.lang || navigator.language || 'en').toLowerCase().startsWith('zh')
    }
    const zh = cachedZh
    void (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; notify?: (input: { category: DesktopNotifyCategory; title: string; body: string; sessionId?: string }) => Promise<void> } })
      .dshDesktop?.notify?.({
        category,
        title: zh ? titleZh : titleEn,
        body: zh ? bodyZh : bodyEn,
        ...(sessionId === undefined ? {} : { sessionId }),
      })
  } catch {
    // ignore: notification delivery must never throw into the caller path
  }
}
