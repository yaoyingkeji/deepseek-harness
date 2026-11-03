/**
 * Linux sharp worker 客户端：在独立 Node 子进程中运行 sharp，
 * 避免 Electron 的 GTK 全局符号与 sharp 内嵌的 libvips gobject 碰撞。
 *
 * 仅在 Linux 上启用（DSH_STANDALONE_NODE 环境变量存在时）。
 * macOS/Windows 仍在 Host 进程内直接调用 sharp。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Worker 返回的图片元数据。 */
export interface WorkerMetadata {
  format: string
  width: number
  height: number
  depth: string
  space: string
  hasAlpha: boolean
  hasProfile: boolean
  orientation?: number
  pages?: number
  exif?: Buffer
  xmp?: Buffer
  iptc?: Buffer
  icc?: Buffer
  tifftagPhotoshop?: Buffer
  comments?: Buffer
}

/** Worker 编码选项。 */
export type WorkerEncodeOptions = WorkerRequestOptions

/** Worker 编码结果。 */
export interface WorkerEncodeResult {
  data: Uint8Array
  mediaType: string
  width: number
  height: number
}

// Worker 脚本路径解析。
// 关键问题：Host 进程运行在 Electron Node 模式下，import.meta.url 指向
// app.asar 内的路径。Electron 能读 asar，所以 existsSync() 返回 true。
// 但独立 Node 二进制不能读 asar，必须用 app.asar.unpacked 路径。
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 解析 worker 脚本路径，将 asar 路径转换为 unpacked 路径。
 * 在打包环境中，import.meta.url 指向 app.asar 内的文件；
 * 独立 Node 不能读 asar，需要 app.asar.unpacked 路径。
 */
function resolveWorkerScriptPath(): string {
  // 开发模式：从 src/ 目录加载
  const devPath = join(__dirname, 'sharp-worker.mjs')
  if (existsSync(devPath)) return devPath

  // 打包模式：lib/sharp-worker.mjs（编译后在 lib/ 目录）
  const asarPath = join(__dirname, 'sharp-worker.mjs')
  if (existsSync(asarPath)) {
    // 将 app.asar 路径转换为 app.asar.unpacked 路径
    // 独立 Node 二进制不能读 asar 文件
    const unpackedPath = asarPath.replace(
      /([\\/])app\.asar([\\/])/,
      '$1app.asar.unpacked$2',
    )
    if (existsSync(unpackedPath)) return unpackedPath
    // 回退：如果 unpacked 不存在，返回 asar 路径（在 Electron 本身运行时可能有效）
    return asarPath
  }

  return asarPath
}

const workerScriptPath = resolveWorkerScriptPath()

/** 是否应该使用 sharp worker 子进程（仅 Linux + DSH_STANDALONE_NODE 设置时）。 */
export function shouldUseSharpWorker(): boolean {
  return process.platform === 'linux'
    && process.env.DSH_STANDALONE_NODE !== undefined
    && process.env.DSH_STANDALONE_NODE !== ''
}

/** 从环境变量获取独立 Node 二进制路径。 */
function standaloneNodePath(): string {
  const path = process.env.DSH_STANDALONE_NODE
  if (path === undefined || path === '') throw new Error('sharp worker: DSH_STANDALONE_NODE is not set')
  return path
}

/** 请求/响应的 JSON 行协议。 */
interface WorkerRequestOptions {
  format?: 'webp' | 'jpeg' | 'png'
  quality?: number
  resize?: { width?: number; height?: number; fit?: 'cover' | 'contain' | 'inside' | 'outside' }
  /** 是否执行 normalization pipeline（rotate + toColourspace('srgb')） */
  normalize?: boolean
}

interface WorkerRequest {
  id: number
  op: 'metadata' | 'raw' | 'encode'
  data: string
  options?: WorkerRequestOptions | undefined
}

interface WorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

/** sharp worker 子进程管理器（单例）。 */
export class SharpWorker {
  private child: ChildProcess | undefined
  private nextId = 1
  private readonly pending = new Map<number, {
    resolve: (response: WorkerResponse) => void
    reject: (error: Error) => void
  }>()
  private stdoutBuffer = ''
  private disposed = false
  private restartTimer: NodeJS.Timeout | undefined

