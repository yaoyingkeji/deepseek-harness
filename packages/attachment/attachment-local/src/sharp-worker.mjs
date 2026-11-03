/**
 * Linux sharp worker：在独立 Node 进程中运行 sharp，
 * 避免 Electron 的 GTK 全局符号与 sharp 内嵌的 libvips gobject 碰撞。
 *
 * 仅在 Linux 上启用。macOS/Windows 仍在 Host 进程内直接调用 sharp。
 *
 * 通信协议（IPC stdin/stdout JSON 行）：
 *   请求: { id, op, data, options }
 *   响应: { id, ok, result } | { id, error }
 *
 * op 支持: metadata | raw | encode
 */

import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} b64 - base64-encoded image bytes
 * @returns {Buffer}
 */
function decode(b64) {
  return Buffer.from(b64, 'base64')
}

/**
 * @param {Buffer} buf
 * @returns {string}
 */
function encode(buf) {
  return buf.toString('base64')
}

/**
 * @param {import('sharp').Sharp} image
 * @returns {Promise<object>}
 */
async function getMetadata(image) {
  const metadata = await image.metadata()
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    depth: metadata.depth,
    space: metadata.space,
    hasAlpha: metadata.hasAlpha,
    hasProfile: metadata.hasProfile,
    orientation: metadata.orientation,
    pages: metadata.pages,
    exif: metadata.exif,
    xmp: metadata.xmp,
    iptc: metadata.iptc,
    icc: metadata.icc,
    tifftagPhotoshop: metadata.tifftagPhotoshop,
    comments: metadata.comments,
  }
}

/**
 * @param {{id:number, op:string, data:string, options?:any}} req
 * @returns {Promise<{id:number, ok:boolean, result?:any, error?:string}>}
 */
async function handleRequest(req) {
  try {
    const buf = decode(req.data)
    if (req.op === 'metadata') {
      const image = sharp(buf, { failOn: 'error', limitInputPixels: false })
      const result = await getMetadata(image)
      return { id: req.id, ok: true, result }
    }
    if (req.op === 'raw') {
      const image = sharp(buf, { failOn: 'error', limitInputPixels: false })
      await image.raw().toBuffer()
      return { id: req.id, ok: true, result: { ok: true } }
    }
    if (req.op === 'encode') {
      const opts = req.options ?? {}
      let pipeline = sharp(buf, { failOn: 'error', limitInputPixels: false })
      // normalization pipeline: rotate + toColourspace('srgb') + resize
      if (opts.normalize) {
        pipeline = pipeline.rotate().toColourspace('srgb')
      }
      if (opts.resize) {
        pipeline = pipeline.resize({
          width: opts.resize.width,
          height: opts.resize.height,
          fit: opts.resize.fit ?? 'inside',
          withoutEnlargement: true,
        })
      }
      const format = opts.format ?? 'webp'
      const quality = opts.quality ?? 85
      if (format === 'webp') {
        pipeline = pipeline.webp({ quality, effort: 0 })
      } else if (format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality })
      } else if (format === 'png') {
        pipeline = pipeline.png()
      }
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
      return {
        id: req.id,
        ok: true,
        result: {
          data: encode(data),
          mediaType: `image/${format}`,
          width: info.width,
          height: info.height,
        },
      }
    }
    return { id: req.id, ok: false, error: `unknown op: ${req.op}` }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

let stdinBuffer = ''
process.stdin.setEncoding('utf8')

process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk
  let newlineIdx
  while ((newlineIdx = stdinBuffer.indexOf('\n')) >= 0) {
    const line = stdinBuffer.slice(0, newlineIdx).trim()
    stdinBuffer = stdinBuffer.slice(newlineIdx + 1)
    if (line === '') continue
    try {
      const req = JSON.parse(line)
      handleRequest(req).then((resp) => {
        process.stdout.write(JSON.stringify(resp) + '\n')
      }).catch((err) => {
        process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: String(err) }) + '\n')
      })
    } catch {
      // Ignore malformed JSON lines
    }
  }
})

process.stdin.on('end', () => {
  process.exit(0)
})

// Signal readiness
process.stdout.write(JSON.stringify({ id: 0, ok: true, result: 'ready' }) + '\n')
