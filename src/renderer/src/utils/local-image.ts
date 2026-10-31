/**
 * 本地图片解析：Markdown 里的相对路径 / 绝对路径 / file:// 图片在渲染进程里无法直接加载
 * （页面本身是 file:///…/out/renderer/index.html），统一通过主进程读成 data URL。
 * 编辑区实时预览和公众号预览共用一份缓存。
 */
import * as path from 'path-browserify'

const cache = new Map<string, string>()

/** 是否需要经主进程读取（http(s)、data、blob 地址可直接显示） */
export function isLocalImageSrc(src: string): boolean {
  return !!src && !/^(?:https?:|data:|blob:)/i.test(src)
}

/** 把图片地址解析成磁盘上的绝对路径；baseDir 一般是当前文档所在目录 */
export function resolveLocalImagePath(src: string, baseDir: string): string {
  let p = src
  try {
    p = decodeURI(src.replace(/^file:\/\//, ''))
  }
  catch {}
  // 去掉 Markdown 图片里可能带的 ?query / #hash
  p = p.replace(/[?#].*$/, '')
  return path.isAbsolute(p) ? p : path.join(baseDir, p)
}

export function loadLocalImage(src: string, baseDir: string): string | Promise<string> {
  if (!isLocalImageSrc(src))
    return src
  const abs = resolveLocalImagePath(src, baseDir)
  const hit = cache.get(abs)
  if (hit)
    return hit
  return window.$api.readImageAsBase64(abs).then((url: string) => {
    if (url)
      cache.set(abs, url)
    return url
  })
}

const ORIGINAL_ATTR = 'data-lb-src'

/**
 * 公众号预览里的本地图片：仅为显示替换成 data URL，原地址记在 data-lb-src 上。
 * 复制前调用 restorePreviewImages 还原，保证复制出去的 HTML 与原来完全一致。
 */
export function resolvePreviewImages(root: HTMLElement, baseDir: string) {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || ''
    if (img.hasAttribute(ORIGINAL_ATTR) || !isLocalImageSrc(src))
      continue
    img.setAttribute(ORIGINAL_ATTR, src)
    Promise.resolve(loadLocalImage(src, baseDir)).then((url) => {
      if (url && img.getAttribute(ORIGINAL_ATTR) === src)
        img.setAttribute('src', url)
    }).catch(() => {})
  }
}

export function restorePreviewImages(root: HTMLElement) {
  for (const img of Array.from(root.querySelectorAll(`img[${ORIGINAL_ATTR}]`))) {
    img.setAttribute('src', img.getAttribute(ORIGINAL_ATTR)!)
    img.removeAttribute(ORIGINAL_ATTR)
  }
}
