/** Web subagent catalog, navigation, and addressed-session composer owner. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
// Type-only: pulls the `subagent/finished` Cordis event declaration so ctx.remote.$on sees it.
import type {} from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SubagentCatalogAction, SubagentHeaderLineage, type SubagentCatalogInjected, type SubagentCatalogActionInjected } from './SubagentHeaderLineage.tsx'
import {
  SubagentReadOnlyComposer, type SubagentReadOnlyMatch,
} from './SubagentReadOnlyComposer.tsx'
import { registerSidebarChat, subagentChatAddress } from './sidebar-chat/index.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { en, ja, es, fr, de, ru, pt, NS, zh, type SubagentKey } from './locales.ts'
import { desktopNotify } from '@deepseek-ai/dsh-client-ui-primitives'
export type * from './slots.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Subagent catalog and read-only composer copy. */
    'subagent': SubagentKey
  }
}

export type {
  SubagentCatalogActionProps, SubagentCatalogInjected, SubagentCatalogActionInjected, SubagentHeaderLineageProps,
} from './SubagentHeaderLineage.tsx'
export type {
  SubagentReadOnlyComposerProps, SubagentReadOnlyMatch,
} from './SubagentReadOnlyComposer.tsx'

/** Required services for subagent presentation and navigation. */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale', 'sidebarRight', 'remote']

/** Claim the composer when the child mode does not allow follow-ups. */
function selectReadOnlySubagent(owner: ComposerChainProps): SubagentReadOnlyMatch | null {
  const subagent = owner.session?.subagent
  if (subagent === undefined || subagent === null) return null
  if (subagent.address.mode === 'unknown') return { reason: 'unknown' }
  if (subagent.address.mode === 'one-shot') return { reason: 'one-shot' }
  return null
}

/**
 * Client plugin body: register the subagent catalog and read-only composer seats.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-subagent: dictionaries')
  // Desktop notification when a subagent run finishes while the window is not
  // focused; the subagent catalog already covers focused use.
  let mergeTimer: ReturnType<typeof setTimeout> | undefined
  let mergeFailed = false
  let mergeCount = 0
  let mergeSessionId: string | undefined
  ctx.effect(() => ctx.remote.$on('subagent/finished', (info) => {
    if (info.stopReason === 'error') mergeFailed = true
    mergeCount += 1
    mergeSessionId = info.parentSessionId
    if (mergeTimer !== undefined) return
    const flush = (): void => {
      mergeTimer = undefined
      const failed = mergeFailed
      const count = mergeCount
      const sessionId = mergeSessionId
      mergeFailed = false
      mergeCount = 0
      mergeSessionId = undefined
      desktopNotify(
        'subagent',
        failed ? '子代理运行失败' : '子代理已完成',
        count > 1
          ? `${count} 个子代理${failed ? '部分运行出错' : '已完成任务'}`
          : `子代理${failed ? '运行出错' : '已完成任务'}`,
        failed ? 'Subagent failed' : 'Subagent finished',
        count > 1
          ? `${count} subagents ${failed ? 'encountered errors' : 'completed their tasks'}`
          : `subagent ${failed ? 'encountered an error' : 'completed its task'}`,
        sessionId,
      )
    }
    mergeTimer = setTimeout(flush, 30_000)
  }), 'ui-subagent: desktop notification subscription')
  ctx.inject(['resources', 'sidebarRightTabs'], (scope) => {
    registerSidebarChat(scope, ctx.locale.bind(NS))
  })
  const catalogActions = (_parentSessionId: SessionId): SubagentCatalogInjected => ({
    openChild(address: SubagentAddress) {
      ctx.uiWorkspace.openSession(address)
    },
    openChildAside(address: SubagentAddress) {
      ctx.sidebarRight.openResource(subagentChatAddress(address), {
        kind: 'subagentchat',
        preferNewPane: true,
      })
    },
    async prepareCatalog(parentSessionId: SessionId) {
      await ctx.sessions.refreshProjections(parentSessionId)
      const parent = ctx.sessions.list.getSnapshot().projectionsBySession[parentSessionId]
      if (parent?.state !== 'ready') return
      for (const entry of parent.values.subagentCatalog ?? []) {
        if (entry.mode === 'external') continue
        const state = ctx.sessions.list.getSnapshot()
        if (state.byId[entry.id]?.formatStatus === 'migration-required'
          || state.projectionsBySession[entry.id]?.state === 'migration-required'
          || state.projectionsBySession[entry.id]?.state === 'error') continue
        await ctx.sessions.refreshProjections(entry.id)
      }
    },
    refreshProjection(parentSessionId: SessionId) {
      void ctx.sessions.refreshProjections(parentSessionId)
    },
  })
  const footerAvailable = {
    getSnapshot: () => ctx.slots.entries('conversation.session.header.actions.subagent.footer').length > 0,
    subscribe: (listener: () => void) => ctx.slots.subscribe('conversation.session.header.actions.subagent.footer', listener),
  }
  ctx.slots.inject(
    'conversation.session.header.lineage',
    () => ctx.slots.register({
      name: 'conversation.session.header.lineage',
      locale: NS,
      inject: catalogActions,
    }, SubagentHeaderLineage),
  )
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'subagent-catalog',
      // Between the preset label (-10) and background tasks (20).
      order: 10,
      locale: NS,
      inject: (sessionId): SubagentCatalogActionInjected => ({
        ...catalogActions(sessionId), hooks: { footerAvailable },
      }),
      children: { 'conversation.session.header.actions.subagent.footer': { kind: 'list', scope: 'session' } },
    }, SubagentCatalogAction),
  )
  ctx.slots.inject(
    'conversation.composer',
    () => ctx.slots.register({
      name: 'conversation.composer',
      priority: -10,
      locale: NS,
      select: selectReadOnlySubagent,
    }, SubagentReadOnlyComposer),
  )
}
