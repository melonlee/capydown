<script setup lang="ts">
/**
 * 选区浮动工具栏：选中文字后在选区上方（离顶部太近时在下方）出现。
 * 按钮执行的就是菜单里的同一条命令（emit('run', id) → runCommand），撤销、行为与菜单完全一致。
 * 输入法组合中、拖动选择中、正在输入、Esc、失焦、窗口缩放时都不显示。
 */
import type { ViewUpdate } from '@codemirror/view'
import type { MarkdownEditor } from '@renderer/editor'
import { activeFormats, computeToolbarPosition, type ToolbarCommand } from '@renderer/editor/affordances'
import { Bold, Code, Heading1, Heading2, Heading3, Italic, Link2, Strikethrough, TextQuote } from 'lucide-vue-next'
import { acceleratorFor, COMMAND_MAP, formatAccelerator } from '../../../../shared/commands'

const props = defineProps<{ editor: MarkdownEditor | null, container?: HTMLElement }>()
const emit = defineEmits<{ run: [id: string] }>()

const isMac = /Mac/i.test(navigator.userAgent)
const SETTLE_MS = 150

const BUTTONS: { id: ToolbarCommand, label: string, icon: any }[][] = [
  [
    { id: 'fmt.bold', label: '加粗', icon: Bold },
    { id: 'fmt.italic', label: '斜体', icon: Italic },
    { id: 'fmt.strike', label: '删除线', icon: Strikethrough },
    { id: 'fmt.code', label: '行内代码', icon: Code },
    { id: 'fmt.link', label: '链接', icon: Link2 },
  ],
  [
    { id: 'para.h1', label: '标题 1', icon: Heading1 },
    { id: 'para.h2', label: '标题 2', icon: Heading2 },
    { id: 'para.h3', label: '标题 3', icon: Heading3 },
  ],
  [
    { id: 'para.quote', label: '引用', icon: TextQuote },
  ],
]

function tip(id: string, label: string) {
  const c = COMMAND_MAP[id]
  const acc = c && acceleratorFor(c, isMac)
  return acc ? `${label}  ${formatAccelerator(acc, isMac)}` : label
}

const visible = ref(false)
const placement = ref<'above' | 'below'>('above')
const pos = ref({ x: 0, y: 0 })
const active = ref(new Set<ToolbarCommand>())
const root = ref<HTMLElement>()

let timer = 0
let pointerDown = false
let composing = false
let selfAction = false
let frame = 0

function hide() {
  clearTimeout(timer)
  visible.value = false
}

function view() {
  return props.editor?.view ?? null
}

function canShow() {
  const v = view()
  if (!v || !props.container)
    return false
  const toolbarFocused = !!root.value && root.value.contains(document.activeElement)
  return (v.hasFocus || toolbarFocused) && !composing && !v.composing && !pointerDown && !v.state.selection.main.empty
}

function measure() {
  const v = view()
  if (!v || !props.container)
    return false
  const { from, to } = v.state.selection.main
  const start = v.coordsAtPos(from, 1)
  const end = v.coordsAtPos(to, -1)
  if (!start || !end)
    return false
  const scroller = v.scrollDOM.getBoundingClientRect()
  const host = props.container.getBoundingClientRect()
  const content = v.contentDOM.getBoundingClientRect()
  const sameLine = Math.abs(start.top - end.top) < 4
  const size = { width: root.value?.offsetWidth || 320, height: root.value?.offsetHeight || 34 }
  const p = computeToolbarPosition(
    { top: start.top, bottom: end.bottom, centerX: sameLine ? (start.left + end.right) / 2 : (content.left + content.right) / 2 },
    size,
    { left: scroller.left, top: scroller.top, right: scroller.right, bottom: scroller.bottom },
  )
  if (p.hidden)
    return false
  placement.value = p.placement
  pos.value = { x: p.x + scroller.left - host.left, y: p.y + scroller.top - host.top }
  return true
}

async function show() {
  if (!canShow())
    return hide()
  active.value = activeFormats(view()!.state)
  visible.value = true
  await nextTick()
  if (!measure())
    hide()
}

function schedule(delay = SETTLE_MS) {
  clearTimeout(timer)
  timer = window.setTimeout(show, delay)
}

function reposition() {
  if (!visible.value)
    return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!measure())
      hide()
  })
}

function onUpdate(u: ViewUpdate) {
  if (u.docChanged) {
    // 自己的按钮触发的改动：在新位置刷新激活状态；其余（输入、粘贴…）一律隐藏
    if (selfAction) {
      selfAction = false
      schedule(0)
    }
    else {
      hide()
    }
    return
  }
  if (u.selectionSet) {
    if (u.state.selection.main.empty || pointerDown)
      hide()
    else
      schedule()
  }
  else if (u.focusChanged && !u.view.hasFocus) {
    // 焦点移到工具栏本身（键盘操作）时保留
    setTimeout(() => {
      if (!root.value?.contains(document.activeElement))
        hide()
    })
  }
  else if (u.geometryChanged || u.viewportChanged) {
    reposition()
  }
}

function onPointerDown(e: MouseEvent) {
  if (e.button !== 0)
    return
  pointerDown = true
  hide()
}
function onPointerUp() {
  if (!pointerDown)
    return
  pointerDown = false
  schedule()
}
function onCompositionStart() {
  composing = true
  hide()
}
function onCompositionEnd() {
  composing = false
}
function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value)
    hide()
}

