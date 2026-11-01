import { BrowserWindow, clipboard, ipcMain, Menu, type MenuItemConstructorOptions, shell, type WebContents } from 'electron'
import { buildEditorContextMenuTemplate, type ContextMenuItem, type EditorContext, sanitizeEditorContext } from '../shared/context-menu'
import { isSafeExternalUrl } from './security'

/**
 * 编辑区右键菜单：渲染进程通过 editor:context-menu 上报上下文，这里生成原生菜单并弹出。
 * 命令类菜单项点击后走与菜单栏相同的 message-to-renderer 通道。
 */

const isMac = process.platform === 'darwin'
const isE2E = process.env.LAZYBOX_E2E === '1'

function toElectron(items: ContextMenuItem[], ctx: EditorContext, target: WebContents): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.type === 'separator')
      return { type: 'separator' }
    const base: MenuItemConstructorOptions = {
      label: item.label,
      accelerator: item.accelerator,
      enabled: item.enabled ?? true,
      // 快捷键只用于显示：真正的处理在渲染进程 / 菜单栏，避免右键菜单打开时重复注册
      registerAccelerator: false,
    }
    if (item.submenu)
      return { ...base, submenu: toElectron(item.submenu, ctx, target) }
    if (item.role)
      return { ...base, role: item.role }
    if (item.command) {
      const id = item.command
      return {
        ...base,
        id,
        click: () => {
          if (!target.isDestroyed())
            target.send('message-to-renderer', { action: 'command', payload: id })
        },
      }
    }
    return {
      ...base,
      id: `ctx.${item.action}`,
      click: () => {
        if (item.action === 'openLink' && ctx.linkUrl && isSafeExternalUrl(ctx.linkUrl))
          shell.openExternal(ctx.linkUrl)
        else if (item.action === 'copyLink' && ctx.linkUrl)
          clipboard.writeText(ctx.linkUrl)
        else if (item.action === 'copyImageUrl' && ctx.imageUrl)
          clipboard.writeText(ctx.imageUrl)
      },
    }
  })
}

export function buildEditorContextMenu(ctx: EditorContext, target: WebContents): Menu {
  return Menu.buildFromTemplate(toElectron(buildEditorContextMenuTemplate(ctx, isMac), ctx, target))
}

export function registerEditorContextMenu() {
  ipcMain.handle('editor:context-menu', (event, raw: unknown) => {
    const ctx = sanitizeEditorContext(raw)
    if (!ctx)
      return false
    const menu = buildEditorContextMenu(ctx, event.sender)
    // 端到端测试无法操作原生菜单：保留最近一次的菜单供检查 / 触发点击，不弹出
    if (isE2E) {
      ;(globalThis as any).__lbLastContextMenu = menu
      return true
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win)
      menu.popup({ window: win })
    return true
  })
}
