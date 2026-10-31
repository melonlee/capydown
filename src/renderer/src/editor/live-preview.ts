/**
 * Typora 式「实时预览」：
 * 文档内容永远是原始 Markdown 文本（磁盘文件就是唯一事实来源），这里只用 CodeMirror 6 的
 * Decoration 改变显示 —— 隐藏语法标记、把图片 / 表格 / 分割线 / 任务框画成部件。
 * 光标所在的块（或行内元素）会还原出原始标记，方便直接编辑。
 */
import type { Extension, Range } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { EditorState, Facet, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { frontMatterLength } from './markdown-utils'

export interface LivePreviewConfig {
  /** 把 Markdown 里的图片地址解析成可显示的 URL（本地相对路径需要异步读取） */
  resolveImage: (src: string) => string | Promise<string>
  /** 渲染表格等 Markdown 片段为（已净化的）HTML */
  renderMarkdown: (src: string) => string
  /** 渲染 mermaid 图，返回 SVG 字符串 */
  renderMermaid?: (code: string) => Promise<string>
}

export const livePreviewConfig = Facet.define<LivePreviewConfig, LivePreviewConfig>({
  combine: values => values[0] ?? {
    resolveImage: src => src,
    renderMarkdown: src => src,
  },
})

// ---------------------------------------------------------------------------
// 部件
// ---------------------------------------------------------------------------

function placeCursor(view: EditorView, dom: HTMLElement, offset = 0) {
  try {
    const pos = view.posAtDOM(dom) + offset
    view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) }, scrollIntoView: false })
    view.focus()
  }
  catch {}
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly editing: boolean) {
    super()
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.editing === this.editing
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = `cm-lp-image${this.editing ? ' is-editing' : ''}`
    const img = document.createElement('img')
    img.alt = this.alt
    img.draggable = false
    img.onload = () => view.requestMeasure()
    img.onerror = () => {
      wrap.classList.add('is-broken')
      wrap.setAttribute('data-label', `图片无法加载：${this.alt || this.src}`)
      view.requestMeasure()
    }
    try {
      // 解析器自带缓存：已读取过的本地图片会同步返回 data URL，避免光标进出时闪烁
      const resolved = view.state.facet(livePreviewConfig).resolveImage(this.src)
      if (typeof resolved === 'string')
        img.src = resolved
      else
        resolved.then((url) => { img.src = url }).catch(() => img.onerror?.(new Event('error')))
    }
    catch {
      img.onerror?.(new Event('error'))
    }
    wrap.appendChild(img)
    if (!this.editing) {
      wrap.addEventListener('mousedown', (e) => {
        e.preventDefault()
        placeCursor(view, wrap)
      })
    }
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-hr'
    return el
  }
}

const BULLETS = ['•', '◦', '▪']
class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super()
  }

  eq(other: BulletWidget) {
    return other.depth === this.depth
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-bullet'
    el.textContent = BULLETS[this.depth % BULLETS.length]
    return el
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(box)
      const text = view.state.doc.sliceString(pos, pos + 3)
      if (!/^\[[ xX]\]$/.test(text))
        return
      view.dispatch({
        changes: { from: pos + 1, to: pos + 2, insert: this.checked ? ' ' : 'x' },
        userEvent: 'input.toggleTask',
      })
    })
    return box
  }

  ignoreEvent() {
    return true
  }
}

class CodeLangWidget extends WidgetType {
  constructor(readonly lang: string) {
    super()
  }

  eq(other: CodeLangWidget) {
    return other.lang === this.lang
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-code-lang'
    el.textContent = this.lang
    return el
  }
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: TableWidget) {
    return other.source === this.source
  }

  get estimatedHeight() {
    return this.source.split('\n').length * 38
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-lp-block cm-lp-table'
    wrap.innerHTML = view.state.facet(livePreviewConfig).renderMarkdown(this.source)
    wrap.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('a'))
        return
      e.preventDefault()
      // 点到哪一行就把光标放到源码的哪一行
      const rows = Array.from(wrap.querySelectorAll('tr'))
      const row = (e.target as HTMLElement).closest('tr')
      let lineIdx = row ? rows.indexOf(row) : 0
      if (lineIdx > 0)
        lineIdx += 1 // 跳过分隔行
      const start = view.posAtDOM(wrap)
      const line = view.state.doc.lineAt(start)
      const target = view.state.doc.line(Math.min(line.number + Math.max(lineIdx, 0), view.state.doc.lines))
      view.dispatch({ selection: { anchor: Math.min(target.from + 2, target.to) } })
      view.focus()
    })
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

