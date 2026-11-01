/**
 * 「用 LazyBox 打开」：接收系统交给我们的 Markdown 文件并转交渲染进程。
 *
 * - macOS：Finder「打开方式」/ 双击 / `open -a` → app 'open-file' 事件（可能早于 ready，先排队）
 * - Windows / Linux：首次启动看 process.argv；应用已在运行时，第二个实例把 argv 通过
 *   'second-instance' 交给第一个实例后退出（requestSingleInstanceLock）
 *
 * 渲染进程挂载后调用 app:take-pending-open-files 取走排队的文件；之后到达的文件直接推送。
 * 打开文件只读不写。
 */
import { realpathSync, statSync } from 'fs'
import { app, BrowserWindow, ipcMain } from 'electron'
import { decideOpenTarget, extractMarkdownArgs, isMarkdownPath } from './open-with'

const pending: string[] = []
let rendererReady = false
let createWindow: (() => void) | null = null

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  }
  catch {
    return false
  }
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p)
  }
  catch {
    return p
  }
}

function mainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
}

function focus(win: BrowserWindow): void {
  if (win.isMinimized())
    win.restore()
  win.show()
  win.focus()
}

export function requestOpenFile(file: string): void {
  if (!isMarkdownPath(file) || !isFile(file))
    return
  console.log('[open-with] open', file)
  const win = mainWindow()
  if (win && rendererReady) {
    win.webContents.send('message-to-renderer', { action: 'open-external-file', payload: file })
    focus(win)
    return
  }
  if (!pending.includes(file))
    pending.push(file)
  // macOS 上关掉所有窗口后应用仍在运行：收到文件时重新开窗口
  if (!win && app.isReady())
    createWindow?.()
  else if (win)
    focus(win)
}

/**
 * 尽早调用（模块顶层，ready 之前）。返回 false 表示已有实例在运行，当前进程应退出。
 */
export function setupOpenWith(): boolean {
  // macOS：必须在 will-finish-launching 之前注册，否则冷启动时的文件会丢
  app.on('open-file', (event, file) => {
    event.preventDefault()
    requestOpenFile(file)
  })

  if (!app.requestSingleInstanceLock())
    return false

  app.on('second-instance', (_event, argv, cwd) => {
    const files = extractMarkdownArgs(argv, cwd)
    if (files.length)
      files.forEach(requestOpenFile)
    else {
      const win = mainWindow()
      if (win)
        focus(win)
    }
  })

  // macOS 通过 open-file 传文件；Windows / Linux 在命令行参数里
  for (const file of extractMarkdownArgs(process.argv, process.cwd())) {
    if (isMarkdownPath(file) && isFile(file) && !pending.includes(file))
      pending.push(file)
  }
  return true
}

/** ready 之后调用：注册 IPC，记住创建窗口的方法 */
export function initOpenWithIPC(create: () => void): void {
  createWindow = create

  ipcMain.handle('app:take-pending-open-files', (event) => {
    rendererReady = true
    // 页面重新加载期间到达的文件先排队，等新页面来取
    const wc = event.sender
    wc.once('did-start-loading', () => {
      rendererReady = false
    })
    return pending.splice(0)
  })

  ipcMain.handle('app:resolve-open-target', (_event, { file, workspace }: { file: string, workspace?: string | null }) => {
    if (typeof file !== 'string' || !isMarkdownPath(file) || !isFile(file))
      return null
    const ws = typeof workspace === 'string' && workspace ? workspace : null
    return decideOpenTarget(file, ws, { file: realOrSelf(file), workspace: ws ? realOrSelf(ws) : undefined })
  })
}
