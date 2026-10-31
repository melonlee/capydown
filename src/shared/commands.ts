/**
 * 应用命令表：菜单（主进程）、全局快捷键与命令面板（渲染进程）共用同一份定义，
 * 保证菜单里显示的快捷键与实际生效的快捷键一致。
 *
 * accelerator 使用 Electron 的写法（CmdOrCtrl+Shift+L、F8、Ctrl+` …）。
 */

export type CommandCategory = '文件' | '编辑' | '段落' | '格式' | '视图' | '主题' | '公众号'

export interface AppCommand {
  id: string
  label: string
  category: CommandCategory
  accelerator?: string
  /** 是否出现在命令面板里（默认 true） */
  palette?: boolean
  /** 需要编辑器获得焦点（或至少存在）才执行的编辑类命令 */
  editor?: boolean
}

export const APP_COMMANDS: AppCommand[] = [
  // 文件
  { id: 'file.new', label: '新建文件', category: '文件', accelerator: 'CmdOrCtrl+N' },
  { id: 'file.quickOpen', label: '快速打开…', category: '文件', accelerator: 'CmdOrCtrl+P' },
  { id: 'file.save', label: '保存', category: '文件', accelerator: 'CmdOrCtrl+S' },
  { id: 'file.rename', label: '重命名当前文件…', category: '文件' },
  { id: 'file.import', label: '导入 Markdown…', category: '文件', accelerator: 'Shift+CmdOrCtrl+I' },
  { id: 'file.exportMd', label: '导出 Markdown', category: '文件' },
  { id: 'file.exportHtml', label: '导出 HTML', category: '文件' },
  { id: 'file.closeWorkspace', label: '关闭工作区', category: '文件', accelerator: 'Shift+CmdOrCtrl+W' },
  { id: 'app.settings', label: '偏好设置…', category: '文件', accelerator: 'CmdOrCtrl+,' },
  { id: 'app.commandPalette', label: '命令面板…', category: '文件', accelerator: 'Shift+CmdOrCtrl+P', palette: false },

  // 编辑
  { id: 'edit.undo', label: '撤销', category: '编辑', accelerator: 'CmdOrCtrl+Z', editor: true, palette: false },
  { id: 'edit.redo', label: '重做', category: '编辑', accelerator: 'Shift+CmdOrCtrl+Z', editor: true, palette: false },
  { id: 'edit.find', label: '查找', category: '编辑', accelerator: 'CmdOrCtrl+F', editor: true },
  { id: 'edit.format', label: '格式化文档', category: '编辑', accelerator: 'Alt+Shift+F', editor: true },

  // 段落
  { id: 'para.h1', label: '一级标题', category: '段落', accelerator: 'CmdOrCtrl+1', editor: true },
  { id: 'para.h2', label: '二级标题', category: '段落', accelerator: 'CmdOrCtrl+2', editor: true },
  { id: 'para.h3', label: '三级标题', category: '段落', accelerator: 'CmdOrCtrl+3', editor: true },
  { id: 'para.h4', label: '四级标题', category: '段落', accelerator: 'CmdOrCtrl+4', editor: true },
  { id: 'para.h5', label: '五级标题', category: '段落', accelerator: 'CmdOrCtrl+5', editor: true },
  { id: 'para.h6', label: '六级标题', category: '段落', accelerator: 'CmdOrCtrl+6', editor: true },
  { id: 'para.paragraph', label: '段落', category: '段落', accelerator: 'CmdOrCtrl+0', editor: true },
  { id: 'para.table', label: '插入表格…', category: '段落', accelerator: 'Alt+CmdOrCtrl+T', editor: true },
  { id: 'para.codeBlock', label: '代码块', category: '段落', accelerator: 'Alt+CmdOrCtrl+C', editor: true },
  { id: 'para.quote', label: '引用', category: '段落', accelerator: 'Alt+CmdOrCtrl+Q', editor: true },
  { id: 'para.ol', label: '有序列表', category: '段落', accelerator: 'Alt+CmdOrCtrl+O', editor: true },
  { id: 'para.ul', label: '无序列表', category: '段落', accelerator: 'Alt+CmdOrCtrl+U', editor: true },
  { id: 'para.task', label: '任务列表', category: '段落', accelerator: 'Alt+CmdOrCtrl+X', editor: true },
  { id: 'para.hr', label: '水平分割线', category: '段落', accelerator: 'Alt+CmdOrCtrl+-', editor: true },

  // 格式
  { id: 'fmt.bold', label: '加粗', category: '格式', accelerator: 'CmdOrCtrl+B', editor: true },
  { id: 'fmt.italic', label: '斜体', category: '格式', accelerator: 'CmdOrCtrl+I', editor: true },
  { id: 'fmt.strike', label: '删除线', category: '格式', accelerator: 'CmdOrCtrl+D', editor: true },
  { id: 'fmt.code', label: '行内代码', category: '格式', accelerator: 'CmdOrCtrl+E', editor: true },
  { id: 'fmt.link', label: '超链接', category: '格式', accelerator: 'Alt+CmdOrCtrl+K', editor: true },
  { id: 'fmt.image', label: '插入图片…', category: '格式', accelerator: 'Ctrl+CmdOrCtrl+I', editor: true },
  { id: 'fmt.uploadImage', label: '上传图片…', category: '格式' },

  // 视图
  { id: 'view.sourceMode', label: '源代码模式', category: '视图', accelerator: 'CmdOrCtrl+/' },
  { id: 'view.sidebar', label: '显示 / 隐藏侧边栏', category: '视图', accelerator: 'Shift+CmdOrCtrl+L' },
  { id: 'view.outline', label: '大纲', category: '视图', accelerator: 'Ctrl+CmdOrCtrl+1' },
  { id: 'view.files', label: '文件', category: '视图', accelerator: 'Ctrl+CmdOrCtrl+3' },
  { id: 'view.focus', label: '专注模式', category: '视图', accelerator: 'F8' },
  { id: 'view.typewriter', label: '打字机模式', category: '视图', accelerator: 'F9' },
  { id: 'view.statusBar', label: '显示 / 隐藏状态栏', category: '视图' },
  { id: 'view.wechat', label: '公众号预览', category: '视图', accelerator: 'Alt+CmdOrCtrl+P' },

  // 主题
  { id: 'theme.github', label: 'GitHub（默认）', category: '主题' },
  { id: 'theme.newsprint', label: 'Newsprint 报纸', category: '主题' },
  { id: 'theme.night', label: 'Night 夜间', category: '主题' },
  { id: 'theme.followSystem', label: '跟随系统深色模式', category: '主题' },
  { id: 'theme.articleStyle', label: '公众号排版样式…', category: '主题' },
  { id: 'theme.customCss', label: '公众号自定义 CSS…', category: '主题' },

  // 公众号
  { id: 'wechat.copy', label: '复制到公众号', category: '公众号', accelerator: 'Shift+CmdOrCtrl+C' },
  { id: 'wechat.publish', label: '发布…', category: '公众号' },
  // AI 只保留两个功能：发布前校对（这里）和发布对话框里的「拟标题和摘要」
  { id: 'ai.proofread', label: '发布前校对…', category: '公众号' },
]

