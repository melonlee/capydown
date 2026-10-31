import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { formatAccelerator, matchShortcut, parseAccelerator } from '../../src/shared/commands'
import { setHeading, toggleInline, toggleList, toggleQuote } from '../../src/renderer/src/editor/format'
import { createDocumentState } from '../../src/renderer/src/editor/index'
import { buildLivePreviewDecorations } from '../../src/renderer/src/editor/live-preview'
import {
  activeOutlineIndex,
  computeTextStats,
  detectLineSeparator,
  extractOutline,
  frontMatterLength,
  fuzzyScore,
} from '../../src/renderer/src/editor/markdown-utils'

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8')

describe('round trip: opening a file never changes its bytes', () => {
  const cases: Record<string, string> = {
    'LF article': fixture('article-tech.md'),
    'edge cases (front matter, setext, lazy quote, refs)': fixture('edge-cases.md'),
    'CRLF': '# 标题\r\n\r\n正文第一行\r\n- 列表\r\n',
    'lone CR': 'a\rb\r',
    'mixed line endings': 'a\r\nb\nc\r',
    'BOM + no trailing newline': '﻿# 标题\n正文',
    'trailing spaces and tabs': 'line with two spaces  \n\tindented\n\n\n',
    'empty': '',
  }
  for (const [name, text] of Object.entries(cases)) {
    it(name, () => {
      const state = createDocumentState(text)
      expect(state.sliceDoc()).toBe(text)
      // 实时预览只产生装饰，不改动文本
      expect(() => buildLivePreviewDecorations(state)).not.toThrow()
      expect(state.sliceDoc()).toBe(text)
    })
  }

  it('typing a newline into a CRLF file keeps CRLF', () => {
    const state = createDocumentState('a\r\nb\r\n')
    const tr = state.update({ changes: { from: 1, insert: state.lineBreak } })
    expect(tr.state.sliceDoc()).toBe('a\r\n\r\nb\r\n')
  })

  it('editing a mixed-line-ending file keeps the other lines untouched', () => {
    const state = createDocumentState('a\r\nb\nc\r')
    const tr = state.update({ changes: { from: state.doc.length, insert: 'd' } })
    expect(tr.state.sliceDoc()).toBe('a\r\nb\nc\rd')
  })

  it('pasting LF text into a CRLF file is normalised to CRLF', () => {
    const state = createDocumentState('a\r\nb\r\n')
    const tr = state.update({ changes: { from: 1, insert: 'x\ny' } })
    expect(tr.state.sliceDoc()).toBe('ax\r\ny\r\nb\r\n')
  })
})

describe('detectLineSeparator', () => {
  it('detects uniform separators only', () => {
    expect(detectLineSeparator('a\nb')).toBeUndefined()
    expect(detectLineSeparator('a\r\nb\r\n')).toBe('\r\n')
    expect(detectLineSeparator('a\rb')).toBe('\r')
    expect(detectLineSeparator('a\r\nb\n')).toBe('\n')
  })
})

describe('extractOutline', () => {
  it('finds ATX and setext headings, skipping code and front matter', () => {
    const md = [
      '---',
      'title: "# not a heading"',
      '---',
      '# 一级 **加粗** 标题',
      '',
      '```bash',
      '# comment, not a heading',
      '```',
      '',
      'Setext 标题',
      '===',
      '',
      '## [链接](https://x.y) 与 `code` ##',
      '',
      '段落',
      '---',
      '',
      '---',
      '####### 七个井号不是标题',
      '#没有空格也不是',
    ].join('\n')
    expect(extractOutline(md)).toEqual([
      { level: 1, text: '一级 加粗 标题', line: 3 },
      { level: 1, text: 'Setext 标题', line: 9 },
      { level: 2, text: '链接 与 code', line: 12 },
      { level: 2, text: '段落', line: 14 },
    ])
  })

  it('reports the active heading for a cursor line', () => {
    const outline = extractOutline('前言\n# A\ntext\n## B\nmore')
    expect(activeOutlineIndex(outline, 0)).toBe(-1)
    expect(activeOutlineIndex(outline, 2)).toBe(0)
    expect(activeOutlineIndex(outline, 4)).toBe(1)
  })

  it('front matter length', () => {
    expect(frontMatterLength('---\na: 1\n---\nbody')).toBe(13)
    expect(frontMatterLength('# no fm')).toBe(0)
  })
})

