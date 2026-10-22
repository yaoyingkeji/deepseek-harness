// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { syncWindowsAppearance } from '../src/preload-windows.ts'

const send = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { send, on: vi.fn(), invoke: vi.fn(async () => {}) } }))
vi.mock('../src/preload-menu.ts', () => ({ installWindowsMenu: () => ({ update: vi.fn(), dispose: vi.fn() }) }))
// Linux caption window controls are installed by preload-windows for the
// hidden titlebar; the real implementation is covered by its own renderer.
vi.mock('../src/preload-linux-window-controls.ts', () => ({ installLinuxWindowControls: () => ({ update: vi.fn(), dispose: vi.fn() }) }))

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.documentElement.removeAttribute('data-windows-titlebar')
  document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
  document.documentElement.lang = 'en'
  document.body.removeAttribute('data-ds-dark-theme')
  vi.restoreAllMocks()
  send.mockClear()
})

it('does not install Windows controls on darwin', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  syncWindowsAppearance()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(false)
  expect(send).not.toHaveBeenCalled()
})

it('marks the caption and installs the Linux window controls on linux', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  syncWindowsAppearance()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(true)
  expect(document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')).toBe('40px')
  // Linux caption chrome must not send the Windows overlay palette relay.
  expect(send).not.toHaveBeenCalled()
})

it('synchronizes live language and palette changes and stops observing a closed document', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() => ({
    backgroundColor: document.body.hasAttribute('data-ds-dark-theme') ? 'oklch(0.2 0 0)' : 'hsl(0 0% 100%)',
    color: 'black',
  }) as CSSStyleDeclaration)
  const context = {
    fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(context.fillStyle === 'black'
      ? [0, 0, 0, 255] : context.fillStyle.startsWith('oklch') ? [27, 27, 28, 255] : [255, 255, 255, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  document.documentElement.lang = 'en'
  syncWindowsAppearance()
  expect(send).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(true)
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')).toBe('40px')
  expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(255, 255, 255, 1)', 'rgba(0, 0, 0, 1)')
  document.documentElement.lang = 'zh-CN'
  document.body.setAttribute('data-ds-dark-theme', '')
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'zh-CN', 'rgba(27, 27, 28, 1)', 'rgba(0, 0, 0, 1)') })
  window.dispatchEvent(new Event('pagehide'))
  send.mockClear()
  document.documentElement.lang = 'en'
  await new Promise<void>((resolve) => { queueMicrotask(resolve) })
  expect(send).not.toHaveBeenCalled()
})
