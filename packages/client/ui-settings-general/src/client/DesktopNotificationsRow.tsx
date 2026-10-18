/** General Settings control for the desktop notification category switches. */
import { useEffect, useRef, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopNotificationCategory, DesktopNotificationSettings, DesktopNotificationsBridge } from '../types.ts'
import css from './DesktopNotificationsRow.module.css'

/** Optional carrier API supplied by the settings owner; absent on Web builds. */
export interface DesktopNotificationsRowInjected {
  bridge?: DesktopNotificationsBridge
}

/** Notification categories rendered as individual switches. */
const CATEGORIES: readonly DesktopNotificationCategory[] = ['approval', 'question', 'job']

/**
 * Render the desktop notification category switches.
 * @param props - accepted preferences, writer and localized copy.
 * @returns the General Settings row, or nothing when the Desktop carrier is absent.
 */
export function DesktopNotificationsRow({ bridge, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DesktopNotificationsRowInjected>) {
  const [settings, setSettings] = useState<DesktopNotificationSettings>({ approval: true, question: true, job: true })
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
  return <div className={css.section}>
    <div className={css.heading}>
      <div className={css.title}>{t('notifications.title')}</div>
      <div className={css.description}>{t('notifications.description')}</div>
      {failed && <div role="alert">{t('notifications.error')}</div>}
    </div>
    {CATEGORIES.map((category) => (
      <div className={css.row} key={category}>
        <div className={css.label}>{t(`notifications.${category}`)}</div>
        <Switch checked={settings[category]} disabled={busy} label={t(`notifications.${category}`)}
          onChange={(next) => { setEnabled(category, next) }} />
      </div>
    ))}
  </div>
}
