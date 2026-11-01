import * as path from 'path'

/** 导出格式 → 扩展名 */
export type ExportFormat = 'pdf' | 'docx'

const MD_EXT = /\.(?:md|markdown|mdown|mkdn?|txt)$/i

/** 文件名里不能出现的字符替换成空格（Windows 最严格，按它来） */
export function sanitizeBaseName(name: string): string {
  const cleaned = (name || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned || '未命名'
}

/**
 * 导出对话框的默认路径：与文档同目录、同名，换成目标扩展名。
 * 文档还没保存（没有路径）时放到 fallbackDir，文件名用 fallbackName（一般是标题）。
 */
export function defaultExportPath(docPath: string | undefined, format: ExportFormat, fallbackDir: string, fallbackName = '未命名'): string {
  if (docPath && path.isAbsolute(docPath)) {
    const base = path.basename(docPath).replace(MD_EXT, '')
    return path.join(path.dirname(docPath), `${sanitizeBaseName(base)}.${format}`)
  }
  return path.join(fallbackDir, `${sanitizeBaseName(fallbackName)}.${format}`)
}
