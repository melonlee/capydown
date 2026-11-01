import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { generateFrontMatter, PublishManager, stripFrontMatter } from '../../src/main/publish/adapters'
import { findUnreachableImages, htmlToPlainText, prepareWeChatContent, WECHAT_COPIED_MESSAGE } from '../../src/main/publish/wechat'

describe('prepareWeChatContent', () => {
  it('removes scripts, iframes and inline event handlers', () => {
    const html = '<section><p onclick="steal()">正文</p><script>alert(1)</script><iframe src="https://x"></iframe><a href="javascript:alert(1)">链接</a></section>'
    const out = prepareWeChatContent(html)
    expect(out.html).not.toMatch(/script|iframe|onclick|javascript:/i)
    expect(out.html).toContain('<p>正文</p>')
  })

  it('keeps inline styles produced by the theme', () => {
    const html = '<h2 style="color: #0F4C81; font-size: 1.2em">标题</h2>'
    expect(prepareWeChatContent(html).html).toBe(html)
  })

  it('warns about images that WeChat cannot fetch', () => {
    const html = [
      '<img src="https://cdn.example.com/a.png">',
      '<img src="file:///Users/me/a.png">',
      '<img alt="x" src="./images/b.png">',
      '<img src=\'data:image/png;base64,AAAA\'>',
    ].join('')
    const out = prepareWeChatContent(html)
    expect(out.unreachableImages).toEqual(['file:///Users/me/a.png', './images/b.png', 'data:image/png;base64,AAAA'])
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('3 张图片')
  })

  it('produces a readable plain-text fallback', () => {
    const text = htmlToPlainText('<h1>标题</h1><p>第一段&nbsp;A &amp; B</p><ul><li>一</li><li>二</li></ul>')
    expect(text).toBe('标题\n第一段 A & B\n一\n二')
  })

  it('rejects empty content', () => {
    expect(() => prepareWeChatContent('   ')).toThrow()
  })

  it('finds no unreachable images in a fully hosted article', () => {
    expect(findUnreachableImages('<p><img src="http://a.com/1.jpg"></p>')).toEqual([])
  })
})

describe('PublishManager', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'capydown-test-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('copies WeChat HTML to the clipboard and says so honestly', async () => {
    const writer = vi.fn()
    const manager = new PublishManager(writer)
    const res = await manager.publish('wechat', '# 标题', { title: '标题' }, { html: '<h1>标题</h1><p>正文</p>' })
    expect(res.success).toBe(true)
    expect(res.message).toBe(WECHAT_COPIED_MESSAGE)
    expect(res).not.toHaveProperty('postId')
    expect(writer).toHaveBeenCalledWith({ html: '<h1>标题</h1><p>正文</p>', text: '标题\n正文' })
  })

  it('fails (instead of pretending) when there is nothing to copy', async () => {
    const writer = vi.fn()
    const res = await new PublishManager(writer).publish('wechat', '', { title: '' }, {})
    expect(res.success).toBe(false)
    expect(writer).not.toHaveBeenCalled()
  })

  it('reports unimplemented platforms as unsupported', async () => {
    const manager = new PublishManager(vi.fn())
    const platforms = manager.getPlatforms()
    expect(platforms.filter(p => p.supported).map(p => p.name)).toEqual(['wechat', 'markdown'])
    for (const p of platforms.filter(p => !p.supported)) {
      const res = await manager.publish(p.name, '正文', { title: 't' })
      expect(res.success).toBe(false)
      expect(res.error).toContain('暂不支持')
    }
  })

  it('exports markdown with a single, escaped front matter block', async () => {
    const file = join(tmp, 'out.md')
    const md = '---\ntitle: old\n---\n\n# 正文标题\n\n内容'
    const res = await new PublishManager(vi.fn()).publish(
      'markdown',
      md,
      { title: '他说"你好"', tags: ['写作', '公众号'], summary: '一句话\n摘要', date: '2026-10-31' },
      { filePath: file },
    )
    expect(res.success).toBe(true)
    const written = readFileSync(file, 'utf-8')
    expect(written.match(/^---$/gm)).toHaveLength(2)
    expect(written).toContain('title: "他说\\"你好\\""')
    expect(written).toContain('description: "一句话\\n摘要"')
    expect(written).toContain('tags: ["写作", "公众号"]')
    expect(written.endsWith('# 正文标题\n\n内容')).toBe(true)
  })
})

describe('front matter helpers', () => {
  it('strips existing front matter only at the start', () => {
    expect(stripFrontMatter('---\na: 1\n---\nbody')).toBe('body')
    expect(stripFrontMatter('body\n---\na: 1\n---\n')).toBe('body\n---\na: 1\n---\n')
  })

  it('omits empty optional fields', () => {
    expect(generateFrontMatter({ title: 'T' })).toBe('---\ntitle: "T"\n---')
  })
})
