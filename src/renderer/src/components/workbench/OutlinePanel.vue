<script setup lang="ts">
import { useWorkbenchStore } from '@renderer/stores/workbench'

const emit = defineEmits<{ jump: [line: number] }>()
const wb = useWorkbenchStore()

const minLevel = computed(() => Math.min(...wb.outline.map(i => i.level), 6))
const listRef = ref<HTMLElement>()

// 当前标题滚动到可见区域
watch(() => wb.activeHeading, async (idx) => {
  await nextTick()
  const el = listRef.value?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)
  el?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="lb-outline">
    <ul v-if="wb.outline.length" ref="listRef" class="lb-outline-list">
      <li
        v-for="(item, idx) in wb.outline"
        :key="`${item.line}-${item.text}`"
        :data-idx="idx"
        class="lb-outline-item"
        :class="{ 'is-active': idx === wb.activeHeading, [`is-l${item.level - minLevel}`]: true }"
        :style="{ paddingLeft: `${12 + (item.level - minLevel) * 14}px` }"
        :title="item.text"
        @click="emit('jump', item.line)"
      >
        {{ item.text || '（空标题）' }}
      </li>
    </ul>
    <div v-else class="lb-outline-empty">
      <p>文档中还没有标题</p>
      <p class="hint">
        用 <kbd>#</kbd> 开头的行写标题，这里会自动生成大纲
      </p>
    </div>
  </div>
</template>

<style scoped>
.lb-outline {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px 24px;
}

.lb-outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lb-outline-item {
  position: relative;
  font-size: 13px;
  line-height: 1.45;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 10px;
  border-radius: 6px;
  color: var(--lb-sidebar-fg);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.12s, color 0.12s;
}

.lb-outline-item.is-l0 {
  font-weight: 600;
}

.lb-outline-item:hover {
  background: var(--lb-hover);
}

.lb-outline-item.is-active {
  color: var(--lb-fg-strong);
  background: var(--lb-active);
}

.lb-outline-item.is-active::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 2px;
  background: var(--lb-accent);
}

.lb-outline-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--lb-muted);
}

.lb-outline-empty .hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--lb-faint);
}

.lb-outline-empty kbd {
  font-family: var(--lb-mono);
  padding: 0 4px;
  border-radius: 3px;
  background: var(--lb-hover);
}
</style>
