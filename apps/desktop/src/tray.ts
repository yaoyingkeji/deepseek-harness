/** System tray: the always-present way back to a hidden window and the explicit quit entry (Windows and Linux). */

import { Menu, nativeImage, nativeTheme, Tray, type NativeImage } from 'electron'
import { join } from 'node:path'
import type { DesktopLocale } from './locale.ts'

/**
 * Build a near-transparent copy of an icon so a blink alternates between two
 * real bitmaps instead of an empty one: some tray implementations (DDE /
 * Ayatana) render an empty image as a placeholder glyph rather than nothing.
 * The dimmed frame keeps a faint outline (alpha ≈ 0.08) so the icon visibly
 * pulses between full and near-empty, mimicking QQ / WeChat.
 *
 * On Linux the icon is also resized to 48×48 before dimming. The SNI D-Bus
 * protocol transmits the full pixmap on every setImage() call, so a 1024×1024
 * source icon means ~4 MB per frame over D-Bus — resizing first keeps each
 * frame under 10 KB and prevents the SNI host (especially DDE shell) from
 * choking on the data volume and dropping the tray registration.
 * @param icon - Source icon.
 * @returns a 48×48 icon with reduced opacity, or the source icon when the
 * bitmap cannot be read.
 */
function dimmed(icon: NativeImage): NativeImage {
  const { width, height } = icon.getSize()
  if (width < 1 || height < 1) return icon
  // Resize to 48×48 on Linux to keep D-Bus pixmap transfers small.
  // Tray icons are rendered at 22-32 px anyway, so 48 is more than enough.
  const targetSize = process.platform === 'linux' ? 48 : width
  const sized = width !== targetSize ? icon.resize({ width: targetSize, height: targetSize }) : icon
  const bitmap = Buffer.from(sized.toBitmap())
  // toBitmap() yields platform-dependent 32-bit BGRA; the fourth byte is alpha.
  for (let i = 3; i < bitmap.length; i += 4) {
    bitmap[i] = Math.round((bitmap[i] ?? 0) * 0.08)
  }
  const { width: sw, height: sh } = sized.getSize()
  const faded = nativeImage.createFromBitmap(bitmap, { width: sw, height: sh })
  return faded.isEmpty() ? sized : faded
}

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Multi-size ICO on Windows (rendered by `scripts/render-tray-icon.ts`) or a PNG on Linux. */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined
  private normalIcon: NativeImage
  private dimIcon: NativeImage
  private flashTimer: ReturnType<typeof setInterval> | undefined
  private flashTimeout: ReturnType<typeof setTimeout> | undefined
  /** Base directory of the icon resources (contains icon-dark.png, icon-light.png). */
  private readonly iconDir: string
  /** Current icon path — updated on theme change so the next switch is detected. */
  private currentIconPath: string
  private themeHandler: (() => void) | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    this.iconDir = options.iconPath.replace(/[^/]+$/, '')
    this.currentIconPath = options.iconPath
    this.normalIcon = this.buildIcon(options.iconPath)
    this.dimIcon = dimmed(this.normalIcon)
    const tray = new Tray(this.normalIcon)
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()

    // Linux: follow system theme to switch between dark/light tray icons.
    // The caller in main.ts picks the right iconPath at startup; this listener
    // keeps the tray icon in sync when the user toggles the theme at runtime.
    if (process.platform === 'linux') {
      this.themeHandler = () => { this.refreshThemeIcon() }
      nativeTheme.on('updated', this.themeHandler)
    }
  }

  /** Load an icon from path, resizing to 48×48 on Linux for small D-Bus transfers. */
  private buildIcon(path: string): NativeImage {
    const sourceIcon = nativeImage.createFromPath(path)
    if (sourceIcon.isEmpty()) return sourceIcon
    return process.platform === 'linux'
      ? (sourceIcon.getSize().width > 48 ? sourceIcon.resize({ width: 48, height: 48 }) : sourceIcon)
      : sourceIcon
  }

  /** Pick the theme-appropriate icon path and swap it into the tray. */
  private refreshThemeIcon(): void {
    const isDark = nativeTheme.shouldUseDarkColors
    // Dark theme → white icon (icon-light.png)
    // Light theme → black icon (icon-dark.png)
    const newPath = join(this.iconDir, isDark ? 'icon-light.png' : 'icon-dark.png')
    if (newPath === this.currentIconPath) return
    const next = this.buildIcon(newPath)
    if (next.isEmpty()) return
    this.currentIconPath = newPath
    this.normalIcon = next
    this.dimIcon = dimmed(next)
    this.tray?.setImage(this.normalIcon)
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /**
   * Flash the tray icon by alternating between the normal icon and a dimmed
   * copy every 600 ms, analogous to QQ / WeChat on Linux.
   *
   * Implementation note: on Linux DDE / Ayatana StatusNotifierItem (SNI)
   * implementations, calling setImage() every 500 ms floods the D-Bus bridge
   * with property updates and can desync the SNI registration — the tray icon
   * then stops responding to clicks and its context menu disappears. We use
   * a slower blink rate (600 ms) and guard setImage with a cheap identity
   * check so redundant updates are skipped.
   *
   * A second call while already flashing is a no-op; only the user opening the
   * window (or the menu) stops it.
   */
  flash(): void {
    if (this.flashTimer !== undefined || this.tray === undefined) return
    // Read this.normalIcon / this.dimIcon inside the interval callback rather
    // than capturing them here, so a theme change during flashing swaps in the
    // new icons immediately instead of fighting the timer with stale references.
    let showNormal = true
    let lastIcon: NativeImage = this.normalIcon
    this.flashTimer = setInterval(() => {
      const next = showNormal ? this.normalIcon : this.dimIcon
      // Skip redundant setImage calls: on some Linux SNI bridges every call
      // triggers a full D-Bus round-trip that can wedge the tray.
      if (next !== lastIcon) {
        this.tray?.setImage(next)
        lastIcon = next
      }
      showNormal = !showNormal
    }, 600)
    this.flashTimeout = setTimeout(() => { this.stopFlash() }, 60_000)
  }

  /** Stop flashing immediately and restore the normal tray icon. */
  stopFlash(): void {
    if (this.flashTimer !== undefined) {
      clearInterval(this.flashTimer)
      this.flashTimer = undefined
    }
    if (this.flashTimeout !== undefined) {
      clearTimeout(this.flashTimeout)
      this.flashTimeout = undefined
    }
    if (this.tray !== undefined) {
      this.tray.setImage(this.normalIcon)
    }
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    this.stopFlash()
    if (this.themeHandler !== undefined) {
      nativeTheme.off('updated', this.themeHandler)
      this.themeHandler = undefined
    }
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
