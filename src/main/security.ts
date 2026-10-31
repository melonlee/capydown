/**
 * 安全相关的纯函数（无 Electron 依赖，便于单元测试）
 */

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * 是否允许交给系统 shell.openExternal 打开。
 * 只放行 http / https / mailto，拒绝 file:、javascript:、smb: 及各种自定义 scheme。
 */
export function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) return false
  try {
    const url = new URL(raw)
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)
  }
  catch {
    return false
  }
}