  /** 启动子进程（懒加载，首次调用时触发）。 */
  private ensureChild(): void {
    if (this.child !== undefined || this.disposed) return

    const nodeBin = standaloneNodePath()
    const child = spawn(nodeBin, [workerScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      this.stdoutBuffer += chunk
      let newlineIdx: number
      while ((newlineIdx = this.stdoutBuffer.indexOf('\n')) >= 0) {
        const line = this.stdoutBuffer.slice(0, newlineIdx).trim()
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1)
        if (line === '') continue
        try {
          const resp = JSON.parse(line) as WorkerResponse
          if (resp.id === 0 && resp.ok && resp.result === 'ready') continue // ready 信号
          const pending = this.pending.get(resp.id)
          if (pending !== undefined) {
            this.pending.delete(resp.id)
            pending.resolve(resp)
          }
        } catch {
          // 忽略格式错误的 JSON 行
        }
      }
    })

    child.on('close', (code) => {
      this.child = undefined
      // 拒绝所有待处理请求
      for (const [, pending] of this.pending) {
        pending.reject(new Error(`sharp worker exited (code ${code})`))
      }
      this.pending.clear()

      // 意外退出时自动重启（不是 disposed 且不是正常退出）
      if (!this.disposed && code !== 0) {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = undefined
          this.ensureChild()
        }, 1000)
      }
    })

    child.on('error', (err) => {
      this.child = undefined
      for (const [, pending] of this.pending) {
        pending.reject(err)
      }
      this.pending.clear()
    })

    // 捕获 stdin EPIPE 错误：当 worker 子进程已退出但还有 pending 请求时，
    // stdin.write 会触发 EPIPE。不让它变成 uncaught exception。
    child.stdin?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // worker 已退出，pending 请求会被 close handler 拒绝
        return
      }
      throw err
    })

    this.child = child
  }

  /** 发送请求并等待响应。 */
  private async request(op: WorkerRequest['op'], data: Uint8Array, options?: WorkerRequestOptions): Promise<WorkerResponse> {
    this.ensureChild()
    if (this.child === undefined) throw new Error('sharp worker is not running')

    const id = this.nextId++
    const req: WorkerRequest = {
      id,
      op,
      data: Buffer.from(data).toString('base64'),
      options,
    }

    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child?.stdin?.write(JSON.stringify(req) + '\n')

      // 超时（30 秒）
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`sharp worker request timeout (op=${op})`))
        }
      }, 30_000)
    })
  }

  /** 获取图片元数据（header-only probe）。 */
  async metadata(data: Uint8Array): Promise<WorkerMetadata> {
    const resp = await this.request('metadata', data)
    if (!resp.ok) throw new Error(resp.error ?? 'sharp worker metadata failed')
    return resp.result as WorkerMetadata
  }

  /** 完全解码图片验证可栅格化。 */
  async rawDecode(data: Uint8Array): Promise<void> {
    const resp = await this.request('raw', data)
    if (!resp.ok) throw new Error(resp.error ?? 'sharp worker raw decode failed')
  }

  /** 编码图片（resize + format 转换）。 */
  async encode(data: Uint8Array, options?: WorkerRequestOptions): Promise<WorkerEncodeResult> {
    const resp = await this.request('encode', data, options)
    if (!resp.ok) throw new Error(resp.error ?? 'sharp worker encode failed')
    const result = resp.result as { data: string; mediaType: string; width: number; height: number }
    return {
      data: new Uint8Array(Buffer.from(result.data, 'base64')),
      mediaType: result.mediaType,
      width: result.width,
      height: result.height,
    }
  }

  /** 销毁子进程。 */
  dispose(): void {
    this.disposed = true
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer)
      this.restartTimer = undefined
    }
    if (this.child !== undefined) {
      this.child.kill()
      this.child = undefined
    }
    for (const [, pending] of this.pending) {
      pending.reject(new Error('sharp worker disposed'))
    }
    this.pending.clear()
  }
}

/** sharp worker 单例。 */
let sharpWorker: SharpWorker | undefined

/** 获取 sharp worker 单例（首次调用时创建）。 */
export function getSharpWorker(): SharpWorker {
  if (sharpWorker === undefined) {
    sharpWorker = new SharpWorker()
  }
  return sharpWorker
}
