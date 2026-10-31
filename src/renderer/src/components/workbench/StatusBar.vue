<script setup lang="ts">
/**
 * Typora 式底部状态栏：左下角侧边栏开关，右下角字数（点击看详情）与源代码模式开关。
 */
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { Code2, PanelLeft } from 'lucide-vue-next'

const emit = defineEmits<{ toggleSidebar: [], toggleSource: [] }>()
const wb = useWorkbenchStore()
const isMac = /Mac/i.test(navigator.userAgent)
const showDetail = ref(false)
const root = ref<HTMLElement>()
onClickOutside(root, () => (showDetail.value = false))

const shown = computed(() => wb.selectionStats ?? wb.stats)
const label = computed(() => {
  const s = shown.value
  return wb.selectionStats ? `已选 ${s.words} 字` : `${s.words.toLocaleString()} 字`
})
const rows = computed(() => {
  const s = shown.value
  return [
    ['字数', s.words.toLocaleString()],
    ['中文字符', s.cjk.toLocaleString()],
    ['英文单词', s.latinWords.toLocaleString()],
    ['字符数（不含空格）', s.characters.toLocaleString()],
    ['字符数（含空格）', s.charactersWithSpaces.toLocaleString()],
    ['段落', s.paragraphs.toLocaleString()],
    ['行数', s.lines.toLocaleString()],
    ['阅读时间', s.readingMinutes ? `约 ${s.readingMinutes} 分钟` : '—'],
  ]
})
</script>

<template>
  <div class="lb-statusbar">
    <button
      class="lb-sb-btn"
      :class="{ 'is-on': wb.sidebarOpen }"
      :title="`侧边栏（${isMac ? '⇧⌘L' : 'Ctrl+Shift+L'}）`"
      @click="emit('toggleSidebar')"
    >
      <PanelLeft class="size-3.5" />
    </button>
    <div class="flex-1" />
    <div v-if="wb.statusBarVisible" ref="root" class="lb-sb-right">
      <transition name="lb-pop">
        <div v-if="showDetail" class="lb-sb-detail">
          <div class="lb-sb-detail-title">
            {{ wb.selectionStats ? '选中内容' : '全文统计' }}
          </div>
          <div v-for="[k, v] in rows" :key="k" class="lb-sb-row">
            <span>{{ k }}</span><span>{{ v }}</span>
          </div>
        </div>
      </transition>
      <button class="lb-sb-btn lb-sb-words" title="点击查看字数统计" @click="showDetail = !showDetail">
        {{ label }}<span v-if="!wb.selectionStats && wb.stats.readingMinutes" class="lb-sb-sub"> · {{ wb.stats.readingMinutes }} 分钟</span>
      </button>
      <button
        class="lb-sb-btn"
        :class="{ 'is-on': wb.sourceMode }"
        :title="`源代码模式（${isMac ? '⌘/' : 'Ctrl+/'}）`"
        @click="emit('toggleSource')"
      >
        <Code2 class="size-3.5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.lb-statusbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 30px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 5;
}

.lb-statusbar > * {
  pointer-events: auto;
}

.lb-sb-right {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}

.lb-sb-btn {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--lb-faint);
  background: color-mix(in srgb, var(--lb-bg) 85%, transparent);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.lb-sb-btn:hover {
  color: var(--lb-fg);
  background: var(--lb-hover);
}

.lb-sb-btn.is-on {
  color: var(--lb-muted);
}

.lb-sb-sub {
  opacity: 0.8;
  white-space: pre;
}

.lb-sb-detail {
  position: absolute;
  right: 0;
  bottom: 30px;
  width: 230px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--lb-popover-bg);
  border: 1px solid var(--lb-border);
  box-shadow: var(--lb-shadow);
  font-size: 12px;
  color: var(--lb-fg);
}

.lb-sb-detail-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--lb-fg-strong);
}

.lb-sb-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  color: var(--lb-muted);
}

.lb-sb-row span:last-child {
  color: var(--lb-fg);
  font-variant-numeric: tabular-nums;
}

.lb-pop-enter-active,
.lb-pop-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.lb-pop-enter-from,
.lb-pop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
