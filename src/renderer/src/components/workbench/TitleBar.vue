<script setup lang="ts">
/**
 * 极简标题栏（macOS hiddenInset）：居中显示文档名，未保存时带小圆点；
 * 点击文档名可直接重命名。右侧只有一个低调的「公众号」开关。
 */
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { Smartphone } from 'lucide-vue-next'

const props = defineProps<{ renaming: boolean }>()
const emit = defineEmits<{
  'update:renaming': [value: boolean]
  'rename': [name: string]
  'toggleWechat': []
}>()

const wb = useWorkbenchStore()
const input = ref<HTMLInputElement>()
const draft = ref('')
const isMac = /Mac/i.test(navigator.userAgent)

watch(() => props.renaming, async (on) => {
  if (on) {
    draft.value = wb.docName
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
})

function commit() {
  const name = draft.value.trim()
  emit('update:renaming', false)
  if (name && name !== wb.docName)
    emit('rename', name)
}

function startRename() {
  if (wb.docPath)
    emit('update:renaming', true)
}
</script>

<template>
  <header class="lb-titlebar draggable-area" :class="{ 'is-mac': isMac }">
    <div class="lb-titlebar-center">
      <input
        v-if="renaming"
        ref="input"
        v-model="draft"
        class="lb-rename no-drag"
        spellcheck="false"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="emit('update:renaming', false)"
        @blur="commit"
      >
      <template v-else>
        <span
          class="lb-docname no-drag"
          :class="{ 'is-empty': !wb.docName }"
          :title="wb.docPath ? `${wb.docPath}\n点击重命名` : ''"
          @click="startRename"
        >{{ wb.docName || 'LazyBox' }}</span>
        <span v-if="wb.dirty" class="lb-dirty" title="有未保存的修改" />
      </template>
    </div>
    <div class="lb-titlebar-right no-drag">
      <button
        class="lb-chip"
        :class="{ 'is-active': wb.wechatOpen }"
        :title="`公众号预览（${isMac ? '⌥⌘P' : 'Ctrl+Alt+P'}）`"
        @click="emit('toggleWechat')"
      >
        <Smartphone class="size-3.5" />
        <span>公众号</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.lb-titlebar {
  position: relative;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lb-chrome-bg);
  color: var(--lb-muted);
  user-select: none;
  z-index: 20;
}

.lb-titlebar-center {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 50%;
  min-width: 0;
}

.lb-docname {
  font-size: 13px;
  font-weight: 500;
  color: var(--lb-fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: default;
  transition: background-color 0.15s;
}

.lb-docname:hover {
  background: var(--lb-hover);
}

.lb-docname.is-empty {
  color: var(--lb-muted);
}

.lb-dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lb-muted);
  flex-shrink: 0;
}

.lb-rename {
  width: 280px;
  font-size: 13px;
  text-align: center;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--lb-border-strong);
  background: var(--lb-bg);
  color: var(--lb-fg);
  outline: none;
}

.lb-rename:focus {
  border-color: var(--lb-fg-strong);
  box-shadow: 0 0 0 3px var(--lb-focus-ring);
}

.lb-titlebar-right {
  position: absolute;
  right: 12px;
  top: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
}

.lb-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--lb-muted);
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.lb-chip:hover {
  background: var(--lb-hover);
  color: var(--lb-fg);
}

.lb-chip.is-active {
  color: var(--lb-fg-strong);
  background: var(--lb-active);
}
</style>
