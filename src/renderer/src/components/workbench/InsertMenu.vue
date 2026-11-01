<script setup lang="ts">
/**
 * 空行「+」弹出的插入菜单。键盘：↑↓ 选择、Enter 插入、Esc 关闭。
 * 有对应菜单命令的项（标题、列表、引用、代码块、图片、分割线）走 runCommand，与菜单行为一致；
 * 表格模板和 Mermaid 用编辑器事务插入。两种方式都可撤销。
 */
import type { MarkdownEditor } from '@renderer/editor'
import { INSERT_ITEMS, type InsertItem } from '@renderer/editor/affordances'
import { Heading1, Heading2, Heading3, Image, List, ListOrdered, ListTodo, Minus, SquareCode, Table, TextQuote, Workflow } from 'lucide-vue-next'

const props = defineProps<{ editor: MarkdownEditor | null }>()
const emit = defineEmits<{ run: [id: string] }>()

const ICONS: Record<string, any> = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  ul: List,
  ol: ListOrdered,
  task: ListTodo,
  quote: TextQuote,
  codeBlock: SquareCode,
  table: Table,
  image: Image,
  hr: Minus,
  mermaid: Workflow,
}
// 分组之间画细线：标题 | 列表 / 引用 | 块
const GROUP_START = new Set(['ul', 'codeBlock'])

const open = ref(false)
const index = ref(0)
const pos = ref({ left: 0, top: 0 })
const root = ref<HTMLElement>()
const MENU_W = 220
const MENU_H = 12 * 32 + 2 * 9 + 12

async function show(anchor: DOMRect) {
  // 默认在「+」下方、与正文左边缘对齐；下方放不下时放到上方
  const below = anchor.bottom + 6
  const top = below + MENU_H > window.innerHeight - 12 ? Math.max(12, anchor.top - 6 - MENU_H) : below
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - MENU_W - 12)
  pos.value = { left, top }
  index.value = 0
  open.value = true
  props.editor?.pinInsertButton(true)
  await nextTick()
  root.value?.focus()
}

function close(refocus = true) {
  if (!open.value)
    return
  open.value = false
  props.editor?.pinInsertButton(false)
  if (refocus)
    props.editor?.focus()
}

function choose(item: InsertItem) {
  close()
  if (item.command)
    emit('run', item.command)
  else if (item.kind === 'table' || item.kind === 'mermaid')
    props.editor?.insertSnippet(item.kind)
}

function onKeydown(e: KeyboardEvent) {
  const n = INSERT_ITEMS.length
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
    index.value = (index.value + 1) % n
  }
  else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
    index.value = (index.value - 1 + n) % n
  }
  else if (e.key === 'Home') {
    index.value = 0
  }
  else if (e.key === 'End') {
    index.value = n - 1
  }
  else if (e.key === 'Enter' || e.key === ' ') {
    choose(INSERT_ITEMS[index.value])
  }
  else if (e.key === 'Escape') {
    close()
  }
  else {
    return
  }
  e.preventDefault()
  e.stopPropagation()
}

onClickOutside(root, () => close(false))
useEventListener(window, 'resize', () => close(false))

defineExpose({ show, close, isOpen: () => open.value })
</script>

<template>
  <Transition name="lb-im">
    <div
      v-if="open"
      ref="root"
      class="lb-im"
      role="menu"
      aria-label="插入"
      tabindex="-1"
      :aria-activedescendant="`lb-im-${INSERT_ITEMS[index].kind}`"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${MENU_W}px` }"
      @keydown="onKeydown"
      @blur="close(false)"
    >
      <template v-for="(item, i) in INSERT_ITEMS" :key="item.kind">
        <div v-if="GROUP_START.has(item.kind)" class="lb-im-sep" role="separator" />
        <div
          :id="`lb-im-${item.kind}`"
          class="lb-im-item"
          :class="{ 'is-active': i === index }"
          role="menuitem"
          :data-kind="item.kind"
          @mousemove="index = i"
          @mousedown.prevent
          @click="choose(item)"
        >
          <component :is="ICONS[item.kind]" class="lb-im-icon" :size="15" :stroke-width="1.75" />
          <span class="lb-im-label">{{ item.label }}</span>
          <span class="lb-im-hint">{{ item.hint }}</span>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.lb-im {
  position: fixed;
  z-index: 60;
  padding: 6px;
  border-radius: 10px;
  background: var(--lb-popover-bg);
  border: 1px solid var(--lb-border-strong);
  box-shadow: var(--lb-shadow);
  font-family: var(--lb-ui-font);
  font-size: 13px;
  color: var(--lb-fg);
  outline: none;
  user-select: none;
}

.lb-im-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  padding: 0 10px 0 9px;
  border-radius: 6px;
  cursor: pointer;
}

.lb-im-item.is-active {
  background: var(--lb-active);
  color: var(--lb-fg-strong);
}

.lb-im-icon {
  flex-shrink: 0;
  color: var(--lb-muted);
}

.lb-im-item.is-active .lb-im-icon {
  color: var(--lb-fg-strong);
}

.lb-im-label {
  flex: 1;
  white-space: nowrap;
}

.lb-im-hint {
  font-family: var(--lb-mono);
  font-size: 11px;
  color: var(--lb-faint);
  white-space: pre;
}

.lb-im-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--lb-border);
}

.lb-im-enter-active,
.lb-im-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.lb-im-enter-from,
.lb-im-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
