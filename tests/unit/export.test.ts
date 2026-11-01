import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { markdownToDocx, MAX_IMAGE_WIDTH_PX, resolveImagePath } from '../../src/main/export/docx'
import { fitImage, readImageInfo } from '../../src/main/export/image-size'
import { defaultExportPath, sanitizeBaseName } from '../../src/main/export/names'

// 1×1 透明 PNG
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function fakePng(width: number, height: number): Buffer {
  const b = Buffer.from(PNG_1x1)
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

// Paths in these cases are POSIX; Windows resolves them with drive letters and backslashes.
const posixPaths = process.platform !== 'win32'

describe.runIf(posixPaths)('export default names', () => {
  it('uses the document folder and name with the new extension', () => {
    expect(defaultExportPath('/a/b/我的文章.md', 'pdf', '/docs')).toBe('/a/b/我的文章.pdf')
    expect(defaultExportPath('/a/b/notes.markdown', 'docx', '/docs')).toBe('/a/b/notes.docx')
    expect(defaultExportPath('/a/b/v1.2 draft.md', 'pdf', '/docs')).toBe('/a/b/v1.2 draft.pdf')
  })

  it('falls back to the given folder and a sanitized title', () => {
    expect(defaultExportPath(undefined, 'pdf', '/docs', '标题: A/B?')).toBe('/docs/标题 A B.pdf')
    expect(defaultExportPath('', 'docx', '/docs')).toBe('/docs/未命名.docx')
    expect(sanitizeBaseName('  ')).toBe('未命名')
  })
})

describe.runIf(posixPaths)('image helpers', () => {
  it('reads PNG / GIF / JPEG dimensions', () => {
    expect(readImageInfo(fakePng(640, 480))).toEqual({ type: 'png', width: 640, height: 480 })
    const gif = Buffer.alloc(32)
    gif.write('GIF89a', 0, 'ascii')
    gif.writeUInt16LE(120, 6)
    gif.writeUInt16LE(80, 8)
    expect(readImageInfo(gif)).toEqual({ type: 'gif', width: 120, height: 80 })
    // 最小 JPEG：SOI + APP0 + SOF0
    const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x2C, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(readImageInfo(jpg)).toEqual({ type: 'jpg', width: 800, height: 300 })
    expect(readImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
  })

  it('scales images down to the page width, never up', () => {
    expect(fitImage(2000, 1000, 600, 900)).toEqual({ width: 600, height: 300 })
    expect(fitImage(300, 200, 600, 900)).toEqual({ width: 300, height: 200 })
    expect(fitImage(500, 3000, 600, 900)).toEqual({ width: 150, height: 900 })
  })

  it('resolves relative image paths against the document folder', () => {
    expect(resolveImagePath('assets/a%20b.png?x=1', '/w/docs')).toBe('/w/docs/assets/a b.png')
    expect(resolveImagePath('/abs/c.png', '/w')).toBe('/abs/c.png')
    expect(resolveImagePath('https://x/y.png', '/w')).toBeNull()
  })
})

describe.runIf(posixPaths)('markdown → docx', () => {
  const md = [
    '---',
    'title: front matter is dropped',
    '---',
    '# 一级标题',
    '',
    '正文 **加粗** *斜体* ~~删除~~ `code` [链接](https://example.com)。',
    '',
    '> 引用的一段话',
    '',
    '1. 第一',
    '2. 第二',
    '   - 嵌套无序',
    '',
    '- [x] 已完成',
    '- [ ] 未完成',
    '',
    '```ts',
    'const a = 1',
    '  indented()',
    '```',
    '',
    '| 列一 | 列二 |',
    '| :-- | --: |',
    '| 甲 | 乙 |',
    '',
    '---',
    '',
    '![本地图](assets/pic.png)',
    '',
    '![网络图](https://img.example.com/remote.png)',
    '',
    '![坏图](assets/missing.png)',
  ].join('\n')

  it('maps headings, inline styles, lists, code, tables and images', async () => {
    const read: string[] = []
    const fetched: string[] = []
    const buf = await markdownToDocx(md, {
      baseDir: '/docs',
      readLocal: async (p) => {
        read.push(p)
        if (p.endsWith('missing.png'))
          throw new Error('ENOENT')
        return fakePng(2000, 1000)
      },
      fetchRemote: async (url) => {
        fetched.push(url)
        return fakePng(100, 50)
      },
    })
    expect(buf.subarray(0, 2).toString()).toBe('PK')
    expect(read).toEqual(['/docs/assets/pic.png', '/docs/assets/missing.png'])
    expect(fetched).toEqual(['https://img.example.com/remote.png'])

    const xml = await documentXml(buf)
    expect(xml).not.toContain('front matter')
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>')
    expect(xml).toMatch(/<w:b\/>[\s\S]*?加粗/)
    expect(xml).toMatch(/<w:i\/>[\s\S]*?斜体/)
    expect(xml).toMatch(/<w:strike\/>[\s\S]*?删除/)
    expect(xml).toContain('w:ascii="Consolas"')
    expect(xml).toContain('<w:hyperlink')
    expect(xml).toContain('<w:numPr>') // 有序 / 无序列表
    expect(xml).toContain('☑ ')
    expect(xml).toContain('☐ ')
    expect(xml).toContain('  indented()')
    expect(xml).toContain('<w:tblHeader/>')
    expect(xml).toContain('列二')
    // 两张图嵌入，一张失败的以占位文字代替
    expect((xml.match(/<pic:pic /g) || []).length).toBe(2)
    expect(xml).toContain('[图片：坏图]')
    // 大图缩放到版心宽度（EMU = px × 9525）
    expect(xml).toContain(`cx="${MAX_IMAGE_WIDTH_PX * 9525}"`)
  })

  it('uses an East Asian font for Chinese text', async () => {
    const zip = await JSZip.loadAsync(await markdownToDocx('中文'))
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('w:eastAsia="宋体"')
    expect(styles).toContain('w:eastAsia="黑体"')
  })
})
