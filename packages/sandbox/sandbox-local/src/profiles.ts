/**
 * Internal platform-profile builders for the local sandbox provider.
 *
 * @module @deepseek-ai/dsh-sandbox-local/profiles
 */

import { dirname } from 'node:path'
import { grantArgs as landlockGrantArgs } from '@deepseek-ai/node-addon-system/landlock-run'
import { workspaceWritableRoots, writableRoots } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox'

/**
 * Build the bwrap profile arguments for one file-effect policy.
 * @param policy - file-effect policy to express as bwrap mounts.
 * @returns profile arguments before the trailing separator and command argv.
 */
export function bwrapProfileArgs(policy: SandboxPolicy): string[] {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent']
  // AppImage 把可执行文件放在 FUSE 挂载点上（/tmp/.mount_*）。该挂载点
  // 不会随根绑定可靠地传播进 bwrap 的新 mount namespace，而 workspace-write
  // 模式还会用 --tmpfs /tmp 把它从沙箱里整个抹掉，导致沙箱内 exec 宿主
  // 可执行文件失败（sandbox-unavailable: bwrap: execvp ...: No such file
  // or directory）。因此显式只读绑定可执行文件所在的挂载点：
  // - read-only 模式：在根绑定之后补挂，确保沙箱内可访问宿主可执行文件；
  // - workspace-write 模式：必须在 --tmpfs /tmp 之后重新挂载（tmpfs 会先
  //   卸载其下的子挂载）。
  const execDir = dirname(process.execPath)
  const appImageMount = execDir !== '/' && /(^|[\\/])\.mount_[^\\/]+$/u.test(execDir) ? execDir : undefined
  if (appImageMount !== undefined && policy.mode !== 'workspace-write') {
    args.push('--ro-bind', appImageMount, appImageMount)
  }
  if (policy.mode === 'workspace-write') {
    args.push('--tmpfs', '/tmp')
    for (const root of workspaceWritableRoots(policy)) args.push('--bind', root, root)
    // Re-mount after --tmpfs /tmp: the tmpfs tears down submounts beneath it,
    // so an AppImage mount under /tmp must be restored afterwards.
    if (appImageMount !== undefined) {
      args.push('--ro-bind', appImageMount, appImageMount)
    }
  }
  return args
}

/**
 * Build the Landlock launcher grants for one file-effect policy.
 * @param policy - file-effect policy to express as Landlock allow-list grants.
 * @returns launcher grant arguments before the trailing separator and command argv.
 */
export function landlockProfileArgs(policy: SandboxPolicy): string[] {
  const readWrite = ['/dev/null']
  if (policy.mode === 'workspace-write') {
    readWrite.push('/tmp', ...workspaceWritableRoots(policy))
  }
  return landlockGrantArgs({ readOnly: ['/'], readWrite })
}

/** Quote one path as an SBPL string literal. */
function sbplString(path: string): string {
  return `"${path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`
}

/**
 * Build the sandbox-exec arguments and SBPL profile for one policy. The
 * workspace-owned writable roots (workspace plus explicit extra directories)
 * come from the shared {@link writableRoots} helper (canonical, deduplicated)
 * so the Seatbelt grant and the in-process fs fence
 * (`@deepseek-ai/dsh-fs-sandbox`) can never drift apart; the helper adds the
 * documented Seatbelt temp areas.
 * @param policy - file-effect policy to express as an SBPL profile.
 * @returns sandbox-exec arguments before the trailing separator and command argv.
 */
export function seatbeltProfileArgs(policy: SandboxPolicy): string[] {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`]
  const roots = writableRoots(policy)
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
  return ['-p', forms.join(' ')]
}
