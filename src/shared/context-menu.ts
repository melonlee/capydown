/**
 * 编辑区右键菜单（原生菜单，Typora 式）。
 * 渲染进程只上报上下文（有没有选区、光标是否在链接 / 图片上），主进程用这里的纯函数
 * 从共享命令表生成菜单模板，再转成 Electron Menu 并 popup()。点击后的命令 id 沿用
 * 菜单栏的 message-to-renderer 通道，执行路径与菜单栏完全一致。
 */
import { acceleratorFor, COMMAND_MAP } from './commands'

export interface EditorContext {
  hasSelection: boolean
  /** 光标（或右键位置）所在链接的地址 */
  linkUrl: string | null
  /** 右键位置是图片时的图片地址 */
  imageUrl: string | null
}

/** 主进程收到的 payload 不可信：只保留已知字段并限制长度 */
export function sanitizeEditorContext(raw: unknown): EditorContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null
  const r = raw as Record<string, unknown>
  const url = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 4096 ? v : null)
  return {
    hasSelection: r.hasSelection === true,
    linkUrl: url(r.linkUrl),
    imageUrl: url(r.imageUrl),
  }
}

/** 与 Electron MenuItemConstructorOptions 对应的最小描述（便于测试，不依赖 electron） */
export interface ContextMenuItem {
  type?: 'separator'
  label?: string
  /** 命令 id：点击时发回渲染进程执行 */
  command?: string
  /** 原生角色（剪切 / 复制 / 粘贴 / 全选） */
  role?: 'cut' | 'copy' | 'paste' | 'selectAll'
  /** 主进程本地处理的动作 */
  action?: 'openLink' | 'copyLink' | 'copyImageUrl'
  accelerator?: string
  enabled?: boolean
  submenu?: ContextMenuItem[]
}

const SEP: ContextMenuItem = { type: 'separator' }

function cmd(id: string, isMac: boolean, label?: string): ContextMenuItem {
  const c = COMMAND_MAP[id]
  if (!c)
    throw new Error(`unknown command ${id}`)
  return { label: label ?? c.label, command: id, accelerator: acceleratorFor(c, isMac) }
}

export function buildEditorContextMenuTemplate(ctx: EditorContext, isMac: boolean): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (ctx.linkUrl) {
    items.push(
      { label: '打开链接', action: 'openLink', enabled: /^(?:https?:|mailto:)/i.test(ctx.linkUrl) },
      { label: '复制链接地址', action: 'copyLink' },
      SEP,
    )
  }
  else if (ctx.imageUrl) {
    items.push({ label: '复制图片地址', action: 'copyImageUrl' }, SEP)
  }
  items.push(
    { label: '剪切', role: 'cut', accelerator: 'CmdOrCtrl+X', enabled: ctx.hasSelection },
    { label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C', enabled: ctx.hasSelection },
    { label: '粘贴', role: 'paste', accelerator: 'CmdOrCtrl+V' },
    { label: '全选', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
    SEP,
    {
      label: '段落',
      submenu: [
        cmd('para.h1', isMac, '标题 1'),
        cmd('para.h2', isMac, '标题 2'),
        cmd('para.h3', isMac, '标题 3'),
        cmd('para.h4', isMac, '标题 4'),
        cmd('para.h5', isMac, '标题 5'),
        cmd('para.h6', isMac, '标题 6'),
        SEP,
        cmd('para.paragraph', isMac, '正文'),
        SEP,
        cmd('para.ol', isMac),
        cmd('para.ul', isMac),
        cmd('para.task', isMac),
        SEP,
        cmd('para.quote', isMac),
        cmd('para.codeBlock', isMac),
      ],
    },
    {
      label: '格式',
      submenu: [
        cmd('fmt.bold', isMac),
        cmd('fmt.italic', isMac),
        cmd('fmt.strike', isMac),
        cmd('fmt.code', isMac),
        SEP,
        cmd('fmt.link', isMac, '链接'),
      ],
    },
    {
      label: '插入',
      submenu: [
        cmd('fmt.uploadImage', isMac, '图片…'),
        cmd('para.table', isMac, '表格…'),
        cmd('fmt.link', isMac, '链接'),
        cmd('para.codeBlock', isMac, '代码块'),
        cmd('para.hr', isMac, '分割线'),
      ],
    },
    SEP,
    cmd('ai.proofread', isMac),
  )
  return items
}