const mermaidCache = new Map<string, string>()

class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super()
  }

  eq(other: MermaidWidget) {
    return other.code === this.code
  }

  get estimatedHeight() {
    return 240
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-lp-block cm-lp-mermaid'
    const cached = mermaidCache.get(this.code)
    if (cached) {
      wrap.innerHTML = cached
    }
    else {
      wrap.textContent = '正在渲染图表…'
      const render = view.state.facet(livePreviewConfig).renderMermaid
      render?.(this.code).then((svg) => {
        mermaidCache.set(this.code, svg)
        wrap.innerHTML = svg
        view.requestMeasure()
      }).catch(() => {
        wrap.classList.add('is-broken')
        wrap.textContent = 'Mermaid 图表语法有误，点击查看源码'
      })
    }
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault()
      placeCursor(view, wrap, 4)
    })
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

// ---------------------------------------------------------------------------
// 鼠标拖选期间冻结装饰，避免语法标记出现 / 消失导致文字在鼠标下跳动
// ---------------------------------------------------------------------------

const setPointerSelecting = StateEffect.define<boolean>()
const pointerSelecting = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPointerSelecting))
        value = e.value
    }
    return value
  },
})

const pointerTracker = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    view.contentDOM.addEventListener('mousedown', this.down)
    document.addEventListener('mouseup', this.up, true)
  }

  down = (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey)
      this.view.dispatch({ effects: setPointerSelecting.of(true) })
  }

  up = () => {
    if (this.view.state.field(pointerSelecting, false)) {
      // 等 CodeMirror 处理完这次点击的选区后再解冻
      setTimeout(() => this.view.dispatch({ effects: setPointerSelecting.of(false) }), 0)
    }
  }

  destroy() {
    this.view.contentDOM.removeEventListener('mousedown', this.down)
    document.removeEventListener('mouseup', this.up, true)
  }
})

// ---------------------------------------------------------------------------
// 装饰计算
// ---------------------------------------------------------------------------

const hidden = Decoration.replace({})

function listDepth(node: SyntaxNode): number {
  let depth = 0
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === 'BulletList' || p.name === 'OrderedList')
      depth++
  }
  return Math.max(0, depth - 1)
}

