/** Custom Linux caption window controls: hidden native chrome has no overlay. */
import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { resolveDesktopLocale } from './locale.ts'

/** Caption glyphs drawn with the current stroke color. */
const glyphs = {
  minimize: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6h9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  maximize: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  restore: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 4.5V2.5h6v6h-2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="1.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  close: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
} as const

/**
 * Mount minimize/maximize/close buttons into the caption's right side so a
 * hidden Linux titlebar keeps native window management. The maximize button
 * mirrors the window state relayed by the main process.
 * @returns Label refresh and document teardown operations.
 */
export function installLinuxWindowControls(): { update(): void; dispose(): void } {
  const host = document.createElement('div')
  host.dataset.linuxWindowControls = ''
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { position: fixed; top: 0; right: 0; height: var(--dsh-windows-titlebar-height);
      display: flex; align-items: stretch; padding-right: 6px; z-index: 1100;
      -webkit-app-region: no-drag; }
    button { width: 42px; border: 0; background: transparent; cursor: default;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--dsw-alias-label-secondary); }
    button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
    button[data-close]:hover { background: #c42b1c; color: #ffffff; }
    button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
    svg { width: 12px; height: 12px; display: block; pointer-events: none; }
  `
  const createButton = (action: 'minimize' | 'maximize' | 'close', index: number): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.tabIndex = index === 0 ? 0 : -1
    if (action === 'close') button.dataset.close = ''
    button.innerHTML = glyphs[action]
    button.addEventListener('click', () => {
      if (action === 'minimize') void ipcRenderer.invoke(DESKTOP_IPC.windowMinimize)
      else if (action === 'maximize') void ipcRenderer.invoke(DESKTOP_IPC.windowToggleMaximize)
      else void ipcRenderer.invoke(DESKTOP_IPC.windowClose)
    })
    return button
  }
  const minimize = createButton('minimize', 0)
  const maximize = createButton('maximize', 1)
  const close = createButton('close', 2)
  shadow.append(style, minimize, maximize, close)
  let minimizeLabel = ''
  let maximizeLabel = ''
  let restoreLabel = ''
  let closeLabel = ''
  const update = (): void => {
    const { messages } = resolveDesktopLocale(document.documentElement.lang)
    minimizeLabel = messages.minimizeWindow
    maximizeLabel = messages.maximizeWindow
    restoreLabel = messages.restoreWindow
    closeLabel = messages.closeWindow
    minimize.setAttribute('aria-label', minimizeLabel)
    maximize.setAttribute('aria-label', maximizeLabel)
    close.setAttribute('aria-label', closeLabel)
  }
  const onMaximized = (_event: unknown, maximized: unknown): void => {
    if (typeof maximized !== 'boolean') return
    maximize.innerHTML = maximized ? glyphs.restore : glyphs.maximize
    maximize.setAttribute('aria-label', maximized ? restoreLabel : maximizeLabel)
  }
  ipcRenderer.on(DESKTOP_IPC.windowMaximized, onMaximized)
  const mount = (): void => {
    // AppFrame owns this seat; boot readiness alone precedes the rendered application.
    if (document.querySelector('[data-shell-overlay]') === null) return
    document.body.append(host)
    observer.disconnect()
  }
  const observer = new MutationObserver(mount)
  observer.observe(document.body, { childList: true, subtree: true })
  mount()
  update()
  return {
    update,
    dispose: () => {
      observer.disconnect()
      ipcRenderer.off(DESKTOP_IPC.windowMaximized, onMaximized)
      host.remove()
    },
  }
}
