/**
 * Background-job plugin, browser half: contributes one session-header action
 * that renders this session's jobs. Job rows, per-row observation streams,
 * and the human kill all go through the `jobs` client service; this plugin
 * holds no transport state of its own.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { JobStatus } from '@deepseek-ai/dsh-jobs/view'
import { JobListAction } from './JobListAction.tsx'
import type { JobListInjected } from './JobListAction.tsx'
import type {} from '@deepseek-ai/dsh-api-job-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { en, NS, zh, type JobKey } from './locales.ts'

/**
 * Fire a native desktop notification through the Electron shell bridge when
 * present; ordinary browsers and focused windows are handled by the shell.
 * @param category - Notification category (filtered by the General settings).
 * @param titleZh - Chinese notification title.
 * @param bodyZh - Chinese notification body.
 * @param titleEn - English notification title.
 * @param bodyEn - English notification body.
 */
function desktopNotify(category: 'approval' | 'question' | 'job', titleZh: string, bodyZh: string, titleEn: string, bodyEn: string): void {
  const zh = (document.documentElement.lang || navigator.language || 'en').toLowerCase().startsWith('zh')
  void (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; notify?: (input: { category: 'approval' | 'question' | 'job'; title: string; body: string }) => Promise<void> } })
    .dshDesktop?.notify?.({ category, title: zh ? titleZh : titleEn, body: zh ? bodyZh : bodyEn })
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Background-job list copy. */
    'job': JobKey
  }
}

export type { JobListActionProps, JobListInjected } from './JobListAction.tsx'

/** Required services: the jobs rosters, observations, and kill, the slot registry, and dictionaries. */
export const inject = ['jobs', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-jobs: dictionaries')
  // Desktop notifications when background jobs settle while the window is
  // not focused; the job list already covers focused use.
  const settled: Record<string, JobStatus> = {}
  const notifyOnSettle = (): void => {
    const snapshot = ctx.jobs.state.getSnapshot()
    const current = new Set<string>()
    for (const jobs of Object.values(snapshot.rows)) {
      for (const job of jobs) {
        current.add(job.id)
        const previous = settled[job.id]
        if ((previous === 'running' || previous === 'stopping')
          && (job.status === 'completed' || job.status === 'failed')) {
          const finished = job.status === 'completed'
          desktopNotify(
            'job',
            finished ? '任务完成' : '任务失败',
            `${job.label} ${finished ? '已完成' : '已失败'}`,
            finished ? 'Task finished' : 'Task failed',
            `${job.label} ${finished ? 'finished' : 'failed'}`,
          )
        }
        settled[job.id] = job.status
      }
    }
    for (const id of Object.keys(settled)) {
      if (!current.has(id)) delete settled[id]
    }
  }
  ctx.effect(() => ctx.jobs.state.subscribe(notifyOnSettle), 'ui-jobs: desktop notification subscription')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'job-list',
      // Background work follows the preset label in the header actions band.
      order: 20,
      locale: NS,
      inject: (): JobListInjected => ({
        hooks: { jobs: ctx.jobs.state },
        watchRows: sessionId => ctx.jobs.watchRows(sessionId),
        observe: (sessionId, id) => ctx.jobs.observe(sessionId, id),
        // The brand is nominal typing only; the row key is the registry id the
        // roster stream delivered, so the wire boundary stamps it back here.
        killJob: async (sessionId, jobId) => (await ctx.jobs.kill(sessionId, jobId as JobId)).ok,
      }),
    }, JobListAction),
  )
}
