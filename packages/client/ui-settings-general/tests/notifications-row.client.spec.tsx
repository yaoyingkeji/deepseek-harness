// @vitest-environment jsdom
/**
 * Desktop notification category switches: per-category toggles, the all-on /
 * all-off quick control, and best-effort persistence without clobbering.
 */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { TriggerContentProps } from '../src/client/chrome.tsx'
import { en } from '../src/client/locales.ts'
import { DesktopNotificationsRow, type DesktopNotificationsRowInjected } from '../src/client/DesktopNotificationsRow.tsx'
import type { DesktopNotificationSettings, DesktopNotificationsBridge } from '../src/types.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

const t: TriggerContentProps['t'] = key => (en as Record<string, string>)[key] ?? key

const unusedHook = (() => { throw new Error('unused by notifications row') }) as never
type AttentionSnapshot = Parameters<Parameters<TriggerContentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: TriggerContentProps['useSessionStatus'] = selector => selector(noAttention)
const kit = {
  useSessions: unusedHook, useSessionStatus,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource, useWorkspaces: unusedHook,
  ...allowAllAccess,
}

/** Bridge over an in-memory settings snapshot with call spies. */
function notificationsBridge(initial: DesktopNotificationSettings) {
  let current = { ...initial }
  const set = vi.fn(async (category: keyof DesktopNotificationSettings, enabled: boolean) => {
    current = { ...current, [category]: enabled }
  })
  const get = vi.fn(async (): Promise<DesktopNotificationSettings> => ({ ...current }))
  const bridge: DesktopNotificationsBridge = { get, set }
  return { bridge, read: () => current }
}

const DEFAULTS: DesktopNotificationSettings = {
  approval: true, question: true, job: true, subagent: false, credential: false, remote: false, session: false,
  plugin: false, schedule: false, goal: false, nonCurrentSession: false, trayFlash: false,
  focused: false,
}

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('DesktopNotificationsRow', () => {
  it('renders one switch per category plus the focus-mode switch, with the flood warning on recommended-off rows', async () => {
    const { bridge } = notificationsBridge(DEFAULTS)
    const injected: DesktopNotificationsRowInjected = { bridge }
    const view = render(<DesktopNotificationsRow {...kit} t={t} {...injected} />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(13)
    // Approval/question/job default on; subagent/credential/remote/session default off.
    expect(screen.getByRole('switch', { name: 'Approval requests' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Subagent finished' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Credentials needed' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Remote access request' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'New session' }).getAttribute('aria-checked')).toBe('false')
    // The focus-mode switch defaults to off (notifications only while unfocused).
    expect(screen.getByRole('switch', { name: 'Show notifications while focused' }).getAttribute('aria-checked')).toBe('false')
    // Recommended-off rows carry the flood warning.
    expect(screen.getAllByText('Not recommended — may cause notification flooding')).toHaveLength(4)
    // The quick control starts as all-on (mixed state).
    expect(screen.getByRole('button', { name: 'Enable all' })).toBeTruthy()
    await waitFor(() => { expect(bridge.get).toHaveBeenCalled() })
    view.unmount()
  })

  it('turns every category on with one click and off again with a second click, leaving the focus switch independent', async () => {
    const { bridge, read } = notificationsBridge(DEFAULTS)
    const injected: DesktopNotificationsRowInjected = { bridge }
    render(<DesktopNotificationsRow {...kit} t={t} {...injected} />)
    // First click: enable all (category switches only; the focus switch is a mode, not a category).
    fireEvent.click(screen.getByRole('button', { name: 'Enable all' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Disable all' })).toBeTruthy() })
    const categorySwitches = screen.getAllByRole('switch').filter(sw => sw.getAttribute('aria-label') !== 'Show notifications while focused')
    expect(categorySwitches.every(sw => sw.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(bridge.set).toHaveBeenCalledTimes(7)
    expect(read().focused).toBe(false)
    // Second click: disable all.
    fireEvent.click(screen.getByRole('button', { name: 'Disable all' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Enable all' })).toBeTruthy() })
    expect(categorySwitches.every(sw => sw.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(bridge.set).toHaveBeenCalledTimes(14)
    expect(read().focused).toBe(false)
  })

  it('toggles the focus-mode switch independently of the category switches', async () => {
    const { bridge, read } = notificationsBridge(DEFAULTS)
    const injected: DesktopNotificationsRowInjected = { bridge }
    render(<DesktopNotificationsRow {...kit} t={t} {...injected} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show notifications while focused' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Show notifications while focused' }).getAttribute('aria-checked')).toBe('true')
    })
    expect(bridge.set).toHaveBeenLastCalledWith('focused', true)
    expect(read().focused).toBe(true)
    // Categories stay untouched.
    expect(read().approval).toBe(true)
    expect(read().subagent).toBe(false)
  })

  it('persists an individual switch and keeps later toggles independent', async () => {
    const { bridge, read } = notificationsBridge(DEFAULTS)
    const injected: DesktopNotificationsRowInjected = { bridge }
    render(<DesktopNotificationsRow {...kit} t={t} {...injected} />)
    // Toggle the credential switch on.
    fireEvent.click(screen.getByRole('switch', { name: 'Credentials needed' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Credentials needed' }).getAttribute('aria-checked')).toBe('true')
    })
    expect(bridge.set).toHaveBeenLastCalledWith('credential', true)
    // Toggle the subagent switch on: the previous toggle must survive.
    fireEvent.click(screen.getByRole('switch', { name: 'Subagent finished' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Subagent finished' }).getAttribute('aria-checked')).toBe('true')
    })
    expect(read().credential).toBe(true)
    expect(read().subagent).toBe(true)
    // Two recommended-off rows remain on while the rest stay default: the
    // quick control reports the mixed state as "enable all", not "disable all".
    expect(screen.getByRole('button', { name: 'Enable all' })).toBeTruthy()
  })
})
