/**
 * 专注模式（F8）、打字机模式（F9）与 AI 灰色建议文字。
 */
import type { Extension } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { syntaxTree } from '@codemirror/language'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'

// ---------------------------------------------------------------------------
// 专注模式：只保留光标所在的块，其余内容淡出
// ---------------------------------------------------------------------------

const CONTAINERS = new Set(['Document', 'ListItem', 'Blockquote'])

/** 光标所在的「块」范围：段落 / 标题 / 列表项里的段落 / 表格 / 代码块 */
export function currentBlockRange(state: EditorState): { from: number, to: number } {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const tree = syntaxTree(state)
  let node: SyntaxNode | null = tree.resolveInner(head, 1)
  if (node.name === 'Document' || node.from > line.to || node.to < line.from)
    node = tree.resolveInner(head, -1)
  while (node && node.parent && !CONTAINERS.has(node.parent.name))
    node = node.parent
  if (!node || CONTAINERS.has(node.name) || node.to < line.from || node.from > line.to)
    return { from: line.from, to: line.to }
  return { from: Math.min(node.from, line.from), to: Math.max(node.to, line.to) }
}

function focusDecorations(state: EditorState): DecorationSet {
  const { from, to } = currentBlockRange(state)
  const deco = Decoration.line({ class: 'cm-focus-line' })
  const ranges = []
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  for (let n = first; n <= last; n++)
    ranges.push(deco.range(state.doc.line(n).from))
  return Decoration.set(ranges)
}

export function focusMode(): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'cm-focus-mode' }),
    StateField.define<DecorationSet>({
      create: focusDecorations,
      update: (deco, tr) => (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)) ? focusDecorations(tr.state) : deco,
      provide: f => EditorView.decorations.from(f),
    }),
  ]
}

// ---------------------------------------------------------------------------
// 打字机模式：输入或用键盘移动光标时，让光标所在行保持在窗口垂直居中
// ---------------------------------------------------------------------------

export function typewriterMode(): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'cm-typewriter' }),
    ViewPlugin.fromClass(class {
      pending = 0
      update(update: ViewUpdate) {
        if (!update.view.hasFocus)
          return
        if (!update.docChanged && !update.selectionSet)
          return
        if (update.transactions.some(tr => tr.isUserEvent('select.pointer')))
          return
        cancelAnimationFrame(this.pending)
        const view = update.view
        this.pending = requestAnimationFrame(() => {
          view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) })
        })
      }

      destroy() {
        cancelAnimationFrame(this.pending)
      }
    }),
  ]
}

// ---------------------------------------------------------------------------
// AI 灰色建议文字（Tab 接受、Esc 取消；任何编辑或移动光标都会清除）
// ---------------------------------------------------------------------------

export interface Ghost {
  pos: number
  text: string
}

export const setGhost = StateEffect.define<Ghost | null>()

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  eq(other: GhostWidget) {
    return other.text === this.text
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-ai-ghost'
    el.textContent = this.text
    return el
  }
}

export const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhost))
        return e.value
    }
    if (value && (tr.docChanged || tr.selection))
      return null
    return value
  },
  provide: f => EditorView.decorations.from(f, (g) => {
    if (!g)
      return Decoration.none
    return Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)])
  }),
})
