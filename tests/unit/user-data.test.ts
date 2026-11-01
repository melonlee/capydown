import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateUserData, pickDefaultAppDir, pickLegacySource } from '../../src/main/user-data-migration'

const quiet = { log: () => {}, error: () => {} }
let appData: string

/** 造一个带数据的旧 profile；mtime 用秒数控制「谁更近」 */
function profile(name: string, { config = `{"from":"${name}"}`, mtime = 1_700_000_000, extra = [] as string[] } = {}) {
  const dir = join(appData, name)
  mkdirSync(join(dir, 'Local Storage', 'leveldb'), { recursive: true })
  writeFileSync(join(dir, 'config.json'), config)
  writeFileSync(join(dir, 'Local Storage', 'leveldb', '000003.log'), `ls-${name}`)
  for (const e of extra) {
    mkdirSync(join(dir, e), { recursive: true })
    writeFileSync(join(dir, e, 'x'), 'x')
  }
  utimesSync(join(dir, 'config.json'), mtime, mtime)
  utimesSync(join(dir, 'Local Storage'), mtime, mtime)
  return dir
}

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), 'capydown-userdata-'))
})
afterEach(() => {
  rmSync(appData, { recursive: true, force: true })
})

describe('pickLegacySource', () => {
  it('prefers Slothdown (the most recent previous name) over LazyBox, even if LazyBox was touched later', () => {
    profile('LazyBox', { mtime: 1_800_000_000 })
    const sloth = profile('Slothdown', { mtime: 1_700_000_000 })
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBe(sloth)
  })

  it('falls back to LazyBox when there is no Slothdown profile', () => {
    const lazy = profile('LazyBox')
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBe(lazy)
  })

  it('ignores an empty Slothdown dir (no config.json / Local Storage)', () => {
    mkdirSync(join(appData, 'Slothdown', 'GPUCache'), { recursive: true })
    const lazy = profile('LazyBox')
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBe(lazy)
  })

  it('picks the newest case variant within one name (LazyBox vs lazybox)', () => {
    // case-insensitive file systems (macOS / Windows default) cannot hold both variants
    writeFileSync(join(appData, 'probe'), '')
    const caseSensitive = !existsSync(join(appData, 'PROBE'))
    rmSync(join(appData, 'probe'))
    if (!caseSensitive) {
      const lazy = profile('lazybox')
      expect(pickLegacySource(appData, join(appData, 'Capydown'))?.toLowerCase()).toBe(lazy.toLowerCase())
      return
    }
    profile('LazyBox', { mtime: 1_700_000_000 })
    const dev = profile('lazybox', { mtime: 1_800_000_000 })
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBe(dev)
  })

  it('never picks the target itself and returns undefined without legacy data', () => {
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBeUndefined()
    profile('Capydown')
    expect(pickLegacySource(appData, join(appData, 'Capydown'))).toBeUndefined()
  })
})

describe('migrateUserData', () => {
  it('copies Slothdown into a missing Capydown dir, skips caches and locks, writes a marker, keeps the source', () => {
    const src = profile('Slothdown', { extra: ['GPUCache', 'Code Cache', 'IndexedDB'] })
    writeFileSync(join(src, 'SingletonLock'), 'lock')
    writeFileSync(join(src, 'migrated-from-lazybox.json'), '{}') // 上一次迁移留下的记录也一起带过来
    const before = readdirSync(src).sort()
    const target = join(appData, 'Capydown')

    const r = migrateUserData({ appData, target, log: quiet })
    expect(r).toMatchObject({ status: 'migrated', from: src, to: target, marker: 'migrated-from-slothdown.json' })
    expect(readFileSync(join(target, 'config.json'), 'utf8')).toBe('{"from":"Slothdown"}')
    expect(readFileSync(join(target, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('ls-Slothdown')
    expect(existsSync(join(target, 'IndexedDB', 'x'))).toBe(true)
    for (const skipped of ['GPUCache', 'Code Cache', 'SingletonLock'])
      expect(existsSync(join(target, skipped))).toBe(false)
    expect(JSON.parse(readFileSync(join(target, 'migrated-from-slothdown.json'), 'utf8')).from).toBe(src)
    expect(existsSync(join(target, 'migrated-from-lazybox.json'))).toBe(true)
    // 旧目录原封不动
    expect(readdirSync(src).sort()).toEqual(before)
    // 没有残留的临时目录
    expect(readdirSync(appData).filter(n => n.includes('.migrating-'))).toEqual([])
  })

  it('migrates from LazyBox when only LazyBox exists', () => {
    const src = profile('LazyBox')
    const target = join(appData, 'Capydown')
    expect(migrateUserData({ appData, target, log: quiet })).toMatchObject({ status: 'migrated', from: src, marker: 'migrated-from-lazybox.json' })
    expect(readFileSync(join(target, 'config.json'), 'utf8')).toBe('{"from":"LazyBox"}')
  })

  it('fills an existing but empty Capydown dir without overwriting what is there', () => {
    profile('Slothdown')
    const target = join(appData, 'Capydown')
    mkdirSync(join(target, 'GPUCache'), { recursive: true })
    writeFileSync(join(target, 'GPUCache', 'keep'), 'mine')
    expect(migrateUserData({ appData, target, log: quiet }).status).toBe('migrated')
    expect(readFileSync(join(target, 'config.json'), 'utf8')).toBe('{"from":"Slothdown"}')
    expect(readFileSync(join(target, 'GPUCache', 'keep'), 'utf8')).toBe('mine')
  })

  it('does nothing when Capydown already has data, with --user-data-dir, or on a clean install', () => {
    profile('Slothdown')
    const target = profile('Capydown', { config: '{"mine":true}' })
    expect(migrateUserData({ appData, target, log: quiet })).toEqual({ status: 'skipped', reason: 'target has data' })
    expect(readFileSync(join(target, 'config.json'), 'utf8')).toBe('{"mine":true}')

    const other = join(appData, 'Other')
    expect(migrateUserData({ appData, target: other, customUserDataDir: true, log: quiet }).status).toBe('skipped')
    expect(existsSync(other)).toBe(false)

    const clean = mkdtempSync(join(tmpdir(), 'capydown-clean-'))
    try {
      expect(migrateUserData({ appData: clean, target: join(clean, 'Capydown'), log: quiet })).toEqual({ status: 'skipped', reason: 'no legacy data' })
      expect(existsSync(join(clean, 'Capydown'))).toBe(false)
    } finally {
      rmSync(clean, { recursive: true, force: true })
    }
  })
})

describe('pickDefaultAppDir', () => {
  const docs = '/Users/me/Documents'
  const has = (...dirs: string[]) => (p: string) => dirs.includes(p)
  it('keeps an existing Slothdown or LazyBox workspace, otherwise uses ~/Documents/Capydown', () => {
    expect(pickDefaultAppDir(docs, has(join(docs, 'Slothdown'), join(docs, 'codes', 'LazyBox')))).toBe(join(docs, 'Slothdown'))
    expect(pickDefaultAppDir(docs, has(join(docs, 'codes', 'LazyBox')))).toBe(join(docs, 'codes', 'LazyBox'))
    expect(pickDefaultAppDir(docs, has())).toBe(join(docs, 'Capydown'))
  })
})
