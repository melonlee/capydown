/**
 * 粘贴 / 拖入图片保存到文档旁的 assets 文件夹（Typora「复制图片到 ./assets」的做法）。
 * 这里只放纯函数（文件名生成），读写磁盘在主进程 ipc.ts。
 */

export const ASSET_DIR = 'assets'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 生成安全的文件名：
 * - 截图 / 剪贴板图片（浏览器给的名字是 image.png）→ image-20261101-153012.png
 * - 普通文件保留原名，空白换成 -，去掉路径分隔符、控制字符和 Markdown / URL 里有歧义的字符
 */
export function assetFileName(original: string, mime: string, now: Date = new Date()): string {
  const base = (original || '').split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  let stem = dot > 0 ? base.slice(0, dot) : base
  let ext = (dot > 0 ? base.slice(dot + 1) : '').toLowerCase()
  if (!/^[a-z0-9]{1,5}$/.test(ext))
    ext = MIME_EXT[mime] || 'png'
  stem = stem
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F<>:"|?*%#()[\]]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 80)
  if (!stem || /^image$/i.test(stem)) {
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    stem = `image-${stamp}`
  }
  return `${stem}.${ext}`
}

/** 文件已存在时依次尝试 name-1.ext、name-2.ext … */
export function uniqueAssetName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name))
    return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i < 10000; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!exists(candidate))
      return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

/** 写进 Markdown 的相对路径（文件名已去掉空白和括号，无需再编码） */
export function markdownImagePath(dir: string, name: string): string {
  return `${dir}/${name}`
}
