/**
 * Slothdown 的主编辑器：CodeMirror 6 + Typora 式实时预览。
 *
 * 对外暴露一个 MarkdownEditor 对象，保留了旧代码（CodeMirror 5 时代）用到的那几个方法
 * （getValue / setValue / getSelection / replaceSelection / getCursor / replaceRange …），
 * 这样插入表格、AI、导入导出等功能不必重写。
 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, redo, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Annotation, Compartment, EditorSelection, EditorState, type Extension, Prec, Text, type TransactionSpec } from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, keymap, placeholder, type ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { type InsertKind, insertSnippet, linkContextAt } from './affordances'
import { insertBlock, insertCodeBlock, insertLink, setHeading, toggleInline, toggleList, toggleQuote } from './format'
import { markdownHighlighting } from './highlight'
import { linkAt, livePreview, type LivePreviewConfig, livePreviewConfig } from './live-preview'
import { detectLineSeparator } from './markdown-utils'
import { insertButton, pinInsertButton } from './insert-button'
import { focusMode, ghostField, setGhost, typewriterMode } from './modes'

export { computeTextStats, extractOutline } from './markdown-utils'

/** 标记「载入文件」产生的变更：它们不算用户编辑，不触发保存 */
export const loadAnnotation = Annotation.define<boolean>()

export interface CM5Pos {
  line: number
  ch: number
}

export interface MarkdownEditorOptions {
  parent: HTMLElement
  preview: LivePreviewConfig
  onDocChange?: () => void
  onSelectionChange?: () => void
  onScroll?: () => void
  /** 粘贴了图片文件；返回 true 表示已处理 */
  onPasteFiles?: (files: File[]) => boolean
  /** 拖入了文件 / 文件夹；返回 true 表示已处理 */
  onDropFiles?: (event: DragEvent) => boolean
  openLink?: (url: string) => void
  /** 右键：上下文（选区 / 链接 / 图片），由外部弹出原生菜单 */
  onContextMenu?: (ctx: EditorContextInfo) => void
  /** 点击空行左侧的「+」 */
  onInsertButton?: (anchor: DOMRect) => void
  placeholder?: string
}

export interface EditorContextInfo {
  hasSelection: boolean
  linkUrl: string | null
  imageUrl: string | null
}

export type FormatCommand =
  | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'image'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'paragraph'
  | 'quote' | 'ol' | 'ul' | 'task' | 'codeBlock' | 'hr'

/**
 * CRLF 文件：编辑器按 "\r\n" 拆行。粘贴进来的文本若含单独的 "\n" 会留在「行内」，
 * 这里把它们拆成真正的行，保存时就会统一写成 CRLF。
 */
function normalizeInsertedLineBreaks(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged)
      return tr
    let needs = false
    tr.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
      for (let i = 1; i <= inserted.lines && !needs; i++) {
        if (/[\r\n]/.test(inserted.line(i).text))
          needs = true
      }
    })
    if (!needs)
      return tr
    const changes: { from: number, to: number, insert: Text }[] = []
    let sameLength = true
    let lastEnd = 0
    let shift = 0
    tr.changes.iterChanges((fromA, toA, _fb, _tb, inserted) => {
      const lines: string[] = []
      for (let i = 1; i <= inserted.lines; i++)
        lines.push(...inserted.line(i).text.split(/\r\n|\r|\n/))
      const text = Text.of(lines)
      if (text.length !== inserted.length)
        sameLength = false
      changes.push({ from: fromA, to: toA, insert: text })
      shift += text.length - (toA - fromA)
      lastEnd = toA + shift
    })
    return {
      changes,
      selection: sameLength ? tr.selection : EditorSelection.cursor(lastEnd),
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
      userEvent: 'input.paste',
    }
  })
}

export class MarkdownEditor {
  readonly view: EditorView
  private readonly opts: MarkdownEditorOptions
  private readonly sourceComp = new Compartment()
  private readonly focusComp = new Compartment()
  private readonly typewriterComp = new Compartment()
  private readonly insertComp = new Compartment()
  private readonly insertPlugin: ViewPlugin<any>
  private readonly updateListeners = new Set<(u: ViewUpdate) => void>()
  private sourceMode = false
  private focus_ = false
  private typewriter = false

