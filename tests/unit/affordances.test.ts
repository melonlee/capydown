import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  activeFormats,
  computeToolbarPosition,
  emptyLineEligible,
  INSERT_ITEMS,
  insertSnippet,
  linkContextAt,
  MERMAID_SNIPPET,
  TABLE_SNIPPET,
} from '../../src/renderer/src/editor/affordances'
import { toggleQuote } from '../../src/renderer/src/editor/format'
import { createDocumentState } from '../../src/renderer/src/editor/index'
import { APP_COMMANDS, COMMAND_MAP } from '../../src/shared/commands'
import { buildEditorContextMenuTemplate, type ContextMenuItem, sanitizeEditorContext } from '../../src/shared/context-menu'

function at(doc: string, from: number, to = from): EditorState {
  return createDocumentState(doc).update({ selection: EditorSelection.range(from, to) }).state
}

function apply(state: EditorState, spec: TransactionSpec) {
  const s = state.update(spec).state
  return { text: s.doc.toString(), sel: s.selection.main }
}

describe('computeToolbarPosition', () => {
  const bounds = { left: 100, top: 50, right: 1100, bottom: 850 }
  const size = { width: 300, height: 34 }

  it('centres the toolbar above the selection', () => {
    const p = computeToolbarPosition({ top: 400, bottom: 420, centerX: 600 }, size, bounds)
    expect(p).toEqual({ x: 600 - 150 - 100, y: 400 - 8 - 34 - 50, placement: 'above', hidden: false })
  })

  it('flips below when too close to the top', () => {
    const p = computeToolbarPosition({ top: 70, bottom: 92, centerX: 600 }, size, bounds)
    expect(p.placement).toBe('below')
    expect(p.y).toBe(92 + 8 - 50)
  })

  it('clamps horizontally inside the bounds', () => {
    expect(computeToolbarPosition({ top: 400, bottom: 420, centerX: 110 }, size, bounds).x).toBe(8)
    expect(computeToolbarPosition({ top: 400, bottom: 420, centerX: 1090 }, size, bounds).x).toBe(1000 - 8 - 300)
  })

  it('reports a selection scrolled out of view as hidden', () => {
    expect(computeToolbarPosition({ top: 0, bottom: 20, centerX: 600 }, size, bounds).hidden).toBe(true)
    expect(computeToolbarPosition({ top: 900, bottom: 920, centerX: 600 }, size, bounds).hidden).toBe(true)
  })
})

describe('activeFormats', () => {
  it('detects bold when the selection is inside or around **…**', () => {
    expect(activeFormats(at('a **bold** b', 4, 8)).has('fmt.bold')).toBe(true)
    expect(activeFormats(at('a **bold** b', 2, 10)).has('fmt.bold')).toBe(true)
    expect(activeFormats(at('a **bold** b', 5, 7)).has('fmt.bold')).toBe(true)
    expect(activeFormats(at('a **bold** b', 0, 1)).has('fmt.bold')).toBe(false)
  })

  it('does not mistake bold for italic', () => {
    const f = activeFormats(at('a **bold** b', 4, 8))
    expect(f.has('fmt.italic')).toBe(false)
    expect(activeFormats(at('a *it* b', 3, 5)).has('fmt.italic')).toBe(true)
    expect(activeFormats(at('a ***both*** b', 5, 9))).toEqual(new Set(['fmt.bold', 'fmt.italic']))
  })

  it('detects strike, inline code and links', () => {
    expect(activeFormats(at('x ~~del~~ y', 4, 7)).has('fmt.strike')).toBe(true)
    expect(activeFormats(at('x `code` y', 3, 7)).has('fmt.code')).toBe(true)
    expect(activeFormats(at('see [text](https://a.b) now', 5, 9)).has('fmt.link')).toBe(true)
  })

  it('detects heading levels 1–3 and quotes', () => {
    expect(activeFormats(at('## Title', 3, 8)).has('para.h2')).toBe(true)
    expect(activeFormats(at('#### Deep', 5, 9)).has('para.h2')).toBe(false)
    expect(activeFormats(at('> a\n> b', 2, 7)).has('para.quote')).toBe(true)
    expect(activeFormats(at('> a\nb', 2, 5)).has('para.quote')).toBe(false)
  })
})

describe('emptyLineEligible', () => {
  it('accepts an ordinary empty line', () => {
    expect(emptyLineEligible(at('a\n\nb', 2))).toBe(true)
    expect(emptyLineEligible(at('', 0))).toBe(true)
  })

  it('rejects non-empty lines and selections', () => {
    expect(emptyLineEligible(at('abc', 1))).toBe(false)
    expect(emptyLineEligible(at('a\n\nb', 0, 3))).toBe(false)
  })

  it('rejects empty lines inside code blocks and front matter', () => {
    const code = '```js\nx\n\ny\n```\n'
    expect(emptyLineEligible(at(code, code.indexOf('\n\n') + 1))).toBe(false)
    const fm = '---\ntitle: a\n\nb: c\n---\n\ntext'
    expect(emptyLineEligible(at(fm, fm.indexOf('\n\n') + 1))).toBe(false)
    // 紧跟在代码块 / Front Matter 之后的空行可以
    expect(emptyLineEligible(at('```\nx\n```\n\nafter', 10))).toBe(true)
    expect(emptyLineEligible(at(fm, fm.indexOf('---\n\n') + 4))).toBe(true)
  })

  it('rejects an empty line inside an unclosed fence', () => {
    expect(emptyLineEligible(at('```\ncode\n', 9))).toBe(false)
  })
})

