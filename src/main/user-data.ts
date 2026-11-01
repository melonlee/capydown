/**
 * 用户数据目录（userData）。
 *
 * 应用从 LazyBox 改名为 Slothdown 后，Electron 按应用名推导的 userData 目录也变了
 * （macOS ~/Library/Application Support/Slothdown，Windows %APPDATA%\Slothdown，Linux ~/.config/Slothdown）。
 * 旧目录里有 electron-store 的 config.json（AI 服务商与密钥等）、Local Storage（工作区列表、主题…）。
 * 第一次以新名字启动时，如果新目录还没有数据而旧目录（LazyBox / lazybox）有，就把旧目录**复制**过来：
 *   - 只复制、不删除旧目录：出问题可以回退，旧版 LazyBox 仍可照常使用；
 *   - 先复制到临时目录再改名，复制到一半中断不会留下半份数据；
 *   - 跳过缓存与单实例锁（Singleton*、Cache、GPUCache…），否则新应用会以为已有实例在运行。
 * 不直接沿用旧目录（setPath 指回旧目录）：新旧两个应用同时运行时会共用单实例锁和 LevelDB，互相抢锁。
 *
 * 这一步必须在任何代码读取 userData 之前执行（electron-store 在 import 时就会读），所以 index.ts 第一个导入本模块。
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** 改名前的应用名：打包版用 productName「LazyBox」，开发版用 package.json 的 name「lazybox」 */
const LEGACY_NAMES = ['LazyBox', 'lazybox']
const MARKER = 'migrated-from-lazybox.json'
/** 不复制的顶层条目：缓存（可重建）、崩溃报告、单实例锁与调试端口（属于正在运行的那个进程） */
const SKIP = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache',
  'Crashpad', 'Crash Reports', 'DevToolsActivePort', 'SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile',
])

function dataMtime(dir: string): number {
  let newest = 0
  for (const name of ['config.json', 'Local Storage']) {
    try {
      newest = Math.max(newest, fs.statSync(path.join(dir, name)).mtimeMs)
    } catch {
      // 不存在：不算数据
    }
  }
  return newest
}

/** 目录里是否已有用户数据（偏好或 Local Storage） */
const hasUserData = (dir: string): boolean => dataMtime(dir) > 0

export type MigrationResult =
  | { status: 'migrated', from: string, to: string }
  | { status: 'skipped', reason: string }
  | { status: 'failed', error: string }

export function migrateLegacyUserData(): MigrationResult {
  const target = app.getPath('userData')
  if (app.commandLine.hasSwitch('user-data-dir'))
    return { status: 'skipped', reason: 'custom --user-data-dir' }
  if (hasUserData(target))
    return { status: 'skipped', reason: 'target has data' }

  const appData = app.getPath('appData')
  const sources = [...new Set(LEGACY_NAMES.map(n => path.join(appData, n)))]
    .filter(dir => path.resolve(dir).toLowerCase() !== path.resolve(target).toLowerCase() && hasUserData(dir))
    // 大小写敏感的文件系统上 LazyBox / lazybox 可能同时存在：取最近用过的那个
    .sort((a, b) => dataMtime(b) - dataMtime(a))
  const source = sources[0]
  if (!source)
    return { status: 'skipped', reason: 'no legacy data' }

  const tmp = `${target}.migrating-${process.pid}`
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.cpSync(source, tmp, {
      recursive: true,
      verbatimSymlinks: true,
      filter: src => !(path.dirname(src) === source && SKIP.has(path.basename(src))),
    })
    fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({ from: source, at: new Date().toISOString() }, null, 2))
    if (!fs.existsSync(target)) {
      fs.renameSync(tmp, target)
    } else {
      // 新目录已存在但没有数据（例如 Chromium 先建了空目录）：逐项移入，不覆盖已有条目
      for (const name of fs.readdirSync(tmp)) {
        const dest = path.join(target, name)
        if (!fs.existsSync(dest))
          fs.renameSync(path.join(tmp, name), dest)
      }
      fs.rmSync(tmp, { recursive: true, force: true })
    }
    console.log(`[user-data] migrated ${source} -> ${target}`)
    return { status: 'migrated', from: source, to: target }
  } catch (e) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      // 临时目录删不掉也不影响启动
    }
    console.error('[user-data] migration failed, starting with a fresh profile:', e)
    return { status: 'failed', error: String(e) }
  }
}

// 端到端测试使用独立的用户数据目录，不碰真实的偏好与工作区记录
if (process.env.SLOTHDOWN_E2E === '1' && process.env.SLOTHDOWN_USER_DATA)
  app.setPath('userData', process.env.SLOTHDOWN_USER_DATA)
else
  migrateLegacyUserData()