export const COMMAND_MAP: Record<string, AppCommand> = Object.fromEntries(APP_COMMANDS.map(c => [c.id, c]))

/** 菜单状态（勾选项），由渲染进程推送给主进程 */
export interface MenuState {
  sourceMode: boolean
  focusMode: boolean
  typewriterMode: boolean
  sidebar: boolean
  sidebarTab: 'files' | 'outline'
  statusBar: boolean
  wechat: boolean
  theme: 'github' | 'newsprint' | 'night'
  followSystem: boolean
}

// ---------------------------------------------------------------------------
// 快捷键解析：把 Electron accelerator 转成可匹配 KeyboardEvent 的结构，以及显示用的符号
// ---------------------------------------------------------------------------

export interface ParsedShortcut {
  mod: boolean // CmdOrCtrl
  ctrl: boolean // 物理 Control（mac 上与 Cmd 区分）
  alt: boolean
  shift: boolean
  code: string // KeyboardEvent.code
  key: string // 原始按键字符，用于显示
}

const CODE_MAP: Record<string, string> = {
  '/': 'Slash',
  '\\': 'Backslash',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  '\'': 'Quote',
}

export function parseAccelerator(accelerator: string): ParsedShortcut {
  // 末尾的 "+" 本身不会出现在我们的表里，按 "+" 切分即可
  const parts = accelerator.split('+')
  const key = parts.pop() || ''
  const result: ParsedShortcut = { mod: false, ctrl: false, alt: false, shift: false, code: '', key }
  for (const p of parts) {
    const m = p.toLowerCase()
    if (m === 'cmdorctrl' || m === 'commandorcontrol')
      result.mod = true
    else if (m === 'ctrl' || m === 'control')
      result.ctrl = true
    else if (m === 'alt' || m === 'option')
      result.alt = true
    else if (m === 'shift')
      result.shift = true
    else if (m === 'cmd' || m === 'command')
      result.mod = true
  }
  if (/^[a-z]$/i.test(key))
    result.code = `Key${key.toUpperCase()}`
  else if (/^\d$/.test(key))
    result.code = `Digit${key}`
  else if (/^F\d{1,2}$/i.test(key))
    result.code = key.toUpperCase()
  else
    result.code = CODE_MAP[key] || key
  return result
}

export interface KeyLike {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export function matchShortcut(e: KeyLike, s: ParsedShortcut, isMac: boolean): boolean {
  if (e.code !== s.code)
    return false
  const wantMeta = isMac ? s.mod : false
  const wantCtrl = isMac ? s.ctrl : (s.mod || s.ctrl)
  return e.metaKey === wantMeta && e.ctrlKey === wantCtrl && e.altKey === s.alt && e.shiftKey === s.shift
}

export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const s = parseAccelerator(accelerator)
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key
  if (isMac) {
    return `${s.ctrl ? '⌃' : ''}${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${s.mod ? '⌘' : ''}${key}`
  }
  const mods = [s.mod || s.ctrl ? 'Ctrl' : '', s.alt ? 'Alt' : '', s.shift ? 'Shift' : ''].filter(Boolean)
  return [...mods, key].join('+')
}
