import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserWindow } from 'electron'

/**
 * 把渲染进程排好的完整 HTML 打印成 PDF。
 *
 * HTML 里的本地图片已换成 data URL、mermaid 已是 SVG，所以这里用一个
 * 不显示、沙箱化、禁用 JavaScript、没有 preload 的窗口加载它，再 printToPDF。
 * HTML 先写进临时文件再 loadFile（data: URL 有长度上限，图片多时会失败）。
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'slothdown-pdf-'))
  const file = join(dir, 'export.html')
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  // 导出页里的链接不允许导航或开新窗口
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  try {
    await writeFile(file, html, 'utf-8')
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width:100%;font-size:8px;color:#999;text-align:center;font-family:-apple-system,\'PingFang SC\',sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      // 边距由 HTML 里的 @page 决定（preferCSSPageSize），这里给一个同值的兜底（英寸）
      margins: { marginType: 'custom', top: 0.79, bottom: 0.79, left: 0.79, right: 0.79 },
    })
  }
  finally {
    if (!win.isDestroyed())
      win.destroy()
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
