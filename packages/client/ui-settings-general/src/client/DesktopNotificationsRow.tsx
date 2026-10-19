/** General Settings control for the desktop notification category switches. */
import { useEffect, useRef, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DESKTOP_NOTIFICATION_RECOMMENDED_DISABLED,
  type DesktopNotificationCategory,
  type DesktopNotificationSettings,
  type DesktopNotificationsBridge,
} from '../types.ts'
import css from './DesktopNotificationsRow.module.css'

/** Optional carrier API supplied by the settings owner; absent on Web builds. */
export interface DesktopNotificationsRowInjected {
  bridge?: DesktopNotificationsBridge
}

/** Notification categories rendered as individual switches. */
const CATEGORIES: readonly DesktopNotificationCategory[] = [
  'approval', 'question', 'job', 'subagent', 'credential', 'remote',
]

/**
 * Render the desktop notification category switches with a quick all-on/all-off
 * control; categories that are off by default carry a flood warning.
 * @param props - accepted preferences, writer and localized copy.
 * @returns the General Settings row, or nothing when the Desktop carrier is absent.
 */
export function DesktopNotificationsRow({ bridge, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DesktopNotificationsRowInjected>) {
  const [settings, setSettings] = useState<DesktopNotificationSettings>({
    approval: true, question: true, job: true, subagent: false, credential: false, remote: false,
  })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const touched = useRef(false)
  // The persisted switches load asynchronously; once the user toggles one it
  // must not be clobbered by the slower read that raced the write.
  useEffect(() => {
    let live = true
    void bridge?.get().then((value) => {
      if (live && !touched.current) setSettings(value)
    }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [bridge])
  if (bridge === undefined) return null
  const setEnabled = (category: DesktopNotificationCategory, enabled: boolean): void => {
    touched.current = true
    setFailed(false)
    setBusy(true)
    const previous = settings
    setSettings({ ...settings, [category]: enabled })
    void bridge.set(category, enabled).catch(() => {
      setFailed(true)
      setSettings(previous)
    }).finally(() => { setBusy(false) })
  }
  const allOn = CATEGORIES.every(category => settings[category])
  const applyAll = (enabled: boolean): void => {
    touched.current = true
    setFailed(false)
    setBusy(true)
    const previous = settings
    const next = Object.fromEntries(CATEGORIES.map(category => [category, enabled])) as DesktopNotificationSettings
    setSettings(next)
    Promise.all(CATEGORIES.map(category => bridge.set(category, enabled))).catch(() => {
      setFailed(true)
      setSettings(previous)
    }).finally(() => { setBusy(false) })
  }
  return <div className={css.section}>
    <div className={css.heading}>
      <div className={css.titleRow}>
        <div>
          <div className={css.title}>{t('notifications.title')}</div>
          <div className={css.description}>{t('notifications.description')}</div>
        </div>
        <button type="button" className={css.allToggle} disabled={busy}
          onClick={() => { void applyAll(!allOn) }}>
          {allOn ? t('notifications.allOff') : t('notifications.allOn')}
        </button>
      </div>
      {failed && <div role="alert">{t('notifications.error')}</div>}
    </div>
    {CATEGORIES.map((category) => (
      <div className={css.row} key={category}>
        <div className={css.labels}>
          <div className={css.label}>{t(`notifications.${category}`)}</div>
          {DESKTOP_NOTIFICATION_RECOMMENDED_DISABLED.includes(category) && (
            <div className={css.warning}>{t('notifications.floodWarning')}</div>
          )}
        </div>
        <Switch checked={settings[category]} disabled={busy} label={t(`notifications.${category}`)}
          onChange={(next) => { setEnabled(category, next) }} />
      </div>
    ))}
  </div>
}