  constructor(opts: MarkdownEditorOptions) {
    this.opts = opts
    this.insertPlugin = insertButton({ onOpen: anchor => opts.onInsertButton?.(anchor) })
    this.view = new EditorView({
      state: this.createState(''),
      parent: opts.parent,
    })
    this.view.scrollDOM.addEventListener('scroll', () => opts.onScroll?.(), { passive: true })
  }

  private createState(doc: string): EditorState {
    const sep = detectLineSeparator(doc)
    const opts = this.opts
    const editorKeys = [
      {
        key: 'Tab',
        run: () => {
          if (this.hasGhost())
            return this.acceptGhost()
          const sel = this.view.state.selection.main
          const line = this.view.state.doc.lineAt(sel.head)
          if (!sel.empty || /^\s*(?:[-*+]|\d+[.)])\s/.test(line.text))
            return indentMore(this.view)
          this.view.dispatch(this.view.state.replaceSelection('  '))
          return true
        },
        shift: indentLess,
      },
      {
        key: 'Escape',
        run: () => {
          if (this.hasGhost()) {
            this.clearGhost()
            return true
          }
          return false
        },
      },
    ]

    return EditorState.create({
      doc,
      extensions: [
        sep ? [EditorState.lineSeparator.of(sep), sep === '\n' ? [] : normalizeInsertedLineBreaks()] : [],
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        markdownHighlighting,
        history(),
        drawSelection(),
        dropCursor(),
        closeBrackets(),
        search({ top: true }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        placeholder(opts.placeholder ?? '开始写作…'),
        Prec.highest(keymap.of(editorKeys)),
        keymap.of([...closeBracketsKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        ghostField,
        livePreviewConfig.of(opts.preview),
        this.sourceComp.of(this.sourceMode ? EditorView.editorAttributes.of({ class: 'cm-source-mode' }) : livePreview()),
        this.focusComp.of(this.focus_ ? focusMode() : []),
        this.typewriterComp.of(this.typewriter ? typewriterMode() : []),
        // 专注模式只留正文：空行「+」这种不请自来的入口隐藏（选区工具栏是用户主动触发的，保留）
        this.insertComp.of(this.focus_ || !opts.onInsertButton ? [] : this.insertPlugin),
        EditorView.updateListener.of((u) => {
          for (const fn of this.updateListeners)
            fn(u)
          if (u.docChanged && !u.transactions.some(tr => tr.annotation(loadAnnotation)))
            opts.onDocChange?.()
          if (u.selectionSet || u.docChanged)
            opts.onSelectionChange?.()
        }),
        EditorView.domEventHandlers({
          paste: (e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
            if (files.length && opts.onPasteFiles?.(files)) {
              e.preventDefault()
              return true
            }
            return false
          },
          drop: (e) => {
            if (e.dataTransfer?.files?.length && opts.onDropFiles?.(e)) {
              e.preventDefault()
              return true
            }
            return false
          },
          contextmenu: (e, view) => {
            if (!opts.onContextMenu)
              return false
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
            // 与 Typora 一致：右键点在选区外时先把光标移过去
            if (pos != null && !view.state.selection.ranges.some(r => r.from <= pos && r.to >= pos && !r.empty))
              view.dispatch({ selection: EditorSelection.cursor(pos) })
            const el = e.target as HTMLElement
            const img = el.closest('.cm-lp-image')?.querySelector('img')
            const href = el.closest('[data-href]')?.getAttribute('data-href') || null
            const at = pos == null ? null : linkContextAt(view.state, pos)
            e.preventDefault()
            opts.onContextMenu({
              hasSelection: view.state.selection.ranges.some(r => !r.empty),
              linkUrl: href ?? (at?.kind === 'link' ? at.url : null),
              imageUrl: at?.kind === 'image' ? at.url : (img ? img.getAttribute('src') : null),
            })
            return true
          },
          mousedown: (e, view) => {
            if (!(e.metaKey || e.ctrlKey) || e.button !== 0)
              return false
            const el = (e.target as HTMLElement).closest('[data-href]')
            let url = el?.getAttribute('data-href') || null
            if (!url) {
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
              url = pos == null ? null : linkAt(view.state, pos)
            }
            if (url) {
              e.preventDefault()
              opts.openLink?.(url)
              return true
            }
            return false
          },
        }),
      ],
    })
  }

  // ------------------------------------------------------------------ 文档

  /** 载入文件内容：新建编辑状态（撤销历史清空），不触发保存 */
  loadDocument(content: string) {
    this.view.setState(this.createState(content))
    this.view.scrollDOM.scrollTop = 0
    // setState 之后的首次测量可能恢复旧的滚动锚点，显式滚回文首
    this.view.dispatch({ effects: EditorView.scrollIntoView(0, { y: 'start' }) })
  }

  /** 注意用 sliceDoc：它会用文件原本的换行符（CRLF 文件保持 CRLF）拼接 */
  getValue(): string {
    return this.view.state.sliceDoc()
  }

  /** 用户级别的整体替换（可撤销，会触发自动保存） */
  setValue(content: string) {
    if (this.getValue() === content)
      return
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content },
      selection: EditorSelection.cursor(Math.min(this.view.state.selection.main.head, content.length)),
      userEvent: 'input.replace',
    })
  }

  // ------------------------------------------------------------------ 兼容 CM5 的接口

  getSelection(): string {
    const { from, to } = this.view.state.selection.main
    return this.view.state.sliceDoc(from, to)
  }

  somethingSelected(): boolean {
    return this.view.state.selection.ranges.some(r => !r.empty)
  }

  replaceSelection(text: string, select: 'end' | 'around' | 'start' = 'end') {
    const { from } = this.view.state.selection.main
    const spec: TransactionSpec = this.view.state.replaceSelection(text)
    if (select === 'around')
      spec.selection = EditorSelection.range(from, from + text.length)
    else if (select === 'start')
      spec.selection = EditorSelection.cursor(from)
    this.view.dispatch({ ...spec, userEvent: 'input', scrollIntoView: true })
  }

  private toOffset(pos: CM5Pos): number {
    const doc = this.view.state.doc
    const lineNo = Math.min(Math.max(pos.line + 1, 1), doc.lines)
    const line = doc.line(lineNo)
    return Math.min(line.from + Math.max(pos.ch, 0), line.to)
  }

  getCursor(): CM5Pos {
    const head = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(head)
    return { line: line.number - 1, ch: head - line.from }
  }

  setCursor(pos: CM5Pos) {
    this.view.dispatch({ selection: EditorSelection.cursor(this.toOffset(pos)), scrollIntoView: true })
  }

  replaceRange(text: string, from: CM5Pos, to?: CM5Pos) {
    const a = this.toOffset(from)
    const b = to ? this.toOffset(to) : a
    this.view.dispatch({ changes: { from: a, to: b, insert: text }, userEvent: 'input' })
  }

  lineCount(): number {
    return this.view.state.doc.lines
  }

  getLine(n: number): string {
    return this.view.state.doc.line(n + 1).text
  }

  focus() {
    this.view.focus()
  }

  refresh() {
    this.view.requestMeasure()
  }

  // ------------------------------------------------------------------ 命令

  exec(cmd: FormatCommand) {
    const state = this.view.state
    let spec: TransactionSpec
    switch (cmd) {
      case 'bold': spec = toggleInline(state, '**'); break
      case 'italic': spec = toggleInline(state, '*'); break
      case 'strike': spec = toggleInline(state, '~~'); break
      case 'code': spec = toggleInline(state, '`'); break
      case 'link': spec = insertLink(state); break
      case 'image': spec = insertLink(state, true); break
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        spec = setHeading(state, Number(cmd.slice(1))); break
      case 'paragraph': spec = setHeading(state, 0); break
      case 'quote': spec = toggleQuote(state); break
      case 'ol': case 'ul': case 'task': spec = toggleList(state, cmd); break
      case 'codeBlock': spec = insertCodeBlock(state); break
      case 'hr': spec = insertBlock(state, '---\n'); break
      default: return
    }
    this.view.dispatch({ ...spec, userEvent: 'input.format', scrollIntoView: true })
    this.view.focus()
  }

  /** 插入菜单里没有对应菜单命令的块（表格模板、Mermaid） */
  insertSnippet(kind: Extract<InsertKind, 'table' | 'mermaid'>) {
    this.view.dispatch({ ...insertSnippet(this.view.state, kind), userEvent: 'input.format', scrollIntoView: true })
    this.view.focus()
  }

  /** 订阅视图更新（浮动工具栏等界面元素用） */
  onUpdate(fn: (u: ViewUpdate) => void): () => void {
    this.updateListeners.add(fn)
    return () => this.updateListeners.delete(fn)
  }

  pinInsertButton(pinned: boolean) {
    pinInsertButton(this.view, this.insertPlugin, pinned)
  }

  undo() {
    undo(this.view)
  }

  redo() {
    redo(this.view)
  }

  openSearch() {
    openSearchPanel(this.view)
  }

  // ------------------------------------------------------------------ 模式

  isSourceMode() {
    return this.sourceMode
  }

  setSourceMode(on: boolean) {
    this.sourceMode = on
    this.view.dispatch({
      effects: this.sourceComp.reconfigure(on ? EditorView.editorAttributes.of({ class: 'cm-source-mode' }) : livePreview()),
    })
  }

  setFocusMode(on: boolean) {
    this.focus_ = on
    this.view.dispatch({
      effects: [
        this.focusComp.reconfigure(on ? focusMode() : []),
        this.insertComp.reconfigure(on || !this.opts.onInsertButton ? [] : this.insertPlugin),
      ],
    })
  }

  setTypewriterMode(on: boolean) {
    this.typewriter = on
    this.view.dispatch({ effects: this.typewriterComp.reconfigure(on ? typewriterMode() : []) })
    if (on)
      this.view.dispatch({ effects: EditorView.scrollIntoView(this.view.state.selection.main.head, { y: 'center' }) })
  }

  // ------------------------------------------------------------------ 定位

  /** 跳到某一行（0-based），把它放在窗口靠上的位置 */
  scrollToLine(line: number, focus = true) {
    const doc = this.view.state.doc
    const pos = doc.line(Math.min(Math.max(line + 1, 1), doc.lines)).from
    this.view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 48 }),
    })
    if (focus)
      this.view.focus()
  }

  /** 窗口顶部附近的那一行（0-based），用于大纲高亮 */
  topVisibleLine(): number {
    const rect = this.view.scrollDOM.getBoundingClientRect()
    const pos = this.view.posAtCoords({ x: rect.left + rect.width / 2, y: rect.top + 72 }, false)
    return this.view.state.doc.lineAt(pos).number - 1
  }

  cursorLine(): number {
    return this.view.state.doc.lineAt(this.view.state.selection.main.head).number - 1
  }

  scrollRatio(): number {
    const el = this.view.scrollDOM
    const max = el.scrollHeight - el.clientHeight
    return max > 0 ? el.scrollTop / max : 0
  }

  // ------------------------------------------------------------------ AI 灰色建议

  showGhost(text: string) {
    this.view.dispatch({ effects: setGhost.of({ pos: this.view.state.selection.main.head, text }) })
  }

  clearGhost() {
    if (this.hasGhost())
      this.view.dispatch({ effects: setGhost.of(null) })
  }

  hasGhost(): boolean {
    return !!this.view.state.field(ghostField, false)
  }

  acceptGhost(): boolean {
    const g = this.view.state.field(ghostField, false)
    if (!g)
      return false
    this.view.dispatch({
      changes: { from: g.pos, insert: g.text },
      selection: EditorSelection.cursor(g.pos + g.text.length),
      effects: setGhost.of(null),
      userEvent: 'input.ai',
      scrollIntoView: true,
    })
    return true
  }

  destroy() {
    this.view.destroy()
  }
}

/** 仅用于测试：用和编辑器相同的方式创建状态（含换行符处理） */
export function createDocumentState(doc: string): EditorState {
  const sep = detectLineSeparator(doc)
  return EditorState.create({
    doc,
    extensions: [
      sep ? [EditorState.lineSeparator.of(sep), sep === '\n' ? [] : normalizeInsertedLineBreaks()] : [],
      markdown({ base: markdownLanguage }),
      livePreview(),
    ],
  })
}
