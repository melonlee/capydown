/**
 * Typora 式的段落 / 格式命令：只做最小的文本改动，便于撤销，也不碰无关的字符。
 */
import { EditorSelection, type EditorState, type Line, type TransactionSpec } from '@codemirror/state'

function selectedLines(state: EditorState): Line[] {
  const seen = new Set<number>()
  const lines: Line[] = []
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    let last = state.doc.lineAt(r.to).number
    // 选区正好停在下一行行首时不算那一行
    if (r.to > r.from && state.doc.lineAt(r.to).from === r.to && last > first)
      last--
    for (let n = first; n <= last; n++) {
      if (!seen.has(n)) {
        seen.add(n)
        lines.push(state.doc.line(n))
      }
    }
  }
  return lines
}

/** 加粗 / 斜体 / 删除线 / 行内代码：已包裹则去掉，否则包裹；无选区时插入成对标记 */
export function toggleInline(state: EditorState, marker: string): TransactionSpec {
  const len = marker.length
  return state.changeByRange((range) => {
    const before = state.doc.sliceString(range.from - len, range.from)
    const after = state.doc.sliceString(range.to, range.to + len)
    const selected = state.doc.sliceString(range.from, range.to)
    if (before === marker && after === marker) {
      return {
        changes: [{ from: range.from - len, to: range.from }, { from: range.to, to: range.to + len }],
        range: EditorSelection.range(range.from - len, range.to - len),
      }
    }
    if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
      return {
        changes: { from: range.from, to: range.to, insert: selected.slice(len, selected.length - len) },
        range: EditorSelection.range(range.from, range.to - len * 2),
      }
    }
    return {
      changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
      range: EditorSelection.range(range.from + len, range.to + len),
    }
  })
}

const HEADING_RE = /^(\s{0,3})(#{1,6})[ \t]+/

/** ⌘1…⌘6 设置标题级别（再按一次取消），⌘0 变回段落 */
export function setHeading(state: EditorState, level: number): TransactionSpec {
  const lines = selectedLines(state)
  const allSame = level > 0 && lines.every((l) => {
    const m = HEADING_RE.exec(l.text)
    return m && m[2].length === level
  })
  const changes = lines.map((line) => {
    const m = HEADING_RE.exec(line.text)
    const existing = m ? m[0].length : 0
    const indent = m ? m[1].length : 0
    const insert = level > 0 && !allSame ? `${'#'.repeat(level)} ` : ''
    return { from: line.from + indent, to: line.from + existing, insert }
  })
  return { changes }
}

const LIST_RE = /^(\s*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/
const QUOTE_RE = /^(\s{0,3})>[ \t]?/

type ListKind = 'ul' | 'ol' | 'task'

function listKind(text: string): ListKind | null {
  const m = LIST_RE.exec(text)
  if (!m)
    return null
  if (/\[[ xX]\]/.test(m[0]))
    return 'task'
  return /\d/.test(m[0]) ? 'ol' : 'ul'
}

/** 有序 / 无序 / 任务列表：同类则取消，否则转换 */
export function toggleList(state: EditorState, kind: ListKind): TransactionSpec {
  const lines = selectedLines(state).filter(l => l.text.trim() !== '' || selectedLines(state).length === 1)
  const allSame = lines.length > 0 && lines.every(l => listKind(l.text) === kind)
  let n = 0
  const changes = lines.map((line) => {
    const m = LIST_RE.exec(line.text)
    const indent = m ? m[1].length : (/^\s*/.exec(line.text)?.[0].length ?? 0)
    const end = m ? m[0].length : indent
    if (allSame)
      return { from: line.from + indent, to: line.from + end, insert: '' }
    n++
    const prefix = kind === 'ul' ? '- ' : kind === 'task' ? '- [ ] ' : `${n}. `
    return { from: line.from + indent, to: line.from + end, insert: prefix }
  })
  return { changes }
}

export function toggleQuote(state: EditorState): TransactionSpec {
  const lines = selectedLines(state)
  const allQuoted = lines.every(l => QUOTE_RE.test(l.text) || l.text.trim() === '')
  const changes = lines.map((line) => {
    if (allQuoted) {
      const m = QUOTE_RE.exec(line.text)
      return m ? { from: line.from + m[1].length, to: line.from + m[0].length, insert: '' } : { from: line.from, insert: '' }
    }
    return { from: line.from, insert: '> ' }
  })
  return { changes }
}

/** 在当前位置插入一个独立成段的块（必要时补空行） */
export function insertBlock(state: EditorState, block: string, cursorOffset?: number): TransactionSpec {
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  const atEmptyLine = line.text.trim() === '' && range.empty
  const from = atEmptyLine ? line.from : range.empty ? line.to : range.from
  const to = atEmptyLine ? line.to : range.to
  const prefix = from === 0 || atEmptyLine ? '' : '\n\n'
  const insert = `${prefix}${block}`
  const caret = from + prefix.length + (cursorOffset ?? block.length)
  return {
    changes: { from, to, insert },
    selection: EditorSelection.cursor(caret),
  }
}

export function insertCodeBlock(state: EditorState): TransactionSpec {
  const range = state.selection.main
  if (!range.empty) {
    const text = state.doc.sliceString(range.from, range.to)
    return insertBlock(state, `\`\`\`\n${text}\n\`\`\`\n`, 3)
  }
  return insertBlock(state, '```\n\n```\n', 3)
}

/** 超链接：[选中文字](|)；选中的是网址时变成 [|](网址) */
export function insertLink(state: EditorState, image = false): TransactionSpec {
  const bang = image ? '!' : ''
  return state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to)
    if (/^https?:\/\/\S+$/.test(selected)) {
      const insert = `${bang}[](${selected})`
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + bang.length + 1) }
    }
    const insert = `${bang}[${selected}]()`
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length - 1) }
  })
}