export function buildLivePreviewDecorations(state: EditorState): DecorationSet {
  const doc = state.doc
  const tree = ensureSyntaxTree(state, doc.length, 40) ?? syntaxTree(state)
  const config = state.facet(livePreviewConfig)
  const sel = state.selection.ranges
  const decos: Range<Decoration>[] = []

  const touches = (from: number, to: number) => sel.some(r => r.from <= to && r.to >= from)
  const lineTouched = (pos: number) => {
    const line = doc.lineAt(pos)
    return touches(line.from, line.to)
  }
  const add = (deco: Decoration, from: number, to = from) => {
    decos.push(deco.range(from, to))
  }
  const hide = (from: number, to: number) => {
    if (to > from)
      decos.push(hidden.range(from, to))
  }
  const lineClass = (from: number, to: number, cls: string) => {
    const first = doc.lineAt(from).number
    const last = doc.lineAt(to).number
    const deco = Decoration.line({ class: cls })
    for (let n = first; n <= last; n++)
      decos.push(deco.range(doc.line(n).from))
  }
  const text = (from: number, to: number) => doc.sliceString(from, to)

  // Front Matter：整体按元数据样式显示，不参与 Markdown 解析
  const fm = frontMatterLength(doc.sliceString(0, Math.min(doc.length, 20000)))
  if (fm > 0)
    lineClass(0, Math.max(0, fm - 1), 'cm-lp-frontmatter')

  tree.iterate({
    enter: (ref) => {
      const { name, from, to } = ref
      if (fm > 0 && from < fm && name !== 'Document')
        return false
      const node = ref.node

      switch (name) {
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const level = Number(name.slice(-1))
          lineClass(from, from, `cm-lp-h cm-lp-h${level}`)
          return
        }
        case 'SetextHeading1':
        case 'SetextHeading2': {
          const level = Number(name.slice(-1))
          const lastLine = doc.lineAt(to)
          if (lastLine.from > from)
            lineClass(from, lastLine.from - 1, `cm-lp-h cm-lp-h${level}`)
          if (!touches(from, to) && lastLine.from > from)
            decos.push(Decoration.replace({ block: true }).range(lastLine.from, lastLine.to))
          return
        }
        case 'HeaderMark': {
          const parent = node.parent
          if (!parent || !parent.name.startsWith('ATXHeading') || lineTouched(from))
            return
          if (from === parent.from) {
            let end = to
            while (end < parent.to && /[ \t]/.test(text(end, end + 1))) end++
            hide(from, end)
          }
          else {
            let start = from
            while (start > parent.from && /[ \t]/.test(text(start - 1, start))) start--
            hide(start, to)
          }
          return
        }
        case 'EmphasisMark':
        case 'StrikethroughMark': {
          const parent = node.parent
          if (parent && !touches(parent.from, parent.to))
            hide(from, to)
          return
        }
        case 'CodeMark': {
          const parent = node.parent
          if (parent?.name === 'InlineCode' && !touches(parent.from, parent.to))
            hide(from, to)
          return
        }
        case 'Escape': {
          if (!touches(from, to))
            hide(from, from + 1)
          return
        }
        case 'Link': {
          if (touches(from, to))
            return
          const marks = node.getChildren('LinkMark')
          const url = node.getChild('URL')
          const isRef = !!node.getChild('LinkLabel')
          if (marks.length < 2 || (!url && !isRef))
            return
          const href = url ? text(url.from, url.to) : ''
          hide(marks[0].from, marks[0].to)
          if (marks[1].from > marks[0].to)
            add(Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-href': href, 'title': `${href}\n⌘ + 点击打开` } }), marks[0].to, marks[1].from)
          hide(marks[1].from, to)
          return
        }
        case 'Autolink': {
          const url = node.getChild('URL')
          if (!url)
            return
          if (!touches(from, to)) {
            hide(from, url.from)
            hide(url.to, to)
          }
          add(Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-href': text(url.from, url.to) } }), url.from, url.to)
          return false
        }
        case 'URL': {
          const parent = node.parent?.name
          if (parent === 'Link' || parent === 'Image' || parent === 'LinkReference' || parent === 'Autolink')
            return
          add(Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-href': text(from, to) } }), from, to)
          return
        }
        case 'Image': {
          const url = node.getChild('URL')
          const marks = node.getChildren('LinkMark')
          if (!url || marks.length < 2)
            return false
          const src = text(url.from, url.to).replace(/^<|>$/g, '')
          const alt = text(marks[0].to, marks[1].from)
          if (touches(from, to)) {
            add(Decoration.mark({ class: 'cm-lp-image-src' }), from, to)
            add(Decoration.widget({ widget: new ImageWidget(src, alt, true), side: 1 }), to)
          }
          else {
            add(Decoration.replace({ widget: new ImageWidget(src, alt, false) }), from, to)
          }
          return false
        }
        case 'HorizontalRule': {
          if (!lineTouched(from))
            add(Decoration.replace({ widget: new HrWidget() }), from, to)
          return false
        }
        case 'Blockquote': {
          lineClass(from, to, 'cm-lp-quote')
          return
        }
        case 'QuoteMark': {
          if (!lineTouched(from))
            hide(from, text(to, to + 1) === ' ' ? to + 1 : to)
          return
        }
        case 'ListMark': {
          const item = node.parent
          const list = item?.parent
          if (!item || !list)
            return
          const markEnd = text(to, to + 1) === ' ' ? to + 1 : to
          if (list.name === 'BulletList') {
            const task = item.getChild('Task')
            const marker = task?.getChild('TaskMarker')
            if (marker) {
              if (!touches(from, marker.to))
                hide(from, markEnd)
            }
            else if (!touches(from, markEnd)) {
              add(Decoration.replace({ widget: new BulletWidget(listDepth(item)) }), from, to)
            }
          }
          else {
            add(Decoration.mark({ class: 'cm-lp-ol-mark' }), from, to)
          }
          return
        }
        case 'TaskMarker': {
          const checked = /x/i.test(text(from, to))
          const task = node.parent
          if (!touches(from, to))
            add(Decoration.replace({ widget: new CheckboxWidget(checked) }), from, to)
          if (checked && task && task.to > to)
            add(Decoration.mark({ class: 'cm-lp-task-done' }), to, task.to)
          return
        }
        case 'FencedCode': {
          const first = doc.lineAt(from)
          const last = doc.lineAt(to)
          const active = touches(first.from, last.to)
          const info = node.getChild('CodeInfo')
          const lang = info ? text(info.from, info.to).trim() : ''
          const marks = node.getChildren('CodeMark')
          const closed = marks.length > 1 && last.number > first.number
          if (!active && closed && lang.toLowerCase() === 'mermaid' && config.renderMermaid) {
            const code = doc.sliceString(first.to + 1, Math.max(first.to + 1, last.from - 1))
            decos.push(Decoration.replace({ widget: new MermaidWidget(code), block: true }).range(first.from, last.to))
            return false
          }
          for (let n = first.number; n <= last.number; n++) {
            let cls = 'cm-lp-code'
            if (n === first.number)
              cls += ' cm-lp-code-begin'
            if (n === last.number)
              cls += ' cm-lp-code-end'
            decos.push(Decoration.line({ class: cls }).range(doc.line(n).from))
          }
          if (!active) {
            if (first.to > first.from)
              add(Decoration.replace({ widget: new CodeLangWidget(lang) }), first.from, first.to)
            if (closed && last.to > last.from)
              hide(last.from, last.to)
          }
          return false
        }
        case 'CodeBlock': {
          lineClass(from, to, 'cm-lp-code cm-lp-code-indented')
          return false
        }
        case 'Table': {
          const first = doc.lineAt(from)
          const last = doc.lineAt(to)
          if (!touches(first.from, last.to)) {
            decos.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(first.from, last.to)), block: true }).range(first.from, last.to))
          }
          else {
            lineClass(from, to, 'cm-lp-table-src')
          }
          return false
        }
        case 'HTMLBlock':
        case 'CommentBlock':
        case 'ProcessingInstructionBlock': {
          lineClass(from, to, 'cm-lp-html')
          return false
        }
        case 'LinkReference': {
          lineClass(from, to, 'cm-lp-linkref')
          return false
        }
      }
    },
  })

  return Decoration.set(decos, true)
}

const livePreviewField = StateField.define<DecorationSet>({
  create: state => buildLivePreviewDecorations(state),
  update(deco, tr) {
    const unfreeze = tr.effects.some(e => e.is(setPointerSelecting) && !e.value)
    if (tr.state.field(pointerSelecting, false) && !tr.docChanged && !unfreeze)
      return deco
    if (tr.docChanged || tr.selection || unfreeze || tr.reconfigured || syntaxTree(tr.state) !== syntaxTree(tr.startState))
      return buildLivePreviewDecorations(tr.state)
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

export function livePreview(): Extension {
  return [
    pointerSelecting,
    pointerTracker,
    livePreviewField,
    EditorView.editorAttributes.of({ class: 'cm-live-preview' }),
  ]
}

/** 找到某位置上的链接地址（实时预览与源码模式都可用，用于 ⌘+点击打开） */
export function linkAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1)
  for (; node; node = node.parent) {
    if (node.name === 'URL')
      return state.doc.sliceString(node.from, node.to)
    if (node.name === 'Link' || node.name === 'Autolink' || node.name === 'Image') {
      const url = node.getChild('URL')
      return url ? state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, '') : null
    }
  }
  return null
}
