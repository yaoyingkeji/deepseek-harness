/**
 * Shared desktop-notification helper: sends a native notification through the
 * Electron shell bridge (`globalThis.dshDesktop.notify`) when present. The
 * language is detected once and cached; ordinary browsers and focused windows
 * are handled by the shell's notify handler.
 */

/** Cached result of the Chinese-locale detection. */
let cachedZh: boolean | undefined

/** Detect whether the active locale is Chinese, caching the result. */
function detectZh(): boolean {
  if (cachedZh !== undefined) return cachedZh
  const root = typeof document === 'undefined' ? undefined : document.documentElement
  cachedZh = root === undefined
    ? false
    : (root.lang || navigator.language || 'en').toLowerCase().startsWith('zh')
  return cachedZh
}

/**
 * Fire a native desktop notification through the Electron shell bridge.
 *
 * Notifications are a best-effort enhancement: a missing DOM (tests, SSR),
 * a missing bridge, or a failing IPC must never break the core feature flow.
 *
 * @param category - Notification category (filtered by the General settings).
 * @param titleZh - Chinese notification title.
 * @param bodyZh - Chinese notification body.
 * @param titleEn - English notification title.
 * @param bodyEn - English notification body.
 * @param sessionId - Optional session id the notification belongs to.
 */
export function desktopNotify<C extends string>(
  category: C,
  titleZh: string,
  bodyZh: string,
  titleEn: string,
  bodyEn: string,
  sessionId?: string,
): void {
  try {
    const zh = detectZh()
    void (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; notify?: (input: { category: C; title: string; body: string; sessionId?: string }) => Promise<void> } })
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
