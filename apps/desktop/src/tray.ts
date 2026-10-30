/** System tray: the always-present way back to a hidden window and the explicit quit entry (Windows and Linux). */

import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { DesktopLocale } from './locale.ts'

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
  private flashTimer: ReturnType<typeof setInterval> | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const normalIcon = nativeImage.createFromPath(options.iconPath)
    this.normalIcon = normalIcon
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
   * Flash the tray icon by toggling between visible and hidden every 500 ms,
   * analogous to QQ / WeChat on Linux. A second call while already flashing
   * is a no-op; the effect stops automatically when the window is opened.
   */
  flash(): void {
    if (this.flashTimer !== undefined || this.tray === undefined) return
    const { tray, normalIcon } = this
    let showNormal = true
    this.flashTimer = setInterval(() => {
      tray.setImage(showNormal ? normalIcon : nativeImage.createEmpty())
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