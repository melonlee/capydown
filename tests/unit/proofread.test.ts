import { describe, expect, it } from 'vitest'
import { parseJsonLoose } from '../../src/shared/ai/json'
import {
  applyEdits,
  buildProofreadMessages,
  chunkSegments,
  extractSegments,
  locateIssues,
  parseProofreadResponse,
  planEdits,
  proofreadText,
  protectedRanges,
  rejectReason,
  relocateIssue,
  type ProofreadChunk,
  type RawIssue,
} from '../../src/shared/ai/proofread'

const ARTICLE = `---
title: 测试文章
tags: [a, b]
---

# 标题在次出现

第一段做为开头，按装好以后再说。

\`\`\`js
const s = '在次 做为 按装'
\`\`\`

- 列表里的的错字
- 第二项

> 引用里有，，重复标点

    缩进代码 在次

![图片](./assets/在次.png)

[链接文字](https://example.com/在次) 后面正文在次出现。

<div>HTML 块 在次</div>

$$
E = mc^2 在次
$$
`

const raw = (paragraph: string, original: string, suggestion: string, extra: Partial<RawIssue> = {}): RawIssue =>
  ({ paragraph, original, suggestion, reason: '', type: 'typo', ...extra })

function chunkOf(text: string): ProofreadChunk {
  return { index: 0, segments: extractSegments(text) }
}

