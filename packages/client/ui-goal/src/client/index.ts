/**
 * Goal surface plugin, browser half: the GoalBar entry in the
 * conversation.input.dock strip. The durable goal arrives through
 * `useProjection('goal')`. A registrant-private activation hook source owns
 * the live Remote read and event subscription; the inject face carries that
 * hook plus the four mutation verbs through the generated Goal Remote API.
 * Activation reads retain the Client Session through completion and wait
 * for its initial history open to succeed before contacting the Host.
 * This plugin does not create goals; deployments may expose /goal separately.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the Session Controller service used for projected goal state.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the Chat node slot and its keyed data map.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: pulls the Conversation service and input-dock slot.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session standard useProjection seat.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the `goal` SessionProjectionMap key merge (single source, the domain's pure outlet).
import type { GoalProjection, GoalRef } from '@deepseek-ai/dsh-goal/client'
import type { GoalActionResult, GoalBarInjected } from './slots.ts'
import { createGoalActivationSource } from './activation-source.ts'
import { GoalDock } from './GoalBar.tsx'
import { GoalCommandInputView } from './GoalCommandInputView.tsx'
import { GoalCommandReference } from './GoalCommandReference.tsx'
import { goalCommandInputDefinition } from './goal-command-input.ts'
import { goalCommandReferenceRule } from './user-text-rules.ts'
export type {} from './user-text-rules.ts'
import { en, ja, es, fr, de, ru, pt, zh, type GoalKey } from './locales.ts'

export { GoalBar, GoalDock } from './GoalBar.tsx'
export type {
  GoalActionResult, GoalBarActions,
} from './slots.ts'
export type { GoalKey } from './locales.ts'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** A live goal read waiting for initial history and its RPC result. */
    goalActivation: unknown
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The goal strip's copy. */
    goal: GoalKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'goal'

/** Required services for the Goal dock, command-input projection, Remote mutations, and copy. */
export const inject = ['slots', 'sessions', 'remote', 'remote.goals', 'locale', 'uiConversation']


/**
 * Fire a native desktop notification through the Electron shell bridge when
 * present; ordinary browsers and focused windows are handled by the shell.
 * @param category - Notification category (filtered by the General settings).
 * @param titleZh - Chinese notification title.
 * @param bodyZh - Chinese notification body.
 * @param titleEn - English notification title.
 * @param bodyEn - English notification body.
 * @param sessionId - Session the notification belongs to.
 */
function desktopNotify(category: 'goal', titleZh: string, bodyZh: string, titleEn: string, bodyEn: string, sessionId?: string): void {
  // Notifications are a best-effort enhancement: a missing DOM (tests, SSR),
  // a missing bridge, or a failing IPC must never break the core feature flow.
  try {
    const root = typeof document === 'undefined' ? undefined : document.documentElement
    const zh = root === undefined
      ? false
      : (root.lang || navigator.language || 'en').toLowerCase().startsWith('zh')
    void (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; notify?: (input: { category: 'goal'; title: string; body: string; sessionId?: string }) => Promise<void> } })
      .dshDesktop?.notify?.({
        category,
        title: zh ? titleZh : titleEn,
        body: zh ? bodyZh : bodyEn,
        ...(sessionId === undefined ? {} : { sessionId }),
      })
  } catch {
    // ignore: notification delivery must never throw into the caller path
  }
}

/**
 * Client plugin body: the GoalBar dock entry with its mutation verbs.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(goalCommandInputDefinition)
  ctx.uiConversation.userText.register(goalCommandReferenceRule)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-goal: dictionaries')

  ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
    name: 'conversation.user.text.node',
    key: 'command',
    priority: 100,
  }, GoalCommandReference))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'command-input',
    locale: NS,
  }, GoalCommandInputView))

  const sessions = ctx.sessions

  /** The session's current projected CAS ref, read at verb call time (no staleness fence: the RPC's CAS is the guard). */
  const refOf = (sessionId: SessionId): GoalRef | undefined => {
    const face = sessions.binding(sessionId)?.session.projections.faceOf('goal')
    const projection = face?.getSnapshot() as GoalProjection | null | undefined
    if (projection == null) return undefined
    return { id: projection.goal.id, revision: projection.goal.revision }
  }

  const noCurrentGoal: GoalActionResult = {
    ok: false,
    error: { code: 'no-current-goal', message: 'no current goal to mutate' },
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'goal',
    order: 10,
    locale: NS,
    inject: (sessionId): GoalBarInjected => {
      const binding = sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`ui-goal: session "${sessionId}" is unavailable`)
      const goalActivation = createGoalActivationSource({
        projection: binding.session.projections.faceOf('goal') as HostObservable<GoalProjection | null | undefined>,
        session: binding.session,
        getGoal: async () => {
          if (sessions.binding(sessionId) !== binding) {
            throw new Error(`ui-goal: session "${sessionId}" is unavailable`)
          }
          return sessions.using(sessionId, { source: 'goalActivation' }, async (reference) => {
            const state = reference.binding.session.getSnapshot()
            if (state.openState !== 'open') {
              throw state.openError ?? new Error(`session "${sessionId}" is not open`)
            }
            return ctx.remote.goals.get(sessionId)
          })
        },
        subscribeActivation: listener => ctx.remote.$on('goal/activation-changed', (event) => {
          if (event.sessionId === sessionId) listener(event.goal)
        }),
        subscribeReset: listener => ctx.on('connection/reset', listener),
      })
      return {
        hooks: { goalActivation },
        onEdit: async (objective) => {
          const ref = refOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.edit(sessionId, ref, { objective })
        },
        onPause: async () => {
          const ref = refOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.pause(sessionId, ref)
        },
        onResume: async () => {
          const ref = refOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.resume(sessionId, ref)
        },
        onClear: async () => {
          const ref = refOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.clear(sessionId, ref)
        },
      }
    },
  }, GoalDock))

  // Desktop notification when a goal completes or is blocked while the window
  // is not focused; the GoalBar already covers focused use.
  ctx.effect(() => ctx.remote.$on('goal/completed-or-blocked', (payload) => {
    if (payload.operation === 'complete') {
      desktopNotify(
        'goal',
        '目标已完成',
        '一个目标已完成',
        'Goal completed',
        'A goal has been completed',
        payload.sessionId,
      )
    } else {
      desktopNotify(
        'goal',
        '目标已阻塞',
        payload.objective ?? '一个目标被阻塞，需要关注',
        'Goal blocked',
        payload.objective ?? 'A goal is blocked and needs attention',
        payload.sessionId,
      )
    }
  }), 'ui-goal: desktop notification subscription')
}
