import { app, shell, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { buildMenu, updateMenuState } from './menu'
import { initDocumentDir, defaultDocumentPath, defaultDocumentName } from './local'
import { initIpcMain } from './ipc'
import { initAIIpcHandlers } from './ipc-ai'
import { initPublishIPCHandlers } from './ipc-publish'
import { initImageIPCHandlers } from './ipc-image'
import { initTemplateIPCHandlers } from './ipc-template'
import { initVectorIPCHandlers } from './ipc-vector'
import { initMCPSkillIPCHandlers } from './ipc-mcp-skill'
import { isExperimentalEnabled, setExperimentalEnabled } from './config/experimental'
import { isSafeExternalUrl } from './security'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    center: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // 预加载脚本只依赖 contextBridge / ipcRenderer，可以在沙箱中运行
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    Menu.setApplicationMenu(buildMenu())
  })

  // 只允许用系统浏览器打开 http(s)/mailto 链接，其余协议（file:、smb:、自定义 scheme 等）一律拒绝
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // 预览区里的普通链接不应把整个应用导航走
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL()
    if (url === current || (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))) {
      return
    }
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url)
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.lazybox')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 通过 IPC 提供默认文档信息（取代以前把路径拼进 executeJavaScript 字符串的做法）
  ipcMain.handle('app:get-default-document', () => ({
    name: defaultDocumentName,
    path: defaultDocumentPath,
  }))

  // 菜单勾选状态（源代码模式、专注模式、主题…）由渲染进程推送
  ipcMain.on('menu:update-state', (_, state) => {
    if (state && typeof state === 'object')
      updateMenuState(state)
  })

  // 实验功能开关（MCP / Skill / 知识库 / 模板 / AI 生图等未完成模块）
  ipcMain.handle('app:get-experimental', () => isExperimentalEnabled())
  ipcMain.handle('app:set-experimental', (_, enabled: boolean) => {
    setExperimentalEnabled(!!enabled)
    return { success: true, requiresRestart: true }
  })

  // IPC handlers
  initIpcMain()
  initAIIpcHandlers()
  initPublishIPCHandlers()

  // 未完成的实验模块：默认不注册，只有在设置中开启「实验功能」并重启后才可用
  if (isExperimentalEnabled()) {
    initImageIPCHandlers()
    initTemplateIPCHandlers()
    initVectorIPCHandlers()
    initMCPSkillIPCHandlers()
  }

  initDocumentDir()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
