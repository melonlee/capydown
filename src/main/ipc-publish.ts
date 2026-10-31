/**
 * 发布相关 IPC 处理器
 */

import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { PublishManager } from './publish/adapters'
import type { PublishContext, PublishMetadata } from './publish/adapters'

let manager: PublishManager | null = null

// 只允许写入用户刚在保存对话框里选定的路径，避免渲染进程借导出接口写任意文件
const approvedExportPaths = new Set<string>()

function getManager(): PublishManager {
  if (!manager) {
    manager = new PublishManager(({ html, text }) => clipboard.write({ html, text }))
  }
  return manager
}

function sanitizeFileName(name: string): string {
  const cleaned = (name || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80)
  return cleaned || 'article'
}

export function initPublishIPCHandlers(): void {
  // 平台列表（含是否支持）
  ipcMain.handle('publish:get-platforms', async () => getManager().getPlatforms())

  // 发布到单个平台：公众号 = 写入剪贴板；markdown = 导出文件；其它平台如实返回「暂不支持」
  ipcMain.handle(
    'publish:publish',
    async (_, { platform, content, metadata, context }: {
      platform: string
      content: string
      metadata: PublishMetadata
      context?: PublishContext
    }) => {
      const ctx: PublishContext = { html: context?.html }
      if (platform === 'markdown') {
        const filePath = context?.filePath
        if (!filePath || !approvedExportPaths.has(filePath)) {
          return { success: false, platform, mode: 'file', error: '请先选择保存位置' }
        }
        approvedExportPaths.delete(filePath)
        ctx.filePath = filePath
      }
      return getManager().publish(String(platform), String(content ?? ''), metadata ?? { title: '' }, ctx)
    },
  )

  // 选择导出位置
  ipcMain.handle('publish:select-save-path', async (_, { defaultName }: { defaultName?: string } = {}) => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: '导出 Markdown',
      defaultPath: `${sanitizeFileName(defaultName ?? '')}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
      ],
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    approvedExportPaths.add(result.filePath)
    return { canceled: false, filePath: result.filePath }
  })
}
