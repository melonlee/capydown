/**
 * 导出 PDF / Word 的 IPC：保存对话框、生成文件、在访达中显示。
 */
import { writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { defaultExportPath, type ExportFormat } from './export/names'
import { renderHtmlToPdf } from './export/pdf'
import { markdownToDocx } from './export/docx'

export interface ExportResult {
  canceled?: boolean
  filePath?: string
  error?: string
}

// 只允许「在访达中显示」刚导出的文件
const exportedFiles = new Set<string>()

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  pdf: { name: 'PDF', extensions: ['pdf'] },
  docx: { name: 'Word 文档', extensions: ['docx'] },
}

const TITLES: Record<ExportFormat, string> = {
  pdf: '导出 PDF',
  docx: '导出 Word',
}

async function askSavePath(sender: Electron.WebContents, format: ExportFormat, docPath?: string, title?: string): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getFocusedWindow()
  const options: Electron.SaveDialogOptions = {
    title: TITLES[format],
    defaultPath: defaultExportPath(docPath, format, app.getPath('documents'), title),
    filters: [FILTERS[format]],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath)
    return null
  const ext = `.${format}`
  return result.filePath.toLowerCase().endsWith(ext) ? result.filePath : result.filePath + ext
}

/**
 * 导出流程：先问保存位置，再生成内容并写盘。
 * 端到端测试可以设置 SLOTHDOWN_E2E_EXPORT_DIR 跳过对话框，直接写到该目录。
 */
async function runExport(
  sender: Electron.WebContents,
  format: ExportFormat,
  opts: { docPath?: string, title?: string },
  produce: () => Promise<Buffer>,
): Promise<ExportResult> {
  try {
    const e2eDir = process.env.SLOTHDOWN_E2E === '1' ? process.env.SLOTHDOWN_E2E_EXPORT_DIR : undefined
    const target = e2eDir
      ? join(e2eDir, basename(defaultExportPath(opts.docPath, format, e2eDir, opts.title)))
      : await askSavePath(sender, format, opts.docPath, opts.title)
    if (!target)
      return { canceled: true }
    const data = await produce()
    await writeFile(target, data)
    exportedFiles.add(target)
    return { filePath: target }
  }
  catch (error) {
    console.error(`[export] ${format} failed:`, error)
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function initExportIPCHandlers(): void {
  ipcMain.handle('export:pdf', async (event, { html, docPath, title }: { html: string, docPath?: string, title?: string }) => {
    if (typeof html !== 'string' || !html)
      return { error: '没有可导出的内容' }
    return runExport(event.sender, 'pdf', { docPath, title }, () => renderHtmlToPdf(html))
  })

  ipcMain.handle('export:docx', async (event, { markdown, docPath, title }: { markdown: string, docPath?: string, title?: string }) => {
    if (typeof markdown !== 'string')
      return { error: '没有可导出的内容' }
    const baseDir = docPath ? dirname(docPath) : app.getPath('documents')
    return runExport(event.sender, 'docx', { docPath, title }, () => markdownToDocx(markdown, { baseDir }))
  })

  ipcMain.handle('export:show-in-folder', (_, { filePath }: { filePath: string }) => {
    if (typeof filePath === 'string' && exportedFiles.has(filePath))
      shell.showItemInFolder(filePath)
  })
}
