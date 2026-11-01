/**
 * 用户数据目录（userData）：第一次以 Capydown 启动时，从最近的旧名字（Slothdown，其次 LazyBox）复制偏好与工作区记录。
 * 规则和实现见 user-data-migration.ts（只复制、不删除旧目录；跳过缓存与单实例锁；写 migrated-from-*.json）。
 *
 * 这一步必须在任何代码读取 userData 之前执行（electron-store 在 import 时就会读），所以 index.ts 第一个导入本模块。
 */
import { app } from 'electron'
import { migrateUserData, type MigrationResult } from './user-data-migration'

export function migrateLegacyUserData(): MigrationResult {
  return migrateUserData({
    appData: app.getPath('appData'),
    target: app.getPath('userData'),
    customUserDataDir: app.commandLine.hasSwitch('user-data-dir'),
  })
}

// 端到端测试使用独立的用户数据目录，不碰真实的偏好与工作区记录
if (process.env.CAPYDOWN_E2E === '1' && process.env.CAPYDOWN_USER_DATA)
  app.setPath('userData', process.env.CAPYDOWN_USER_DATA)
else
  migrateLegacyUserData()
