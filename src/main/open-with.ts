/**
 * 「用 Capydown 打开」的纯逻辑（不依赖 electron，便于单元测试）：
 * 从命令行参数里找出要打开的 Markdown 文件，以及决定在哪个工作区里打开它。
 */
import * as path from 'path'
import { fileURLToPath } from 'url'

/** 注册为打开方式的扩展名（与 electron-builder.yml 的 fileAssociations 保持一致） */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn'] as const

export function isMarkdownPath(p: string): boolean {
  const ext = path.extname(p).slice(1).toLowerCase()
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Windows / Linux 通过命令行参数把文件交给应用：
 *   打包后  Capydown.exe "C:\\a\\b.md"
 *   开发时  electron out/main/index.cjs b.md
 * 跳过 argv[0]、所有 --开关、非 Markdown 参数（如入口脚本）；相对路径按 cwd 解析，file:// 转成路径。
 */
export function extractMarkdownArgs(argv: readonly string[], cwd: string): string[] {
  const out: string[] = []
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-'))
      continue
    let p = raw
    if (/^file:\/\//i.test(p)) {
      try {
        p = fileURLToPath(p)
      }
      catch {
        continue
      }
    }
    if (!isMarkdownPath(p))
      continue
    const abs = path.resolve(cwd, p)
    if (!out.includes(abs))
      out.push(abs)
  }
  return out
}

export interface OpenTarget {
  /** 需要切换（或打开）工作区 */
  switchWorkspace: boolean
  /** 打开文件所用的工作区路径 */
  workspace: string
  /** 工作区内的文件路径（与工作区路径写法一致，便于在文件树里查找） */
  file: string
}

/** child 在 parent 之内时返回相对路径（保留 child 原有大小写），否则返回 null */
function relativeInside(child: string, parent: string, caseInsensitive: boolean): string | null {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  const norm = (x: string): string => caseInsensitive ? x.toLowerCase() : x
  const rel = path.relative(norm(p), norm(c))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
    return null
  // 相对部分的长度不受大小写影响，从原路径末尾截取以保留文件名大小写
  return c.slice(c.length - rel.length)
}

/**
 * Typora 式行为：文件在当前工作区内 → 直接打开；否则把文件所在文件夹作为工作区打开。
 *
 * @param file 系统交给我们的文件路径
 * @param workspace 当前工作区（渲染进程记录的写法），没有则为 null
 * @param real 可选的真实路径（解析过符号链接，如 macOS 的 /tmp → /private/tmp），用于比较
 */
export function decideOpenTarget(
  file: string,
  workspace: string | null | undefined,
  real: { file?: string, workspace?: string } = {},
  caseInsensitive = process.platform !== 'linux',
): OpenTarget {
  const realFile = real.file ?? file
  const realWs = real.workspace ?? workspace ?? ''
  const rel = workspace ? relativeInside(realFile, realWs, caseInsensitive) : null
  if (workspace && rel)
    return { switchWorkspace: false, workspace, file: path.join(workspace, rel) }
  return { switchWorkspace: true, workspace: path.dirname(path.resolve(file)), file: path.resolve(file) }
}