describe('computeTextStats', () => {
  it('counts CJK characters as words and latin words separately', () => {
    const s = computeTextStats('# 你好世界\n\nHello **world**, it\'s 2025!')
    expect(s.cjk).toBe(4)
    expect(s.latinWords).toBe(4)
    expect(s.words).toBe(8)
    expect(s.readingMinutes).toBe(1)
  })

  it('ignores markdown syntax, image urls and link targets', () => {
    const s = computeTextStats('![图](https://a.b/c.png)\n\n[链接文字](https://example.com)\n\n- [ ] 任务')
    expect(s.words).toBe(6)
  })

  it('empty document', () => {
    const s = computeTextStats('')
    expect(s.words).toBe(0)
    expect(s.readingMinutes).toBe(0)
    expect(s.lines).toBe(0)
  })

  it('reading time for a long Chinese article', () => {
    expect(computeTextStats('字'.repeat(2000)).readingMinutes).toBe(5)
  })
})

describe('fuzzyScore', () => {
  it('ranks substring matches above subsequences and rejects non-matches', () => {
    expect(fuzzyScore('排版', '公众号排版的 7 个细节.md')).toBeGreaterThan(fuzzyScore('排版', '公众号/排列版式.md'))
    expect(fuzzyScore('xyz', 'abc.md')).toBe(-1)
    expect(fuzzyScore('gzh', 'gong/zhong/hao.md')).toBeGreaterThan(0)
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})

describe('shortcuts', () => {
  const key = (code: string, mods: Partial<{ metaKey: boolean, ctrlKey: boolean, altKey: boolean, shiftKey: boolean }> = {}) =>
    ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

  it('parses and matches accelerators on mac', () => {
    const s = parseAccelerator('Shift+CmdOrCtrl+L')
    expect(matchShortcut(key('KeyL', { metaKey: true, shiftKey: true }), s, true)).toBe(true)
    expect(matchShortcut(key('KeyL', { metaKey: true }), s, true)).toBe(false)
    expect(matchShortcut(key('F8'), parseAccelerator('F8'), true)).toBe(true)
    expect(matchShortcut(key('Slash', { metaKey: true }), parseAccelerator('CmdOrCtrl+/'), true)).toBe(true)
    expect(matchShortcut(key('Digit1', { metaKey: true, ctrlKey: true }), parseAccelerator('Ctrl+CmdOrCtrl+1'), true)).toBe(true)
  })

  it('maps CmdOrCtrl to Ctrl elsewhere', () => {
    expect(matchShortcut(key('KeyB', { ctrlKey: true }), parseAccelerator('CmdOrCtrl+B'), false)).toBe(true)
  })

  it('formats for display', () => {
    expect(formatAccelerator('Shift+CmdOrCtrl+L', true)).toBe('⇧⌘L')
    expect(formatAccelerator('Alt+CmdOrCtrl+P', true)).toBe('⌥⌘P')
    expect(formatAccelerator('Shift+CmdOrCtrl+L', false)).toBe('Ctrl+Shift+L')
  })
})

describe('format commands', () => {
  const apply = (doc: string, from: number, to: number, fn: (s: EditorState) => any) => {
    const state = EditorState.create({ doc, selection: { anchor: from, head: to } })
    return state.update(fn(state)).state.doc.toString()
  }

  it('toggles bold around a selection', () => {
    expect(apply('写作很快乐', 2, 4, s => toggleInline(s, '**'))).toBe('写作**很快**乐')
    expect(apply('写作**很快**乐', 4, 6, s => toggleInline(s, '**'))).toBe('写作很快乐')
  })

  it('sets and toggles heading level', () => {
    expect(apply('标题', 0, 0, s => setHeading(s, 2))).toBe('## 标题')
    expect(apply('## 标题', 0, 0, s => setHeading(s, 2))).toBe('标题')
    expect(apply('## 标题', 0, 0, s => setHeading(s, 3))).toBe('### 标题')
    expect(apply('### 标题', 0, 0, s => setHeading(s, 0))).toBe('标题')
  })

  it('lists and quotes', () => {
    expect(apply('a\nb', 0, 3, s => toggleList(s, 'ol'))).toBe('1. a\n2. b')
    expect(apply('- a\n- b', 0, 7, s => toggleList(s, 'ul'))).toBe('a\nb')
    expect(apply('- a', 0, 0, s => toggleList(s, 'task'))).toBe('- [ ] a')
    expect(apply('a\nb', 0, 3, s => toggleQuote(s))).toBe('> a\n> b')
    expect(apply('> a\n> b', 0, 7, s => toggleQuote(s))).toBe('a\nb')
  })
})
