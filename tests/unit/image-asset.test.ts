import { describe, expect, it } from 'vitest'
import { assetFileName, markdownImagePath, uniqueAssetName } from '../../src/shared/image-asset'

const now = new Date(2026, 10, 1, 9, 5, 7)

describe('image assets (paste / drop → ./assets)', () => {
  it('names clipboard screenshots by timestamp', () => {
    expect(assetFileName('image.png', 'image/png', now)).toBe('image-20261101-090507.png')
    expect(assetFileName('', 'image/jpeg', now)).toBe('image-20261101-090507.jpg')
    expect(assetFileName('blob', 'image/gif', now)).toBe('blob.gif')
  })

  it('keeps original names but strips unsafe characters', () => {
    expect(assetFileName('封面 备选.JPG', 'image/jpeg', now)).toBe('封面-备选.jpg')
    expect(assetFileName('../../etc/passwd.png', 'image/png', now)).toBe('passwd.png')
    expect(assetFileName('C:\\Users\\me\\a(1).png', 'image/png', now)).toBe('a1.png')
    expect(assetFileName('.hidden.png', 'image/png', now)).toBe('hidden.png')
    expect(assetFileName('a<b>|c?.webp', 'image/webp', now)).toBe('abc.webp')
    expect(assetFileName('x.weird-ext!', 'image/png', now)).toBe('x.png')
  })

  it('never overwrites an existing file', () => {
    const taken = new Set(['a.png', 'a-1.png'])
    expect(uniqueAssetName('a.png', n => taken.has(n))).toBe('a-2.png')
    expect(uniqueAssetName('b.png', n => taken.has(n))).toBe('b.png')
  })

  it('builds the relative markdown path', () => {
    expect(markdownImagePath('assets', 'a.png')).toBe('assets/a.png')
  })
})