describe('insert menu', () => {
  it('maps every item with a command onto the shared command table', () => {
    for (const item of INSERT_ITEMS) {
      if (item.command)
        expect(COMMAND_MAP[item.command], item.kind).toBeDefined()
      else
        expect(['table', 'mermaid']).toContain(item.kind)
    }
  })

  it('inserts a table on the empty line and selects the first header', () => {
    const r = apply(at('a\n\nb', 2), insertSnippet(at('a\n\nb', 2), 'table'))
    expect(r.text).toBe(`a\n${TABLE_SNIPPET}\nb`)
    expect(r.text.slice(r.sel.from, r.sel.to)).toBe('列 1')
  })

  it('inserts a mermaid block with the caret inside the diagram', () => {
    const s = at('', 0)
    const r = apply(s, insertSnippet(s, 'mermaid'))
    expect(r.text).toBe(MERMAID_SNIPPET)
    expect(r.text.slice(0, r.sel.head)).toBe('```mermaid\ngraph TD\n  A[开始] --> B[结束]')
  })

  it('quotes an empty line instead of doing nothing', () => {
    const s = at('a\n\nb', 2)
    expect(apply(s, toggleQuote(s)).text).toBe('a\n> \nb')
  })
})

describe('linkContextAt', () => {
  it('finds link and image urls', () => {
    const doc = 'go [here](https://x.y/a) and ![p](img/a.png)'
    expect(linkContextAt(createDocumentState(doc), 5)).toEqual({ kind: 'link', url: 'https://x.y/a' })
    expect(linkContextAt(createDocumentState(doc), doc.indexOf('img/'))).toEqual({ kind: 'image', url: 'img/a.png' })
    expect(linkContextAt(createDocumentState(doc), 1)).toBeNull()
  })
})

describe('editor context menu', () => {
  const flat = (items: ContextMenuItem[]): ContextMenuItem[] => items.flatMap(i => [i, ...flat(i.submenu ?? [])])

  it('sanitizes the renderer payload', () => {
    expect(sanitizeEditorContext(null)).toBeNull()
    expect(sanitizeEditorContext([1])).toBeNull()
    expect(sanitizeEditorContext({ hasSelection: 'yes', linkUrl: 5, imageUrl: 'x'.repeat(5000), extra: 1 }))
      .toEqual({ hasSelection: false, linkUrl: null, imageUrl: null })
  })

  it('builds the menu from the shared command table with platform accelerators', () => {
    const items = buildEditorContextMenuTemplate({ hasSelection: true, linkUrl: null, imageUrl: null }, true)
    expect(items.map(i => i.label ?? '—')).toEqual(['剪切', '复制', '粘贴', '全选', '—', '段落', '格式', '插入', '—', '发布前校对…'])
    const all = flat(items)
    for (const i of all.filter(i => i.command)) {
      const c = APP_COMMANDS.find(c => c.id === i.command)!
      expect(i.accelerator).toBe(c.accelerator)
    }
    expect(all.find(i => i.command === 'para.paragraph')?.label).toBe('正文')
    expect(all.find(i => i.command === 'para.table')?.label).toBe('表格…')
    // Windows / Linux 用 acceleratorOther
    const other = flat(buildEditorContextMenuTemplate({ hasSelection: true, linkUrl: null, imageUrl: null }, false))
    expect(other.find(i => i.command === 'fmt.uploadImage')).toBeDefined()
  })

  it('disables cut / copy without a selection and adds link actions', () => {
    const items = buildEditorContextMenuTemplate({ hasSelection: false, linkUrl: 'https://a.b', imageUrl: null }, true)
    expect(items.slice(0, 2).map(i => i.action)).toEqual(['openLink', 'copyLink'])
    expect(items.find(i => i.role === 'cut')?.enabled).toBe(false)
    expect(items.find(i => i.role === 'paste')?.enabled).toBeUndefined()
    const unsafe = buildEditorContextMenuTemplate({ hasSelection: false, linkUrl: 'javascript:alert(1)', imageUrl: null }, true)
    expect(unsafe[0].enabled).toBe(false)
    const img = buildEditorContextMenuTemplate({ hasSelection: false, linkUrl: null, imageUrl: 'a.png' }, true)
    expect(img[0].action).toBe('copyImageUrl')
  })
})
