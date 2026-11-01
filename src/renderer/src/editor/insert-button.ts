/**
 * 空行左侧的「+」：光标停在空行（且不在代码块 / Front Matter / 表格里）时，在正文列左边显示，
 * 点击后由外部弹出插入菜单。按钮是挂在 .cm-scroller 上的一个绝对定位元素（不进文档、不影响光标）。
 */
import { type EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { emptyLineEligible } from './affordances'

export interface InsertButtonOptions {
  /** 点击「+」：anchor 为按钮的视口坐标 */
  onOpen: (anchor: DOMRect) => void
}

const PLUS_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>'

class InsertButton implements PluginValue {
  readonly dom: HTMLButtonElement
  pinned = false

  constructor(readonly view: EditorView, opts: InsertButtonOptions) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cm-lb-insert-btn'
    btn.tabIndex = -1
    btn.title = '插入（标题、列表、表格、图片…）'
    btn.setAttribute('aria-label', '插入块')
    btn.setAttribute('aria-haspopup', 'menu')
    btn.innerHTML = PLUS_SVG
    // 不抢编辑器焦点：光标保持在空行上，插入时就知道位置
    btn.addEventListener('mousedown', e => e.preventDefault())
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      opts.onOpen(btn.getBoundingClientRect())
    })
    this.dom = btn
    view.scrollDOM.appendChild(btn)
    this.schedule()
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.focusChanged || u.geometryChanged || u.viewportChanged)
      this.schedule()
  }

  schedule() {
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        if (!emptyLineEligible(view.state) || (!view.hasFocus && !this.pinned))
          return null
        const line = view.state.doc.lineAt(view.state.selection.main.head)
        const coords = view.coordsAtPos(line.from)
        if (!coords)
          return null
        const box = view.scrollDOM.getBoundingClientRect()
        return {
          top: (coords.top + coords.bottom) / 2 - box.top + view.scrollDOM.scrollTop,
          left: coords.left - box.left + view.scrollDOM.scrollLeft,
        }
      },
      write: (m) => {
        this.dom.classList.toggle('is-visible', !!m)
        this.dom.classList.toggle('is-pinned', this.pinned)
        if (m) {
          this.dom.style.top = `${Math.round(m.top)}px`
          this.dom.style.left = `${Math.round(m.left)}px`
        }
      },
    })
  }

  destroy() {
    this.dom.remove()
  }
}

export function insertButton(opts: InsertButtonOptions) {
  return ViewPlugin.define(view => new InsertButton(view, opts))
}

/** 插入菜单打开期间让「+」保持显示（焦点在菜单里时编辑器已失焦） */
export function pinInsertButton(view: EditorView, plugin: ViewPlugin<InsertButton>, pinned: boolean) {
  const inst = view.plugin(plugin)
  if (inst) {
    inst.pinned = pinned
    inst.schedule()
  }
}
