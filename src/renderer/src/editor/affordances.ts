/**
 * 编辑区里的上下文入口（选区浮动工具栏、空行「+」插入菜单、右键菜单）用到的纯逻辑。
 * 不依赖 DOM，便于单元测试（tests/unit/affordances.test.ts）。
 */
import { syntaxTree } from '@codemirror/language'
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { insertBlock } from './format'
import { frontMatterLength } from './markdown-utils'

// ------------------------------------------------------------------ 浮动工具栏位置

export interface ToolbarAnchor {
  /** 选区第一行的顶部 / 最后一行的底部（视口坐标） */
  top: number
  bottom: number
  /** 工具栏水平中心希望对齐的位置（视口坐标） */
  centerX: number
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ToolbarPosition {
  /** 相对 bounds 左上角的坐标 */
  x: number
  y: number
  placement: 'above' | 'below'
  /** 选区已完全滚出可视区域 */
  hidden: boolean
}

/**
 * 计算浮动工具栏的位置：默认在选区上方居中；离顶部太近时放到选区下方；
 * 左右不超出 bounds（留 margin）。返回相对 bounds 的坐标。
 */
export function computeToolbarPosition(
  anchor: ToolbarAnchor,
  size: { width: number, height: number },
  bounds: Box,
  gap = 8,
  margin = 8,
): ToolbarPosition {
  const hidden = anchor.bottom < bounds.top || anchor.top > bounds.bottom
  let placement: 'above' | 'below' = 'above'
  let y = anchor.top - gap - size.height
  if (y < bounds.top + margin) {
    placement = 'below'
    y = anchor.bottom + gap
    // 下方也放不下（选区很高）时贴着可视区顶部
    if (y + size.height > bounds.bottom - margin)
      y = Math.max(bounds.top + margin, Math.min(anchor.top - gap - size.height, bounds.bottom - margin - size.height))
  }
  const minX = bounds.left + margin
  const maxX = Math.max(minX, bounds.right - margin - size.width)
  const x = Math.min(maxX, Math.max(minX, anchor.centerX - size.width / 2))
  return { x: Math.round(x - bounds.left), y: Math.round(y - bounds.top), placement, hidden }
}

// ------------------------------------------------------------------ 当前选区已有的格式

export type ToolbarCommand =
  | 'fmt.bold' | 'fmt.italic' | 'fmt.strike' | 'fmt.code' | 'fmt.link'
  | 'para.h1' | 'para.h2' | 'para.h3' | 'para.quote'

const INLINE_NODES: Record<string, ToolbarCommand> = {
  StrongEmphasis: 'fmt.bold',
  Emphasis: 'fmt.italic',
  Strikethrough: 'fmt.strike',
  InlineCode: 'fmt.code',
  Link: 'fmt.link',
}

const HEADING_RE = /^\s{0,3}(#{1,6})[ \t]+/
const QUOTE_RE = /^\s{0,3}>/

/** 包住整个 [from, to] 的行内格式节点（选区在 **…** 里面或正好选中了 **…**） */
function enclosingInline(state: EditorState, from: number, to: number): Set<ToolbarCommand> {
  const out = new Set<ToolbarCommand>()
  const tree = syntaxTree(state)
  const collect = (node: SyntaxNode | null) => {
    for (; node; node = node.parent) {
      const cmd = INLINE_NODES[node.name]
      if (cmd && node.from <= from && node.to >= to)
        out.add(cmd)
    }
  }
  collect(tree.resolveInner(from, 1))
  collect(tree.resolveInner(to, -1))
  return out
}

/** 浮动工具栏按钮的激活状态 */
export function activeFormats(state: EditorState): Set<ToolbarCommand> {
  const range = state.selection.main
  const out = enclosingInline(state, range.from, range.to)

  // 和 toggleInline 的判定一致：选区两侧紧挨着标记也算「已加粗」
  const doc = state.doc
  const around = (m: string) => doc.sliceString(range.from - m.length, range.from) === m && doc.sliceString(range.to, range.to + m.length) === m
  if (around('**'))
    out.add('fmt.bold')
  if (around('~~'))
    out.add('fmt.strike')
  if (around('`'))
    out.add('fmt.code')
  if (around('*') && !(around('**') && !around('***')))
    out.add('fmt.italic')

  const first = doc.lineAt(range.from).number
  let last = doc.lineAt(range.to).number
  if (range.to > range.from && doc.lineAt(range.to).from === range.to && last > first)
    last--
  const lines: string[] = []
  for (let n = first; n <= last; n++)
    lines.push(doc.line(n).text)
  const levels = lines.map(t => HEADING_RE.exec(t)?.[1].length ?? 0)
  if (levels.length && levels.every(l => l === levels[0]) && levels[0] >= 1 && levels[0] <= 3)
    out.add(`para.h${levels[0]}` as ToolbarCommand)
  const nonEmpty = lines.filter(t => t.trim() !== '')
  if (nonEmpty.length && nonEmpty.every(t => QUOTE_RE.test(t)))
    out.add('para.quote')
  return out
}

// ------------------------------------------------------------------ 空行「+」

const BLOCK_EXCLUDE = new Set(['FencedCode', 'CodeBlock', 'Table', 'HTMLBlock', 'CommentBlock', 'ProcessingInstructionBlock'])

/** 光标所在的空行能否显示「+」：不在代码块 / Front Matter / 表格 / HTML 块里，且只有一个空光标 */
export function emptyLineEligible(state: EditorState): boolean {
  const sel = state.selection
  if (sel.ranges.length !== 1 || !sel.main.empty)
    return false
  const pos = sel.main.head
  const line = state.doc.lineAt(pos)
  if (line.text.trim() !== '')
    return false
  const fm = frontMatterLength(state.doc.sliceString(0, Math.min(state.doc.length, 20000)))
  if (fm > 0 && line.from < fm)
    return false
  const tree = syntaxTree(state)
  for (const side of [-1, 1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      // 节点从更早的行开始、并延伸到这一空行（代码块内部、未闭合的围栏）才算「在里面」；
      // 只是紧挨着代码块的空行（节点在上一行行尾结束）不算
      if (BLOCK_EXCLUDE.has(node.name) && node.from < line.from && node.to >= line.to)
        return false
    }
  }
  return true
}

// ------------------------------------------------------------------ 插入菜单

export type InsertKind =
  | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'task' | 'quote'
  | 'codeBlock' | 'table' | 'image' | 'hr' | 'mermaid'

export interface InsertItem {
  kind: InsertKind
  label: string
  /** 与菜单共用的命令（同一条执行路径）；没有的用 insertSnippet 生成 */
  command?: string
  hint: string
}

export const INSERT_ITEMS: InsertItem[] = [
  { kind: 'h1', label: '标题 1', command: 'para.h1', hint: 'H1' },
  { kind: 'h2', label: '标题 2', command: 'para.h2', hint: 'H2' },
  { kind: 'h3', label: '标题 3', command: 'para.h3', hint: 'H3' },
  { kind: 'ul', label: '无序列表', command: 'para.ul', hint: '•' },
  { kind: 'ol', label: '有序列表', command: 'para.ol', hint: '1.' },
  { kind: 'task', label: '任务列表', command: 'para.task', hint: '☐' },
  { kind: 'quote', label: '引用', command: 'para.quote', hint: '“' },
  { kind: 'codeBlock', label: '代码块', command: 'para.codeBlock', hint: '</>' },
  { kind: 'table', label: '表格', hint: '▦' },
  { kind: 'image', label: '图片', command: 'fmt.uploadImage', hint: '▣' },
  { kind: 'hr', label: '分割线', command: 'para.hr', hint: '—' },
  { kind: 'mermaid', label: 'Mermaid 图', hint: '◇' },
]

export const TABLE_SNIPPET = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n'
export const MERMAID_SNIPPET = '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```\n'

/** 插入菜单里没有对应菜单命令的项：表格（选中「列 1」便于直接改写）、Mermaid（光标停在图表代码里） */
export function insertSnippet(state: EditorState, kind: 'table' | 'mermaid'): TransactionSpec {
  if (kind === 'table') {
    const spec = insertBlock(state, TABLE_SNIPPET, 2)
    const caret = (spec.selection as { head: number }).head
    return { ...spec, selection: EditorSelection.range(caret, caret + 3) }
  }
  const lineEnd = MERMAID_SNIPPET.indexOf('\n', '```mermaid\ngraph TD\n'.length)
  return insertBlock(state, MERMAID_SNIPPET, lineEnd)
}

// ------------------------------------------------------------------ 右键菜单上下文

export interface LinkContext {
  kind: 'link' | 'image'
  url: string
}

/** 某位置上的链接 / 图片地址（右键菜单的「打开链接 / 复制链接地址」） */
export function linkContextAt(state: EditorState, pos: number): LinkContext | null {
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'Link' || node.name === 'Image' || node.name === 'Autolink') {
        const url = node.getChild('URL')
        if (!url)
          return null
        return {
          kind: node.name === 'Image' ? 'image' : 'link',
          url: state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, ''),
        }
      }
      if (node.name === 'URL' && node.parent?.name !== 'Link' && node.parent?.name !== 'Image')
        return { kind: 'link', url: state.doc.sliceString(node.from, node.to) }
    }
  }
  return null
}
