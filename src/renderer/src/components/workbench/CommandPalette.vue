<script setup lang="ts">
/**
 * 统一面板：
 * - ⌘P 快速打开：模糊搜索工作区里的文件（输入 ">" 切到命令）
 * - ⇧⌘P 命令面板：所有菜单命令 + AI 命令
 * - ⌘K AI 命令：续写、润色、扩写、翻译…（与原来的 AI 面板一致）
 */
import type { FileNode } from '@renderer/types'
import { fuzzyScore } from '@renderer/editor/markdown-utils'
import { useFileTreeStore } from '@renderer/stores/fileTree'
import { FileImage, FileText, Search, Sparkles, TerminalSquare } from 'lucide-vue-next'

export interface PaletteItem {
  id: string
  label: string
  group: string
  hint?: string
  shortcut?: string
}

export type PaletteMode = 'files' | 'commands' | 'ai'

const props = defineProps<{
  modelValue: boolean
  mode: PaletteMode
  commands: PaletteItem[]
  aiCommands: PaletteItem[]
  recentFiles: string[]
  currentPath: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'openFile': [node: FileNode]
  'run': [id: string]
}>()

const fileTree = useFileTreeStore()
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()

const effectiveMode = computed<PaletteMode>(() => {
  if (props.mode === 'files' && query.value.startsWith('>'))
    return 'commands'
  return props.mode
})
const q = computed(() => query.value.replace(/^>\s*/, ''))

interface Row {
  key: string
  label: string
  hint?: string
  shortcut?: string
  group?: string
  kind: 'file' | 'image' | 'command' | 'ai'
  node?: FileNode
  id?: string
}

function flatFiles(): FileNode[] {
  const out: FileNode[] = []
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file' && /\.(md|markdown|png|jpe?g|gif|webp|svg)$/i.test(n.name))
        out.push(n)
      if (n.children)
        walk(n.children)
    }
  }
  walk(fileTree.fileTree)
  return out
}

function relative(path: string) {
  const root = fileTree.currentWorkspacePath
  const rel = root && path.startsWith(root) ? path.slice(root.length + 1) : path
  const parts = rel.split('/')
  parts.pop()
  return parts.join(' / ')
}

