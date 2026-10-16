/** General Settings control for the window close-button behavior (hide to tray or quit). */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopCloseBehavior, DesktopCloseBehaviorBridge } from '../types.ts'
import css from './CloseWindowBehaviorRow.module.css'

/** Optional carrier API supplied by the settings owner; absent on Web builds. */
export interface CloseWindowBehaviorRowInjected {
  bridge?: DesktopCloseBehaviorBridge
}

/**
 * Render the close-button behavior select.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row, or nothing when the Desktop carrier is absent.
 */
export function CloseWindowBehaviorRow({ bridge, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<CloseWindowBehaviorRowInjected>) {
  const [behavior, setBehavior] = useState<DesktopCloseBehavior>('hide')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void bridge?.get().then(setBehavior).catch(() => { setFailed(true) })
  }, [bridge])
  if (bridge === undefined) return null
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('closeBehavior.title')}</div>
      <div className={css.description}>{t('closeBehavior.description')}</div>
      {failed && <div role="alert">{t('closeBehavior.error')}</div>}
    </div>
    <select className={css.select} value={behavior} disabled={busy}
      onChange={(event) => {
        const next = event.target.value as DesktopCloseBehavior
        setFailed(false)
        setBusy(true)
        void bridge.set(next).catch(() => {
          setFailed(true)
          setBehavior(behavior)
        }).finally(() => { setBusy(false) })
      }}>
      <option value="hide">{t('closeBehavior.hide')}</option>
      <option value="quit">{t('closeBehavior.quit')}</option>
    </select>
  </div>
}