function run(id: ToolbarCommand) {
  selfAction = true
  emit('run', id)
  // 命令没有产生改动（比如编辑器不可用）时别让标记残留到下一次输入
  setTimeout(() => (selfAction = false), 0)
}

function onToolbarKeydown(e: KeyboardEvent) {
  const buttons = Array.from(root.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    hide()
    view()?.focus()
  }
}

let unsubscribe: (() => void) | null = null
let bound: { content: HTMLElement, scroller: HTMLElement, dom: HTMLElement } | null = null

function bind(editor: MarkdownEditor | null) {
  unbind()
  if (!editor)
    return
  unsubscribe = editor.onUpdate(onUpdate)
  const v = editor.view
  bound = { content: v.contentDOM, scroller: v.scrollDOM, dom: v.dom }
  bound.content.addEventListener('mousedown', onPointerDown)
  bound.content.addEventListener('compositionstart', onCompositionStart)
  bound.content.addEventListener('compositionend', onCompositionEnd)
  bound.scroller.addEventListener('scroll', reposition, { passive: true })
  bound.dom.addEventListener('keydown', onEditorKeydown, true)
}

function unbind() {
  unsubscribe?.()
  unsubscribe = null
  if (bound) {
    bound.content.removeEventListener('mousedown', onPointerDown)
    bound.content.removeEventListener('compositionstart', onCompositionStart)
    bound.content.removeEventListener('compositionend', onCompositionEnd)
    bound.scroller.removeEventListener('scroll', reposition)
    bound.dom.removeEventListener('keydown', onEditorKeydown, true)
    bound = null
  }
}

watch(() => props.editor, bind, { immediate: true })
onMounted(() => {
  window.addEventListener('mouseup', onPointerUp, true)
  window.addEventListener('resize', hide)
})
onBeforeUnmount(() => {
  unbind()
  clearTimeout(timer)
  window.removeEventListener('mouseup', onPointerUp, true)
  window.removeEventListener('resize', hide)
})

defineExpose({ hide })
</script>

<template>
  <Transition name="lb-ft">
    <div
      v-if="visible"
      ref="root"
      class="lb-ft"
      :class="`is-${placement}`"
      role="toolbar"
      aria-label="文本格式"
      :style="{ transform: `translate(${pos.x}px, ${pos.y}px)` }"
      @mousedown.prevent
      @keydown="onToolbarKeydown"
    >
      <template v-for="(group, gi) in BUTTONS" :key="gi">
        <span v-if="gi > 0" class="lb-ft-sep" aria-hidden="true" />
        <button
          v-for="b in group"
          :key="b.id"
          type="button"
          class="lb-ft-btn"
          :class="{ 'is-active': active.has(b.id) }"
          :aria-label="b.label"
          :aria-pressed="active.has(b.id)"
          :data-tip="tip(b.id, b.label)"
          :data-cmd="b.id"
          @click="run(b.id)"
        >
          <component :is="b.icon" :size="15" :stroke-width="2" />
        </button>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.lb-ft {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 1px;
  height: 34px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--lb-accent);
  color: var(--lb-accent-fg);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.16),
    0 2px 6px rgba(0, 0, 0, 0.1),
    0 0 0 0.5px rgba(0, 0, 0, 0.18);
  font-family: var(--lb-ui-font);
  user-select: none;
  will-change: transform, opacity;
}

:global(:root[data-lb-theme='night']) .lb-ft {
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.5),
    0 2px 6px rgba(0, 0, 0, 0.35);
}

.lb-ft-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--lb-accent-fg) 72%, transparent);
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
}

.lb-ft-btn:hover {
  color: var(--lb-accent-fg);
  background: color-mix(in srgb, var(--lb-accent-fg) 13%, transparent);
}

.lb-ft-btn.is-active {
  color: var(--lb-accent-fg);
  background: color-mix(in srgb, var(--lb-accent-fg) 20%, transparent);
}

.lb-ft-btn:focus-visible {
  outline: 1.5px solid color-mix(in srgb, var(--lb-accent-fg) 70%, transparent);
  outline-offset: -1.5px;
}

.lb-ft-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: color-mix(in srgb, var(--lb-accent-fg) 20%, transparent);
}

/* 提示：标签 + 快捷键，悬停稍等后出现在工具栏外侧（不遮挡选中的文字） */
.lb-ft-btn::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 9px);
  transform: translate(-50%, 2px);
  padding: 4px 8px;
  border-radius: 6px;
  white-space: pre;
  font-size: 11.5px;
  line-height: 1.3;
  letter-spacing: 0.02em;
  color: var(--lb-fg-strong);
  background: var(--lb-popover-bg);
  border: 1px solid var(--lb-border-strong);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s, transform 0.12s;
}

.lb-ft.is-below .lb-ft-btn::after {
  bottom: auto;
  top: calc(100% + 9px);
  transform: translate(-50%, -2px);
}

.lb-ft-btn:hover::after,
.lb-ft-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
  transition-delay: 0.35s;
}

.lb-ft-enter-active,
.lb-ft-leave-active {
  transition: opacity 0.12s ease;
}

.lb-ft-enter-from,
.lb-ft-leave-to {
  opacity: 0;
}
</style>
