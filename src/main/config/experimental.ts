/**
 * 实验功能开关
 *
 * MCP 插件、Skill、向量知识库 / 知识图谱、模板系统、AI 生图等模块仍处于原型阶段，
 * 默认不注册它们的 IPC，也不在界面上展示入口。开启后需要重启应用才生效。
 */

import { getStore, setStore } from '../store'

const EXPERIMENTAL_KEY = 'experimental_features_enabled'

export function isExperimentalEnabled(): boolean {
  const value = getStore(EXPERIMENTAL_KEY)
  return value === true || value === 'true'
}

export function setExperimentalEnabled(enabled: boolean): void {
  setStore(EXPERIMENTAL_KEY, enabled)
}
