import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { readDesktopSettings, writeDesktopSettings } from '../src/settings.ts'

vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

function fixture() {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-desktop-settings-'))
  onTestFinished(() => { rmSync(userData, { recursive: true, force: true }) })
  const directory = join(userData, 'desktop')
  mkdirSync(directory)
  return { userData, path: join(directory, 'settings.json') }
}

it('creates a discoverable default file on first launch without touching other preferences', () => {
  const { userData, path } = fixture()
  rmSync(join(userData, 'desktop'), { recursive: true })
  writeFileSync(join(userData, 'keybindings.json'), 'existing shortcuts\n')
  expect(readDesktopSettings(userData)).toEqual({
    updates: { allowTestAuthPopupWindow: false }, window: { closeBehavior: 'hide' },
    notifications: {
      approval: true, question: true, job: true, subagent: false, credential: false, remote: false, session: false,
      plugin: true, schedule: true, goal: true, focused: false, nonCurrentSession: true, trayFlash: true,
      sticky: { approval: false, question: false, job: false, subagent: false, credential: true, remote: true, session: false, plugin: false, schedule: false, goal: false },
    },
  })
  expect(readFileSync(path, 'utf8')).toBe('{\n  "updates": {\n    "allowTestAuthPopupWindow": false\n  },\n  "window": {\n    "closeBehavior": "hide"\n  },\n  "notifications": {\n    "approval": true,\n    "question": true,\n    "job": true,\n    "subagent": false,\n    "credential": false,\n    "remote": false,\n    "session": false,\n    "plugin": true,\n    "schedule": true,\n    "goal": true,\n    "focused": false,\n    "nonCurrentSession": true,\n    "trayFlash": true,\n    "sticky": {\n      "approval": false,\n      "question": false,\n      "job": false,\n      "subagent": false,\n      "credential": true,\n      "remote": true,\n      "session": false,\n      "plugin": false,\n      "schedule": false,\n      "goal": false\n    }\n  }\n}\n')
  expect(readFileSync(join(userData, 'keybindings.json'), 'utf8')).toBe('existing shortcuts\n')
})

it.each(['{}', '{"updates": {}}', '{"other": 1, "updates": {"other": true}}'])('defaults an older document without rewriting it: %s', (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readDesktopSettings(userData).window.closeBehavior).toBe('hide')
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('loads an explicit close-button behavior on the next read', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"window":{"closeBehavior":"quit"}}')
  expect(readDesktopSettings(userData).window.closeBehavior).toBe('quit')
  expect(readFileSync(path, 'utf8')).toBe('{"window":{"closeBehavior":"quit"}}')
})

it('loads notification category switches with defaults for absent categories', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"notifications":{"job":false}}')
  const settings = readDesktopSettings(userData)
  expect(settings.notifications).toEqual({
    approval: true, question: true, job: false, subagent: false, credential: false, remote: false, session: false,
    plugin: true, schedule: true, goal: true, focused: false, nonCurrentSession: true, trayFlash: true,
    sticky: { approval: false, question: false, job: false, subagent: false, credential: true, remote: true, session: false, plugin: false, schedule: false, goal: false },
  })
  expect(readFileSync(path, 'utf8')).toBe('{"notifications":{"job":false}}')
})

it('loads the focus-mode switch with false as its default and accepts an explicit true', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"notifications":{}}')
  expect(readDesktopSettings(userData).notifications.focused).toBe(false)
  writeFileSync(path, '{"notifications":{"focused":true}}')
  expect(readDesktopSettings(userData).notifications.focused).toBe(true)
  expect(readFileSync(path, 'utf8')).toBe('{"notifications":{"focused":true}}')
})

it('persists settings with writeDesktopSettings', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{"window":{"closeBehavior":"quit"}}')
  const settings = readDesktopSettings(userData)
  writeDesktopSettings(userData, { ...settings, window: { closeBehavior: 'hide' } })
  expect(readDesktopSettings(userData).window.closeBehavior).toBe('hide')
})

it('loads explicit opt-in and opt-out on the next read without changing an earlier process snapshot', () => {
  const { userData, path } = fixture()
  for (const allow of [true, false]) {
    const raw = JSON.stringify({ updates: { allowTestAuthPopupWindow: allow }, custom: 'preserve' })
    writeFileSync(path, raw)
    expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(allow)
    expect(readFileSync(path, 'utf8')).toBe(raw)
  }
  const previous = readDesktopSettings(userData)
  writeFileSync(path, '{"updates":{"allowTestAuthPopupWindow":true}}')
  expect(previous.updates.allowTestAuthPopupWindow).toBe(false)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(true)
})

it.each(['', '{', 'null', '[]', '{"updates":null}', '{"updates":[]}',
  '{"updates":{"allowTestAuthPopupWindow":"false"}}', '{"updates":{"allowTestAuthPopupWindow":1}}',
  '{"updates":{"allowTestAuthPopupWindow":null}}', '{"window":[]}', '{"window":{"closeBehavior":"maximize"}}',
  '{"notifications":[]}', '{"notifications":{"approval":"true"}}', '{"notifications":{"subagent":"false"}}'])('reports invalid settings with their path and preserves the original: %s', (raw) => {
  const { userData, path } = fixture()
  writeFileSync(path, raw)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(readFileSync(path, 'utf8')).toBe(raw)
})

it('reports filesystem errors instead of replacing unreadable settings', () => {
  const { userData, path } = fixture()
  mkdirSync(path)
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Error))
  expect(fs.statSync(path).isDirectory()).toBe(true)
})

it.each(['mkdirSync', 'writeFileSync'] as const)('continues with disabled popups when %s fails', (operation) => {
  const { userData, path } = fixture()
  const failure = Object.assign(new Error('settings creation denied'), { code: 'EACCES' })
  vi.spyOn(fs, operation).mockImplementation(() => { throw failure })
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(path), failure)
})

it('continues with defaults even when warning output fails', () => {
  const { userData, path } = fixture()
  writeFileSync(path, '{')
  vi.mocked(console.warn).mockImplementation(() => { throw new Error('output unavailable') })
  expect(readDesktopSettings(userData).updates.allowTestAuthPopupWindow).toBe(false)
  expect(readFileSync(path, 'utf8')).toBe('{')
})