const rows = computed<Row[]>(() => {
  if (effectiveMode.value === 'files') {
    const files = flatFiles()
    const toRow = (n: FileNode): Row => ({
      key: n.path,
      label: n.name.replace(/\.(md|markdown)$/i, ''),
      hint: relative(n.path),
      kind: /\.(md|markdown)$/i.test(n.name) ? 'file' : 'image',
      node: n,
    })
    if (!q.value) {
      const recentRank = new Map(props.recentFiles.map((p, i) => [p, i]))
      return files
        .filter(n => n.path !== props.currentPath)
        .sort((a, b) => (recentRank.get(a.path) ?? 999) - (recentRank.get(b.path) ?? 999) || a.name.localeCompare(b.name, 'zh'))
        .slice(0, 50)
        .map(toRow)
    }
    return files
      .map(n => ({ n, s: Math.max(fuzzyScore(q.value, n.name) + 50, fuzzyScore(q.value, relative(n.path) + n.name)) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map(x => toRow(x.n))
  }
  const source = effectiveMode.value === 'ai' ? props.aiCommands : [...props.commands, ...props.aiCommands]
  const kind = (item: PaletteItem): Row['kind'] => (item.group === 'AI' ? 'ai' : 'command')
  if (!q.value)
    return source.map(c => ({ key: c.id, id: c.id, label: c.label, hint: c.hint, shortcut: c.shortcut, group: c.group, kind: kind(c) }))
  return source
    .map(c => ({ c, s: Math.max(fuzzyScore(q.value, c.label), fuzzyScore(q.value, `${c.group} ${c.label} ${c.hint ?? ''}`) - 10) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(({ c }) => ({ key: c.id, id: c.id, label: c.label, hint: c.hint, shortcut: c.shortcut, group: c.group, kind: kind(c) }))
})

const placeholder = computed(() => {
  if (props.mode === 'ai')
    return '让 AI 帮你：续写、润色、扩写、翻译…'
  if (props.mode === 'commands')
    return '输入命令…'
  return '搜索文件，输入 > 执行命令'
})

watch(() => props.modelValue, async (open) => {
  if (open) {
    query.value = props.mode === 'commands' ? '' : ''
    index.value = 0
    await nextTick()
    input.value?.focus()
  }
})

watch(query, () => (index.value = 0))

watch(index, async () => {
  await nextTick()
  list.value?.querySelector<HTMLElement>('.is-selected')?.scrollIntoView({ block: 'nearest' })
})

function close() {
  emit('update:modelValue', false)
}

function choose(row?: Row) {
  if (!row)
    return
  close()
  if (row.node)
    emit('openFile', row.node)
  else if (row.id)
    emit('run', row.id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing)
    return
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
    e.preventDefault()
    index.value = Math.min(index.value + 1, rows.value.length - 1)
  }
  else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
    e.preventDefault()
    index.value = Math.max(index.value - 1, 0)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    choose(rows.value[index.value])
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="lb-palette">
      <div v-if="modelValue" class="lb-palette-overlay" @mousedown.self="close">
        <div class="lb-palette" role="dialog" aria-label="命令面板" @keydown="onKeydown">
          <div class="lb-palette-input">
            <Sparkles v-if="mode === 'ai'" class="size-4 lb-palette-lead is-ai" />
            <TerminalSquare v-else-if="effectiveMode === 'commands'" class="size-4 lb-palette-lead" />
            <Search v-else class="size-4 lb-palette-lead" />
            <input
              ref="input"
              v-model="query"
              :placeholder="placeholder"
              spellcheck="false"
              autocomplete="off"
            >
          </div>
          <div ref="list" class="lb-palette-list">
            <div
              v-for="(row, i) in rows"
              :key="row.key"
              class="lb-palette-row"
              :class="{ 'is-selected': i === index }"
              @mousemove="index = i"
              @click="choose(row)"
            >
              <FileText v-if="row.kind === 'file'" class="size-4 lb-row-icon" />
              <FileImage v-else-if="row.kind === 'image'" class="size-4 lb-row-icon" />
              <Sparkles v-else-if="row.kind === 'ai'" class="size-4 lb-row-icon is-ai" />
              <span v-else class="lb-row-group">{{ row.group }}</span>
              <span class="lb-row-label">{{ row.label }}</span>
              <span v-if="row.hint" class="lb-row-hint">{{ row.hint }}</span>
              <kbd v-if="row.shortcut" class="lb-row-kbd">{{ row.shortcut }}</kbd>
            </div>
            <div v-if="!rows.length" class="lb-palette-empty">
              {{ mode === 'ai' ? '没有匹配的 AI 命令（部分命令需要先选中文字）' : '没有找到匹配的结果' }}
            </div>
          </div>
          <div class="lb-palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>↵</kbd> {{ effectiveMode === 'files' ? '打开' : '执行' }}</span>
            <span><kbd>esc</kbd> 关闭</span>
            <span v-if="mode === 'files'" class="ml-auto"><kbd>&gt;</kbd> 命令</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.lb-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 13vh;
  background: rgba(15, 18, 22, 0.18);
}

.lb-palette {
  width: min(600px, 90vw);
  border-radius: 12px;
  overflow: hidden;
  background: var(--lb-popover-bg);
  border: 1px solid var(--lb-border);
  box-shadow: var(--lb-shadow);
  color: var(--lb-fg);
  font-family: var(--lb-font);
}

:root[data-lb-theme='newsprint'] .lb-palette {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
}

.lb-palette-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 50px;
  border-bottom: 1px solid var(--lb-border);
}

.lb-palette-input input {
  flex: 1;
  height: 100%;
  font-size: 15px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--lb-fg-strong);
}

.lb-palette-input input::placeholder {
  color: var(--lb-faint);
}

.lb-palette-lead {
  color: var(--lb-faint);
  flex-shrink: 0;
}

.is-ai {
  color: var(--lb-accent) !important;
}

.lb-palette-list {
  max-height: min(420px, 55vh);
  overflow-y: auto;
  padding: 6px;
}

.lb-palette-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 13.5px;
  cursor: pointer;
  color: var(--lb-fg);
}

.lb-palette-row.is-selected {
  background: var(--lb-active);
  color: var(--lb-fg-strong);
}

.lb-row-icon {
  flex-shrink: 0;
  color: var(--lb-faint);
}

.lb-row-group {
  flex-shrink: 0;
  min-width: 36px;
  font-size: 11px;
  color: var(--lb-faint);
}

.lb-row-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lb-row-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--lb-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lb-row-kbd {
  margin-left: auto;
  flex-shrink: 0;
  font-family: var(--lb-font);
  font-size: 11.5px;
  letter-spacing: 0.05em;
  color: var(--lb-muted);
}

.lb-palette-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--lb-muted);
}

.lb-palette-foot {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--lb-border);
  font-size: 11.5px;
  color: var(--lb-faint);
}

.lb-palette-foot kbd {
  display: inline-block;
  min-width: 16px;
  margin-right: 3px;
  padding: 0 4px;
  border-radius: 4px;
  border: 1px solid var(--lb-border);
  font-family: var(--lb-font);
  font-size: 10.5px;
  text-align: center;
}

.lb-palette-enter-active,
.lb-palette-leave-active {
  transition: opacity 0.12s ease;
}

.lb-palette-enter-active .lb-palette,
.lb-palette-leave-active .lb-palette {
  transition: transform 0.12s ease;
}

.lb-palette-enter-from,
.lb-palette-leave-to {
  opacity: 0;
}

.lb-palette-enter-from .lb-palette {
  transform: translateY(-6px) scale(0.99);
}
</style>
