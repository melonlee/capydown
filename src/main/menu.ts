import { app, BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from 'electron'
import { APP_DISPLAY_NAME } from '../shared/brand'
import { COMMAND_MAP, type MenuState } from '../shared/commands'

/**
 * Typora 式原生菜单：文件 / 编辑 / 段落 / 格式 / 视图 / 主题 / 窗口 / 帮助。
 * 菜单项只负责把命令 id 发给渲染进程；快捷键与命令面板共用 src/shared/commands.ts。
 * 勾选状态（源代码模式、专注模式、当前主题…）由渲染进程推送后重建菜单。
 */

const isMac = process.platform === 'darwin'

let state: MenuState = {
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  sidebar: true,
  sidebarTab: 'files',
  statusBar: true,
  wechat: false,
  theme: 'github',
  followSystem: true,
}

function send(id: string) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('message-to-renderer', { action: 'command', payload: id })
}

function cmd(id: string, extra: Partial<MenuItemConstructorOptions> = {}): MenuItemConstructorOptions {
  const c = COMMAND_MAP[id]
  return {
    label: c?.label ?? id,
    accelerator: c?.accelerator,
    click: () => send(id),
    ...extra,
  }
}

const sep: MenuItemConstructorOptions = { type: 'separator' }

function template(): MenuItemConstructorOptions[] {
  return [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { label: `关于 ${APP_DISPLAY_NAME}`, role: 'about' },
            sep,
            cmd('app.settings', { label: '偏好设置…' }),
            sep,
            { role: 'services' },
            sep,
            { role: 'hide', label: `隐藏 ${APP_DISPLAY_NAME}` },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '全部显示' },
            sep,
            { role: 'quit', label: `退出 ${APP_DISPLAY_NAME}` },
          ],
        } as MenuItemConstructorOptions]
      : []),
    {
      label: '文件',
      submenu: [
        cmd('file.new'),
        cmd('file.quickOpen'),
        sep,
        cmd('file.save'),
        cmd('file.rename'),
        sep,
        cmd('file.import'),
        {
          label: '导出',
          submenu: [cmd('file.exportMd', { label: 'Markdown…' }), cmd('file.exportHtml', { label: 'HTML…' })],
        },
        sep,
        cmd('wechat.copy'),
        cmd('ai.proofread'),
        cmd('wechat.publish'),
        sep,
        cmd('app.commandPalette'),
        sep,
        cmd('file.closeWorkspace'),
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
        ...(isMac ? [] : [sep, cmd('app.settings')]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        cmd('edit.undo'),
        cmd('edit.redo'),
        sep,
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴为纯文本' },
        { role: 'selectAll', label: '全选' },
        sep,
        cmd('edit.find', { label: '查找与替换' }),
        cmd('edit.format'),
      ],
    },
    {
      label: '段落',
      submenu: [
        cmd('para.h1'),
        cmd('para.h2'),
        cmd('para.h3'),
        cmd('para.h4'),
        cmd('para.h5'),
        cmd('para.h6'),
        sep,
        cmd('para.paragraph'),
        sep,
        cmd('para.table'),
        cmd('para.codeBlock'),
        sep,
        cmd('para.quote'),
        sep,
        cmd('para.ol'),
        cmd('para.ul'),
        cmd('para.task'),
        sep,
        cmd('para.hr'),
      ],
    },
    {
      label: '格式',
      submenu: [
        cmd('fmt.bold'),
        cmd('fmt.italic'),
        cmd('fmt.strike'),
        cmd('fmt.code'),
        sep,
        cmd('fmt.link'),
        {
          label: '图片',
          submenu: [cmd('fmt.image', { label: '插入图片语法' }), cmd('fmt.uploadImage')],
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        cmd('view.sourceMode', { type: 'checkbox', checked: state.sourceMode }),
        sep,
        cmd('view.sidebar', { type: 'checkbox', checked: state.sidebar, label: '侧边栏' }),
        cmd('view.outline', { type: 'checkbox', checked: state.sidebar && state.sidebarTab === 'outline' }),
        cmd('view.files', { type: 'checkbox', checked: state.sidebar && state.sidebarTab === 'files' }),
        sep,
        cmd('view.focus', { type: 'checkbox', checked: state.focusMode }),
        cmd('view.typewriter', { type: 'checkbox', checked: state.typewriterMode }),
        cmd('view.statusBar', { type: 'checkbox', checked: state.statusBar, label: '状态栏' }),
        sep,
        cmd('view.wechat', { type: 'checkbox', checked: state.wechat }),
        sep,
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        sep,
        { role: 'togglefullscreen', label: '切换全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '主题',
      submenu: [
        cmd('theme.github', { type: 'radio', checked: state.theme === 'github' }),
        cmd('theme.newsprint', { type: 'radio', checked: state.theme === 'newsprint' }),
        cmd('theme.night', { type: 'radio', checked: state.theme === 'night' }),
        sep,
        cmd('theme.followSystem', { type: 'checkbox', checked: state.followSystem }),
        sep,
        cmd('theme.articleStyle'),
        cmd('theme.customCss'),
      ],
    },
    {
      label: '窗口',
      role: 'window',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [sep, { role: 'front', label: '前置全部窗口' } as MenuItemConstructorOptions] : [{ role: 'close', label: '关闭' } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: '帮助',
      role: 'help',
      submenu: [
        {
          label: '使用指南与快捷键',
          click: async () => {
            await shell.openExternal('https://github.com/melonlee/LazyBox/blob/main/docs/usage.md')
          },
        },
        {
          label: '反馈问题',
          click: async () => {
            await shell.openExternal('https://github.com/melonlee/LazyBox/issues')
          },
        },
      ],
    },
  ]
}

export function buildMenu(): Menu {
  return Menu.buildFromTemplate(template())
}

/** 渲染进程推送的勾选状态变化后重建菜单 */
export function updateMenuState(next: Partial<MenuState>) {
  const merged = { ...state, ...next }
  if (JSON.stringify(merged) === JSON.stringify(state))
    return
  state = merged
  Menu.setApplicationMenu(buildMenu())
}

export const menu = buildMenu()
