import { describe, expect, it } from 'vitest'
import {
  articleForPrompt,
  clampSummary,
  parseTitleSummary,
  WECHAT_SUMMARY_MAX,
  WECHAT_TITLE_MAX,
  wechatLength,
} from '../../src/shared/ai/publish-meta'

describe('wechatLength', () => {
  it('counts characters, not UTF-16 units', () => {
    expect(wechatLength('懒得排')).toBe(3)
    expect(wechatLength('AI 写作')).toBe(5)
    expect(wechatLength('😀好')).toBe(2)
  })
})

describe('parseTitleSummary', () => {
  it('keeps 3-5 titles, drops ones over 64 chars and duplicates, cleans quotes and numbering', () => {
    const long = '长'.repeat(WECHAT_TITLE_MAX + 1)
    const reply = JSON.stringify({
      titles: [
        { title: '「为什么排版总是很累」', angle: '提问' },
        { title: '1. 三个习惯', angle: '数字' },
        { title: long, angle: '超长' },
        { title: '为什么排版总是很累', angle: '重复' },
        { title: '《三体》读后感', angle: '书名' },
        { title: '标题：从 Markdown 到公众号', angle: '' },
        { title: '第六个', angle: '' },
        { title: '第七个', angle: '' },
      ],
      summary: '一段摘要',
    })
    const out = parseTitleSummary(reply)
    expect(out.titles.map(t => t.title)).toEqual(['为什么排版总是很累', '三个习惯', '《三体》读后感', '从 Markdown 到公众号', '第六个'])
    expect(out.titles[0].angle).toBe('提问')
    expect(out.titles.every(t => wechatLength(t.title) <= WECHAT_TITLE_MAX)).toBe(true)
    expect(out.summary).toBe('一段摘要')
  })

  it('accepts string arrays and Chinese keys', () => {
    const out = parseTitleSummary('```json\n{"标题":["甲","乙","丙"],"摘要":"“摘要内容”"}\n```')
    expect(out.titles.map(t => t.title)).toEqual(['甲', '乙', '丙'])
    expect(out.summary).toBe('摘要内容')
  })

  it('throws when no usable title comes back', () => {
    expect(() => parseTitleSummary('{"titles":[],"summary":"x"}')).toThrow(/标题/)
    expect(() => parseTitleSummary('不是 JSON')).toThrow()
  })
})

describe('clampSummary', () => {
  it('cuts at the last sentence end within 120 chars', () => {
    const s = `${'这是第一句话，讲清楚文章讲什么。'.repeat(6)}最后一句没有句号${'而且很长'.repeat(10)}`
    const out = clampSummary(s)
    expect(wechatLength(out)).toBeLessThanOrEqual(WECHAT_SUMMARY_MAX)
    expect(out.endsWith('。')).toBe(true)
  })

  it('hard-cuts when there is no sentence end and removes newlines', () => {
    const out = clampSummary(`${'字'.repeat(80)}\n${'字'.repeat(80)}`)
    expect(wechatLength(out)).toBe(WECHAT_SUMMARY_MAX)
    expect(out).not.toContain('\n')
  })
})

describe('articleForPrompt', () => {
  it('strips front matter, code, images and keeps head + tail of long articles', () => {
    const md = `---\ntitle: x\n---\n# 标题\n\n\`\`\`js\nsecret()\n\`\`\`\n\n![图](a.png)正文开头\n\n${'中'.repeat(9000)}\n\n结尾结论`
    const out = articleForPrompt(md, 2000)
    expect(out.startsWith('# 标题')).toBe(true)
    expect(out).not.toContain('secret')
    expect(out).not.toContain('a.png')
    expect(out).toContain('正文开头')
    expect(out.endsWith('结尾结论')).toBe(true)
    expect(out.length).toBeLessThan(2100)
  })
})
