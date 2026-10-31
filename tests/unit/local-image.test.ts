import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isLocalImageSrc,
  loadLocalImage,
  resolveLocalImagePath,
  resolvePreviewImages,
  restorePreviewImages,
} from '../../src/renderer/src/utils/local-image'

/** 最小的 <img> 替身：只实现 local-image.ts 用到的属性方法 */
function fakeImg(src: string) {
  const attrs = new Map<string, string>([['src', src]])
  return {
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    hasAttribute: (k: string) => attrs.has(k),
    removeAttribute: (k: string) => void attrs.delete(k),
    attrs,
  }
}

function fakeRoot(imgs: ReturnType<typeof fakeImg>[]) {
  return {
    querySelectorAll: (sel: string) => sel === 'img' ? imgs : imgs.filter(i => i.hasAttribute('data-lb-src')),
  } as unknown as HTMLElement
}

const flush = () => new Promise(r => setTimeout(r, 0))

afterEach(() => {
  delete (globalThis as any).window
})

describe('local images', () => {
  it('only treats non-web sources as local', () => {
    expect(isLocalImageSrc('https://a.com/x.png')).toBe(false)
    expect(isLocalImageSrc('HTTP://a.com/x.png')).toBe(false)
    expect(isLocalImageSrc('data:image/png;base64,AAA')).toBe(false)
    expect(isLocalImageSrc('blob:xyz')).toBe(false)
    expect(isLocalImageSrc('')).toBe(false)
    expect(isLocalImageSrc('./a.png')).toBe(true)
    expect(isLocalImageSrc('images/a.png')).toBe(true)
    expect(isLocalImageSrc('/Users/me/a.png')).toBe(true)
    expect(isLocalImageSrc('file:///Users/me/a.png')).toBe(true)
  })

  it('resolves relative, absolute, encoded and file:// paths against the document folder', () => {
    const base = '/tmp/ws/公众号'
    expect(resolveLocalImagePath('images/desk.jpg', base)).toBe('/tmp/ws/公众号/images/desk.jpg')
    expect(resolveLocalImagePath('./封面.jpg', base)).toBe('/tmp/ws/公众号/封面.jpg')
    expect(resolveLocalImagePath('../草稿/a.png', base)).toBe('/tmp/ws/草稿/a.png')
    expect(resolveLocalImagePath('/abs/a.png', base)).toBe('/abs/a.png')
    expect(resolveLocalImagePath('file:///abs/a%20b.png', base)).toBe('/abs/a b.png')
    expect(resolveLocalImagePath('%E5%B0%81%E9%9D%A2.jpg', base)).toBe('/tmp/ws/公众号/封面.jpg')
    expect(resolveLocalImagePath('a.png?v=2#x', base)).toBe('/tmp/ws/公众号/a.png')
  })

  it('reads local images through the main process once and caches them', async () => {
    const read = vi.fn(async (p: string) => `data:image/png;base64,${p.length}`)
    ;(globalThis as any).window = { $api: { readImageAsBase64: read } }
    expect(loadLocalImage('https://x/y.png', '/d')).toBe('https://x/y.png')
    const first = await loadLocalImage('cache-test.png', '/d')
    const second = loadLocalImage('cache-test.png', '/d')
    expect(second).toBe(first) // 第二次直接同步返回缓存
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('/d/cache-test.png')
  })

  it('swaps preview images for display and restores the exact original src before copying', async () => {
    ;(globalThis as any).window = { $api: { readImageAsBase64: async () => 'data:image/jpeg;base64,QQ==' } }
    const local = fakeImg('images/preview-swap.jpg')
    const remote = fakeImg('https://cdn/x.png')
    const root = fakeRoot([local, remote])

    resolvePreviewImages(root, '/ws/doc')
    await flush()
    expect(local.getAttribute('src')).toBe('data:image/jpeg;base64,QQ==')
    expect(local.getAttribute('data-lb-src')).toBe('images/preview-swap.jpg')
    expect(remote.getAttribute('src')).toBe('https://cdn/x.png')
    expect(remote.hasAttribute('data-lb-src')).toBe(false)

    // 再次解析不会重复处理
    resolvePreviewImages(root, '/ws/doc')
    expect(local.getAttribute('data-lb-src')).toBe('images/preview-swap.jpg')

    restorePreviewImages(root)
    expect(local.getAttribute('src')).toBe('images/preview-swap.jpg')
    expect(local.hasAttribute('data-lb-src')).toBe(false)
  })
})
