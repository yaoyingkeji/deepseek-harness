/** System tray: the always-present way back to a hidden window and the explicit quit entry (Windows and Linux). */

import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { DesktopLocale } from './locale.ts'

/**
 * Build a near-transparent copy of an icon so a blink alternates between two
 * real bitmaps instead of an empty one: some tray implementations (DDE /
 * Ayatana) render an empty image as a placeholder glyph rather than nothing.
 * The dimmed frame keeps a faint outline (alpha ≈ 0.08) so the icon visibly
 * pulses between full and near-empty, mimicking QQ / WeChat.
 * @param icon - Source icon.
 * @returns a same-size icon with reduced opacity, or the source icon when the
 * bitmap cannot be read.
 */
function dimmed(icon: NativeImage): NativeImage {
  const { width, height } = icon.getSize()
  if (width < 1 || height < 1) return icon
  const bitmap = Buffer.from(icon.toBitmap())
  // toBitmap() yields platform-dependent 32-bit BGRA; the fourth byte is alpha.
  for (let i = 3; i < bitmap.length; i += 4) {
    bitmap[i] = Math.round((bitmap[i] ?? 0) * 0.08)
  }
  const faded = nativeImage.createFromBitmap(bitmap, { width, height })
  return faded.isEmpty() ? icon : faded
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
  private readonly normalIcon: NativeImage
  private readonly dimIcon: NativeImage
  private flashTimer: ReturnType<typeof setInterval> | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const normalIcon = nativeImage.createFromPath(options.iconPath)
    this.normalIcon = normalIcon
    this.dimIcon = dimmed(normalIcon)
    const tray = new Tray(normalIcon)
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
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
   * copy every 500 ms, analogous to QQ / WeChat on Linux. Both frames are real
   * bitmaps so the icon never disappears or falls back to a placeholder.
   * A second call while already flashing is a no-op; only the user opening the
   * window (or the menu) stops it.
   */
  flash(): void {
    if (this.flashTimer !== undefined || this.tray === undefined) return
    const { tray, normalIcon, dimIcon } = this
    let showNormal = true
    this.flashTimer = setInterval(() => {
      tray.setImage(showNormal ? normalIcon : dimIcon)
      showNormal = !showNormal
    }, 500)
  }

  /** Stop flashing immediately and restore the normal tray icon. */
  stopFlash(): void {
    if (this.flashTimer !== undefined) {
      clearInterval(this.flashTimer)
      this.flashTimer = undefined
    }
    if (this.tray !== undefined) {
      this.tray.setImage(this.normalIcon)
    }
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    this.stopFlash()
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}