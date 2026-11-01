// Run with ELECTRON_RUN_AS_NODE=1 so the bundles load under Electron's own Node version.
// Loads the packaged main/preload bundles from an extracted app.asar with a stubbed `electron`,
// so missing or mis-nested dependencies fail CI without needing a GUI session.
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? '')
const tmp = os.tmpdir()

// Callable, chainable stand-in for any Electron API; never thenable so top-level awaits don't hang.
function stub(name = 'electron') {
  const fn = function () {}
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === 'then') return undefined
      if (prop === Symbol.toPrimitive) return () => name
      if (prop === 'getPath' || prop === 'getAppPath') return () => tmp
      if (prop === 'whenReady') return () => new Promise(() => {})
      if (prop === 'getVersion') return () => '0.0.0'
      if (prop === 'getName') return () => 'smoke'
      if (prop === 'isPackaged') return true
      if (prop === 'platform') return process.platform
      return stub(`${name}.${String(prop)}`)
    },
    apply: () => stub(`${name}()`),
    construct: () => stub(`new ${name}`),
  })
}

// Mirror Electron: renderer-only APIs are undefined in the main process and vice versa.
const MAIN_ONLY = new Set(['app', 'ipcMain', 'BrowserWindow', 'Menu', 'dialog', 'shell', 'nativeTheme', 'protocol', 'session'])
const RENDERER_ONLY = new Set(['ipcRenderer', 'contextBridge', 'webFrame'])
function electronFor(type) {
  const base = stub()
  return new Proxy({}, {
    get(_t, prop) {
      if (type === 'browser' && RENDERER_ONLY.has(prop)) return undefined
      if (type === 'renderer' && MAIN_ONLY.has(prop)) return undefined
      return base[prop]
    },
  })
}

const load = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronFor(process.type)
  return load.call(this, request, ...rest)
}

const requireFromApp = Module.createRequire(path.join(root, 'package.json'))
// electron-store and friends branch on process.type, which Electron sets per process.
for (const [entry, type] of [['out/main/index.cjs', 'browser'], ['out/preload/index.cjs', 'renderer']]) {
  process.type = type
  if (type === 'renderer') globalThis.window = globalThis
  requireFromApp(path.join(root, entry))
  console.log(`ok: ${entry}`)
}
process.exit(0)