describe('extractSegments', () => {
  it('skips front matter, code, html, math, images and keeps absolute offsets', () => {
    const segs = extractSegments(ARTICLE)
    const texts = segs.map(s => s.text)
    expect(texts).toEqual([
      '# 标题在次出现',
      '第一段做为开头，按装好以后再说。',
      '- 列表里的的错字\n- 第二项',
      '> 引用里有，，重复标点',
      '[链接文字](https://example.com/在次) 后面正文在次出现。',
    ])
    for (const s of segs)
      expect(ARTICLE.slice(s.from, s.to)).toBe(s.text)
    expect(segs.map(s => s.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
    expect(segs[0].line).toBe(6)
    expect(segs[1].line).toBe(8)
  })

  it('keeps an indented block inside a list (not code)', () => {
    const md = '- 第一项\n\n    续行在次\n'
    expect(extractSegments(md).map(s => s.text)).toEqual(['- 第一项', '    续行在次'])
  })

  it('handles CRLF files: offsets include \\r and paragraphs split on blank CRLF lines', () => {
    const md = '# 标题\r\n\r\n第一行在次\r\n第二行做为\r\n\r\n```\r\n代码 在次\r\n```\r\n\r\n结尾。\r\n'
    const segs = extractSegments(md)
    expect(segs.map(s => s.text)).toEqual(['# 标题', '第一行在次\r\n第二行做为', '结尾。'])
    for (const s of segs)
      expect(md.slice(s.from, s.to)).toBe(s.text)
    expect(segs[2].line).toBe(10)
  })

  it('splits very long paragraphs at sentence ends with contiguous offsets', () => {
    const sentence = '这是一句用来凑长度的话。'
    const md = `${sentence.repeat(300)}\n`
    const segs = extractSegments(md, 500)
    expect(segs.length).toBeGreaterThan(5)
    for (const s of segs) {
      expect(s.text.length).toBeLessThanOrEqual(500)
      expect(md.slice(s.from, s.to)).toBe(s.text)
      expect(s.text.endsWith('。')).toBe(true)
    }
    expect(segs[segs.length - 1].to).toBe(md.length - 1)
  })

  it('drops image-only or link-only paragraphs and BOM', () => {
    const md = '\uFEFF![a](b.png)\n\n<https://x.com>\n\n正文。'
    const segs = extractSegments(md)
    expect(segs.map(s => s.text)).toEqual(['正文。'])
  })
})

describe('chunkSegments', () => {
  it('packs paragraphs under the limit and keeps order', () => {
    const md = Array.from({ length: 30 }, (_, i) => `第${i}段${'字'.repeat(90)}。`).join('\n\n')
    const segs = extractSegments(md)
    const chunks = chunkSegments(segs, 500)
    expect(chunks.length).toBeGreaterThan(5)
    expect(chunks.flatMap(c => c.segments)).toEqual(segs)
    for (const c of chunks)
      expect(c.segments.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(500)
  })

  it('builds a JSON user message with LF text', () => {
    const chunk = chunkOf('一\r\n二\r\n')
    const { user } = buildProofreadMessages(chunk)
    expect(user).toContain('"text":"一\\n二"')
  })
})

describe('parseProofreadResponse / parseJsonLoose', () => {
  it('parses fenced JSON with prose around it and trailing commas', () => {
    const reply = '好的：\n```json\n{"issues":[{"p":"P1","type":"错别字","original":"在次出现","suggestion":"再次出现","reason":"同音字",},]}\n```'
    const issues = parseProofreadResponse(reply)
    expect(issues).toEqual([{ paragraph: 'P1', original: '在次出现', suggestion: '再次出现', reason: '同音字', type: 'typo', before: undefined }])
  })

  it('accepts a bare array and alias field names, drops malformed items', () => {
    const reply = '[{"paragraph":"2","text":"做为","correction":"作为","category":"spelling"},{"p":"P1"},42,null]'
    expect(parseProofreadResponse(reply)).toEqual([{ paragraph: '2', original: '做为', suggestion: '作为', reason: '', type: 'typo', before: undefined }])
  })

  it('throws on non-JSON and on JSON without an issues list', () => {
    expect(() => parseProofreadResponse('抱歉，我做不到')).toThrow()
    expect(() => parseProofreadResponse('{"foo":1}')).toThrow(/issues/)
    expect(parseJsonLoose('前缀 {"a":"}{"} 后缀')).toEqual({ a: '}{' })
  })
})

describe('rejectReason', () => {
  it('accepts small corrections', () => {
    expect(rejectReason('在次出现', '再次出现')).toBeNull()
    expect(rejectReason('中文English', '中文 English')).toBeNull()
    expect(rejectReason('的的', '的')).toBeNull()
  })

  it('rejects rewrites, markup changes and line-break changes', () => {
    expect(rejectReason('非常非常好', '极其出色且令人印象深刻')).toMatch(/改动/)
    expect(rejectReason('**重点**内容', '重点内容')).toMatch(/Markdown/)
    expect(rejectReason('一\n二', '一二')).toMatch(/换行/)
    expect(rejectReason('一样', '一样')).toMatch(/没有改动/)
    expect(rejectReason('  ', '')).toMatch(/为空/)
  })
})

describe('locateIssues', () => {
  it('maps issues to absolute offsets and skips protected spans', () => {
    const chunk = chunkOf(ARTICLE)
    const issues = locateIssues(ARTICLE, chunk, [
      raw('P1', '在次出现', '再次出现'),
      raw('P2', '做为', '作为'),
      raw('P2', '按装', '安装'),
      raw('P3', '的的', '的', { type: 'repetition' }),
      raw('P4', '，，', '，', { type: 'punctuation' }),
      // 链接地址里的「在次」受保护；同一段正文里的「在次」可以改
      raw('P5', 'example.com/在次', 'example.com/再次'),
      raw('P5', '正文在次', '正文再次'),
      // 段落编号写错：按唯一包含的段落找回
      raw('P9', '标题在次', '标题再次'),
      // 原文不存在
      raw('P2', '不存在的句子', '不存在'),
    ])
    expect(issues.map(i => [i.original, i.suggestion])).toEqual([
      ['在次出现', '再次出现'],
      ['做为', '作为'],
      ['按装', '安装'],
      ['的的', '的'],
      ['，，', '，'],
      ['正文在次', '正文再次'],
    ])
    for (const i of issues) {
      expect(ARTICLE.slice(i.from, i.to)).toBe(i.original)
      expect(ARTICLE.slice(i.from - i.before.length, i.from)).toBe(i.before)
    }
    expect(issues[0].line).toBe(6)
  })

  it('uses the "before" hint and never claims the same span twice', () => {
    const md = '他在次说，她在次说。'
    const chunk = chunkOf(md)
    const issues = locateIssues(md, chunk, [
      raw('P1', '在次', '再次', { before: '她' }),
      raw('P1', '在次', '再次'),
      raw('P1', '在次', '再次'),
    ])
    expect(issues.map(i => i.from)).toEqual([1, 6])
  })

  it('keeps CRLF inside multi-line originals', () => {
    const md = '第一行末尾\r\n第二行开头做为\r\n'
    const chunk = chunkOf(md)
    const [issue] = locateIssues(md, chunk, [raw('P1', '末尾\n第二行', '末尾\n第2行')])
    expect(md.slice(issue.from, issue.to)).toBe('末尾\r\n第二行')
    expect(issue.suggestion).toBe('末尾\r\n第2行')
  })
})

describe('protectedRanges', () => {
  it('covers code, urls, link targets, block markers and table delimiters', () => {
    const t = '- 看 `code` 和 https://a.com/x 以及 [文](http://b.com) <b>粗</b>\n|---|:--:|'
    const covered = (s: string) => {
      const i = t.indexOf(s)
      return protectedRanges(t).some(([a, b]) => a <= i && i + s.length <= b)
    }
    expect(covered('- ')).toBe(true)
    expect(covered('`code`')).toBe(true)
    expect(covered('https://a.com/x')).toBe(true)
    expect(covered('](http://b.com)')).toBe(true)
    expect(covered('<b>')).toBe(true)
    expect(covered('|---|:--:|')).toBe(true)
    expect(covered('看')).toBe(false)
    expect(covered('文')).toBe(false)
  })
})

describe('applyEdits / planEdits', () => {
  const edit = (id: string, text: string, original: string, suggestion: string, nth = 0) => {
    let from = -1
    for (let k = 0; k <= nth; k++)
      from = text.indexOf(original, from + 1)
    return { id, from, to: from + original.length, original, suggestion }
  }

  it('applies several edits in one paragraph regardless of order', () => {
    const text = '我做为作者，在次按装了软件的的说明。'
    const edits = [
      edit('c', text, '按装', '安装'),
      edit('a', text, '做为', '作为'),
      edit('d', text, '的的', '的'),
      edit('b', text, '在次', '再次'),
    ]
    const out = applyEdits(text, edits)
    expect(out.text).toBe('我作为作者，再次安装了软件的说明。')
    expect(out.applied).toEqual(['a', 'b', 'c', 'd'])
    expect(out.skipped).toEqual([])
  })

  it('skips overlapping and stale edits', () => {
    const text = '在次在次'
    const out = applyEdits(text, [
      { id: '1', from: 0, to: 2, original: '在次', suggestion: '再次' },
      { id: '2', from: 1, to: 3, original: '次在', suggestion: 'x' },
      { id: '3', from: 2, to: 4, original: '不对', suggestion: 'y' },
    ])
    expect(out.text).toBe('再次在次')
    expect(out.skipped).toEqual(['2', '3'])
  })

  it('preserves CRLF line endings around edits', () => {
    const text = '第一行做为\r\n第二行在次\r\n'
    const out = applyEdits(text, [edit('a', text, '做为', '作为'), edit('b', text, '在次', '再次')])
    expect(out.text).toBe('第一行作为\r\n第二行再次\r\n')
  })

  it('plans edits in document order', () => {
    const text = 'abc def'
    const plan = planEdits(text, [
      { id: 'y', from: 4, to: 7, original: 'def', suggestion: 'DEF' },
      { id: 'x', from: 0, to: 3, original: 'abc', suggestion: 'ABC' },
    ])
    expect(plan.apply.map(e => e.id)).toEqual(['x', 'y'])
  })
})

describe('relocateIssue', () => {
  it('finds the span again after earlier text changed, preferring matching context', () => {
    const issue = { from: 6, to: 8, original: '在次', before: '她', after: '说' }
    const edited = '新增内容。他在次说，她在次说。'
    expect(relocateIssue(edited, issue)).toEqual({ from: 11, to: 13 })
    expect(relocateIssue('完全不同的内容', issue)).toBeNull()
  })
})

describe('proofreadText (fake model)', () => {
  it('chunks, maps results, skips code blocks and reports failures per chunk', async () => {
    const md = `${ARTICLE}\n\n${Array.from({ length: 12 }, (_, i) => `补充段落${i}做为结尾${'字'.repeat(200)}。`).join('\n\n')}\n`
    let calls = 0
    const progress: number[] = []
    const result = await proofreadText(async (_system, user) => {
      calls++
      const { paragraphs } = JSON.parse(user.slice(user.indexOf('{')))
      if (paragraphs.some((p: any) => p.text.startsWith('补充段落5')))
        throw new Error('HTTP 500: boom')
      const issues = paragraphs.flatMap((p: any) => (p.text.includes('做为') ? [{ p: p.id, type: 'typo', original: p.text.match(/.做为/)[0], suggestion: p.text.match(/.做为/)[0].replace('做为', '作为'), reason: '' }] : []))
      // 代码块里的内容不会被发出去
      expect(user).not.toContain('const s')
      return JSON.stringify({ issues })
    }, md, { maxChunkChars: 700, concurrency: 2, onProgress: done => progress.push(done) })

    expect(result.totalChunks).toBe(calls)
    expect(result.totalChunks).toBeGreaterThan(3)
    expect(result.failedChunks).toHaveLength(1)
    expect(result.failedChunks[0].error).toContain('boom')
    expect(progress[progress.length - 1]).toBe(result.totalChunks)
    const fixed = applyEdits(md, result.issues).text
    expect(fixed).toContain('第一段作为开头')
    expect(fixed).toContain("const s = '在次 做为 按装'")
    expect(fixed).toContain('补充段落0作为结尾')
    expect(fixed).toContain('补充段落5做为结尾') // 失败批次里的段落保持原样
  })

  it('retries once when the reply is not JSON', async () => {
    let calls = 0
    const result = await proofreadText(async () => (++calls === 1 ? '不是 JSON' : '{"issues":[]}'), '一段正文。')
    expect(calls).toBe(2)
    expect(result.failedChunks).toEqual([])
  })
})
