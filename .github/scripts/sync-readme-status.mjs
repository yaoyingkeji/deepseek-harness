#!/usr/bin/env node
/**
 * Refresh the "检查更新 / Status" tables in README.md and README.zh.md after a
 * release is published, so the tables always name the newest built version
 * instead of a hand-maintained snapshot.
 *
 * Usage: node sync-readme-status.mjs <branch> <version> <slug>
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const REPO = 'yaoyingkeji/deepseek-harness'
const [branch, version, slug] = process.argv.slice(2)

if (branch === undefined || version === undefined || slug === undefined) {
  console.error('usage: sync-readme-status.mjs <branch> <version> <slug>')
  process.exit(1)
}

/**
 * Read the newest published tag matching a prefix from GitHub releases.
 * @param {string} prefix Tag prefix such as `v0.2.2-alpha.2-linux-x64-`.
 * @returns {string | undefined} Newest matching tag, or undefined when absent.
 */
function newestTag(prefix) {
  try {
    const raw = execFileSync('gh',
      ['release', 'list', '--repo', REPO, '--limit', '100', '--json', 'tagName'],
      { encoding: 'utf8' })
    const tags = JSON.parse(raw).map(entry => entry.tagName)
      .filter(tag => tag.startsWith(prefix))
    // Tags embed a semantic version; sort by the desktop version segment.
    tags.sort((left, right) => {
      const a = left.slice(prefix.length)
      const b = right.slice(prefix.length)
      return a.localeCompare(b, 'en', { numeric: true })
    })
    return tags.at(-1)
  } catch (error) {
    console.error(`warn: could not list releases: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * Read the newest upstream release tag from the official repository.
 * @returns {string | undefined} Upstream tag such as `dsh-v0.2.2-alpha.2`.
 */
function upstreamTag() {
  try {
    const raw = execFileSync('gh',
      ['release', 'list', '--repo', 'deepseek-ai/deepseek-harness', '--limit', '30', '--json', 'tagName'],
      { encoding: 'utf8' })
    const tags = JSON.parse(raw).map(entry => entry.tagName)
      .filter(tag => tag.startsWith('dsh-v'))
    tags.sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    return tags.at(-1)
  } catch (error) {
    console.error(`warn: could not list upstream releases: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const customTag = newestTag(`v${version}-linux-x64-custom`)
const officialTag = newestTag(`v${version}-linux-x64-official`)
const upstream = upstreamTag()

/** Replace one status row by its leading label. */
function replaceRow(content, label, value) {
  const pattern = new RegExp(`^(\\| \\*\\*${label}\\*\\* \\| ).*?( \\|)$`, 'mu')
  if (!pattern.test(content)) return content
  return content.replace(pattern, `$1${value}$2`)
}

/** Build the two release-package rows from the tags that actually exist. */
function packageRows(language) {
  const custom = customTag === undefined
    ? (language === 'zh' ? `⏳ 未发布（\`v${version}-linux-x64-custom\` 构建中）` : `⏳ Not published (\`v${version}-linux-x64-custom\` building)`)
    : (language === 'zh' ? `✅ \`${customTag}\`` : `✅ \`${customTag}\``)
  const official = officialTag === undefined
    ? (language === 'zh' ? `⏳ 未发布（\`v${version}-linux-x64-official\` 构建中）` : `⏳ Not published (\`v${version}-linux-x64-official\` building)`)
    : (language === 'zh' ? `✅ \`${officialTag}\`` : `✅ \`${officialTag}\``)
  return { custom, official }
}

/** Refresh one README file in place, keeping its own label language. */
function syncReadme(path) {
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    console.error(`skip: ${path} is absent`)
    return
  }
  const { custom, official } = packageRows(path.endsWith('.zh.md') ? 'zh' : 'en')
  content = replaceRow(content, '定制版 Linux 发行包', custom)
  content = replaceRow(content, '官方版 Linux 发行包', official)
  content = replaceRow(content, 'Custom Linux package', custom)
  content = replaceRow(content, 'Official Linux package', official)
  if (upstream !== undefined) {
    content = replaceRow(content, '上游最新版本', `\`${upstream.slice(4)}\`（\`${upstream}\`）`)
    content = replaceRow(content, 'Upstream latest', `\`${upstream.slice(4)}\` (\`${upstream}\`)`)
    content = replaceRow(content, '自动更新源', `✅ \`linux-latest\` → \`${customTag ?? version}\`<br>✅ \`linux-latest-official\` → \`${officialTag ?? version}\``)
    content = replaceRow(content, 'Update feed', `✅ \`linux-latest\` → \`${customTag ?? version}\`<br>✅ \`linux-latest-official\` → \`${officialTag ?? version}\``)
  }
  writeFileSync(path, content)
  console.log(`updated ${path}`)
}

syncReadme('README.md')
syncReadme('README.zh.md')

// Commit only when the tables actually changed, so pushes stay meaningful.
try {
  const status = execFileSync('git', ['status', '--porcelain', 'README.md', 'README.zh.md'], { encoding: 'utf8' })
  if (status.trim() === '') {
    console.log('README status unchanged')
    process.exit(0)
  }
  execFileSync('git', ['add', 'README.md', 'README.zh.md'])
  execFileSync('git', ['-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '--no-verify', '-m', `docs: 同步 README 状态（${branch} ${version}）`])
  execFileSync('git', ['push', 'origin', `HEAD:${branch}`])
  console.log('README status committed and pushed')
} catch (error) {
  console.error(`warn: could not commit README status: ${error instanceof Error ? error.message : String(error)}`)
}
