/**
 * 用户数据目录（userData）迁移的纯逻辑（不依赖 electron，便于单元测试；入口见 user-data.ts）。
 *
 * 应用改过两次名：LazyBox → Slothdown（v0.3）→ Capydown（v0.4）。Electron 按应用名推导 userData 目录
 * （macOS ~/Library/Application Support/<名字>，Windows %APPDATA%\<名字>，Linux ~/.config/<名字>），
 * 每次改名新版本都会看到一个空目录。旧目录里有 electron-store 的 config.json（AI 服务商与密钥等）、
 * Local Storage（工作区列表、主题…）。第一次以新名字启动时，如果新目录还没有数据，就从**最近的**旧名字复制一份：
 *   - 先找 Slothdown（上一个名字，数据最新），没有再找 LazyBox / lazybox；
 *   - 同一个名字的大小写变体（打包版 productName / 开发版 package.json name）在大小写敏感的文件系统上可能同时存在：取最近用过的；
 *   - 只复制、不删除旧目录：出问题可以回退，旧版本仍可照常使用；
 *   - 先复制到临时目录再改名，复制到一半中断不会留下半份数据；
 *   - 跳过缓存与单实例锁（Singleton*、Cache、GPUCache…），否则新应用会以为已有实例在运行；
 *   - 在新目录写一个 migrated-from-<旧名>.json 记录来源和时间。
 * 不直接沿用旧目录（setPath 指回旧目录）：新旧两个应用同时运行时会共用单实例锁和 LevelDB，互相抢锁。
 */
import * as fs from 'fs'
import * as path from 'path'

/** 以前用过的应用名，按新到旧排列；每组是同一个名字的大小写变体 */
export const LEGACY_PROFILES: readonly (readonly string[])[] = [
  ['Slothdown', 'slothdown'],
  ['LazyBox', 'lazybox'],
]

/** 不复制的顶层条目：缓存（可重建）、崩溃报告、单实例锁与调试端口（属于正在运行的那个进程） */
export const SKIP = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache',
  'Crashpad', 'Crash Reports', 'DevToolsActivePort', 'SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile',
])

/** 用户数据最后一次修改的时间（偏好或 Local Storage）；0 = 没有数据 */
export function dataMtime(dir: string): number {
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

/** 目录里是否已有用户数据 */
export const hasUserData = (dir: string): boolean => dataMtime(dir) > 0

const samePath = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

/**
 * 选迁移来源：按 LEGACY_PROFILES 的顺序（最近的旧名字优先），返回第一个有数据的旧目录；
 * 同组里有多个（大小写变体）取数据最新的那个。和目标目录是同一个目录的不算（大小写不敏感比较）。
 */
export function pickLegacySource(appData: string, target: string, profiles = LEGACY_PROFILES): string | undefined {
  for (const names of profiles) {
    const found = [...new Set(names.map(n => path.join(appData, n)))]
      .filter(dir => !samePath(dir, target) && hasUserData(dir))
      .sort((a, b) => dataMtime(b) - dataMtime(a))
    if (found[0])
      return found[0]
  }
  return undefined
}

export type MigrationResult =
  | { status: 'migrated', from: string, to: string, marker: string }
  | { status: 'skipped', reason: string }
  | { status: 'failed', error: string }

export interface MigrateOptions {
  appData: string
  target: string
  /** 启动时带了 --user-data-dir：用户明确指定了目录，不迁移 */
  customUserDataDir?: boolean
  profiles?: readonly (readonly string[])[]
  log?: Pick<Console, 'log' | 'error'>
}

export function migrateUserData({ appData, target, customUserDataDir, profiles, log = console }: MigrateOptions): MigrationResult {
  if (customUserDataDir)
    return { status: 'skipped', reason: 'custom --user-data-dir' }
  if (hasUserData(target))
    return { status: 'skipped', reason: 'target has data' }
  const source = pickLegacySource(appData, target, profiles)
  if (!source)
    return { status: 'skipped', reason: 'no legacy data' }

  const marker = `migrated-from-${path.basename(source).toLowerCase()}.json`
  const tmp = `${target}.migrating-${process.pid}`
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.cpSync(source, tmp, {
      recursive: true,
      verbatimSymlinks: true,
      filter: src => !(path.dirname(src) === source && SKIP.has(path.basename(src))),
    })
    fs.writeFileSync(path.join(tmp, marker), JSON.stringify({ from: source, at: new Date().toISOString() }, null, 2))
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
    log.log(`[user-data] migrated ${source} -> ${target}`)
    return { status: 'migrated', from: source, to: target, marker }
  } catch (e) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      // 临时目录删不掉也不影响启动
    }
    log.error('[user-data] migration failed, starting with a fresh profile:', e)
    return { status: 'failed', error: String(e) }
  }
}

/**
 * 默认工作区（存放文章的文件夹）：旧名字的默认工作区已经存在就继续用（文章都在里面，不搬家），
 * 依次是 ~/Documents/Slothdown（v0.3）、~/Documents/codes/LazyBox（v0.2 及以前）；都没有才用 ~/Documents/Capydown。
 */
export function pickDefaultAppDir(documents: string, exists: (p: string) => boolean): string {
  const legacy = [path.join(documents, 'Slothdown'), path.join(documents, 'codes', 'LazyBox')]
  return legacy.find(dir => exists(dir)) ?? path.join(documents, 'Capydown')
}
