<script setup lang="ts">
import {
  codeBlockThemeOptions,
  colorOptions,
  fontFamilyOptions,
  fontSizeOptions,
  legendOptions,
  themeOptions,
} from '@renderer/config'
import { useDisplayStore, useStore } from '@renderer/stores'
import { X } from 'lucide-vue-next'
import PickColors, { type Format } from 'vue-pick-colors'
import AISettings from '@renderer/components/AISettings.vue'
import { EDITOR_THEMES, useWorkbenchStore } from '@renderer/stores/workbench'

const store = useStore()
const displayStore = useDisplayStore()

const wb = useWorkbenchStore()
const { primaryColor } = storeToRefs(store)

function customStyle() {
  displayStore.toggleShowCssEditor()
  setTimeout(() => {
    store.cssEditor!.refresh()
  }, 50)
}

/** 两项开关（开启 / 关闭）的通用写法 */
const toggles = computed(() => [
  { label: 'Mac 风格代码块', on: store.isMacCodeBlock, toggle: store.macCodeBlockChanged },
  { label: '微信外链转底部引用', on: store.isCiteStatus, toggle: store.citeStatusChanged },
  { label: '文首显示字数和阅读时间', on: store.isCountStatus, toggle: store.countStatusChanged },
  { label: '段落首行缩进', on: store.isUseIndent, toggle: store.useIndentChanged },
  { label: '自定义 CSS 面板', on: displayStore.isShowCssEditor, toggle: customStyle },
])

const pickColorsContainer = useTemplateRef<HTMLElement | undefined>(`pickColorsContainer`)
const format = ref<Format>(`rgb`)
const formatOptions = ref<Format[]>([`rgb`, `hex`, `hsl`, `hsv`])
</script>

<template>
  <div
    class="lb-prefs overflow-hidden transition-width duration-300"
    :class="store.isOpenRightSlider ? 'w-100' : 'w-0 border-l-0'"
  >
    <div class="lb-prefs-scroll" :class="store.isOpenRightSlider ? 'translate-x-0' : 'translate-x-full'">
      <header class="lb-prefs-head">
        <h1>偏好设置</h1>
        <button class="lb-prefs-close" title="关闭" @click="store.isOpenRightSlider = false">
          <X class="size-4" />
        </button>
      </header>

      <!-- 编辑器（界面）主题：整个应用都跟随，黑白灰三套 -->
      <section class="lb-prefs-section">
        <h2>编辑器主题</h2>
        <div class="lb-seg grid-cols-3">
          <button
            v-for="t in EDITOR_THEMES" :key="t.id"
            :class="{ 'is-on': wb.effectiveTheme === t.id }"
            :title="t.desc"
            @click="wb.setTheme(t.id)"
          >
            {{ t.label }}
          </button>
        </div>
        <label class="lb-prefs-row">
          <span>跟随系统深色模式（自动切换到 Night）</span>
          <Switch :checked="wb.followSystem" @update:checked="(v: boolean) => (wb.followSystem = v)" />
        </label>
      </section>

      <section class="lb-prefs-section">
        <AISettings />
      </section>

      <!-- 以下是公众号文章的排版样式（输出内容），与编辑器主题无关 -->
      <section class="lb-prefs-section">
        <h2>公众号排版</h2>
        <p class="lb-prefs-note">
          只影响右侧公众号预览和复制出去的文章。
        </p>

        <h3>主题</h3>
        <div class="lb-seg grid-cols-3">
          <button v-for="{ label, value } in themeOptions" :key="value" :class="{ 'is-on': store.theme === value }" @click="store.themeChanged(value)">
            {{ label }}
          </button>
        </div>

        <h3>字体</h3>
        <div class="lb-seg grid-cols-3">
          <button v-for="{ label, value } in fontFamilyOptions" :key="value" :class="{ 'is-on': store.fontFamily === value }" @click="store.fontChanged(value)">
            {{ label }}
          </button>
        </div>

        <h3>字号</h3>
        <div class="lb-seg grid-cols-5">
          <button v-for="{ value, desc } in fontSizeOptions" :key="value" :class="{ 'is-on': store.fontSize === value }" @click="store.sizeChanged(value)">
            {{ desc }}
          </button>
        </div>

        <h3>主题色</h3>
        <div class="lb-seg grid-cols-3">
          <button v-for="{ label, value } in colorOptions" :key="value" :class="{ 'is-on': store.primaryColor === value }" @click="store.colorChanged(value)">
            <span class="lb-swatch" :style="{ background: value }" />
            {{ label }}
          </button>
        </div>

        <h3>自定义主题色</h3>
        <div ref="pickColorsContainer">
          <PickColors
            v-if="pickColorsContainer"
            v-model:value="primaryColor"
            show-alpha :format="format"
            :format-options="formatOptions"
            :theme="store.isDark ? 'dark' : 'light'"
            :popup-container="pickColorsContainer"
            @change="store.colorChanged"
          />
        </div>

        <h3>代码块主题</h3>
        <Select v-model="store.codeBlockTheme" @update:model-value="store.codeBlockThemeChanged">
          <SelectTrigger>
            <SelectValue placeholder="选择代码块主题" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="{ label, value } in codeBlockThemeOptions" :key="label" :value="value">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <h3>图注格式</h3>
        <div class="lb-seg grid-cols-3">
          <button v-for="{ label, value } in legendOptions" :key="value" :class="{ 'is-on': store.legend === value }" @click="store.legendChanged(value)">
            {{ label }}
          </button>
        </div>

        <div class="lb-prefs-toggles">
          <label v-for="t in toggles" :key="t.label" class="lb-prefs-row">
            <span>{{ t.label }}</span>
            <Switch :checked="t.on" @update:checked="(v: boolean) => v !== t.on && t.toggle()" />
          </label>
        </div>

        <Button variant="outline" size="sm" class="mt-4" @click="store.resetStyleConfirm">
          恢复默认排版
        </Button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 偏好设置是覆盖在右侧的抽屉，不挤压编辑区和公众号预览 */
.lb-prefs {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 30 !important;
  background: var(--lb-bg);
  color: var(--lb-fg);
  font-family: var(--lb-ui-font);
  border-left: 1px solid var(--lb-border);
}

.lb-prefs.w-100 {
  box-shadow: var(--lb-shadow);
}

.lb-prefs-scroll {
  width: 25rem;
  height: 100%;
  overflow-y: auto;
  transition: transform 0.3s;
}

.lb-prefs-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 10px 0 20px;
  background: var(--lb-bg);
  border-bottom: 1px solid var(--lb-border);
}

.lb-prefs-head h1 {
  font-size: 13px;
  font-weight: 600;
  color: var(--lb-fg-strong);
}

.lb-prefs-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--lb-muted);
}

.lb-prefs-close:hover {
  background: var(--lb-hover);
  color: var(--lb-fg-strong);
}

.lb-prefs-section {
  padding: 18px 20px 20px;
  border-bottom: 1px solid var(--lb-border);
}

.lb-prefs-section h2,
.lb-prefs-section :deep(.lb-prefs-h2) {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lb-fg-strong);
}

.lb-prefs-section h3 {
  margin: 16px 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--lb-muted);
}

.lb-prefs-note {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--lb-faint);
}

.lb-seg {
  display: grid;
  gap: 6px;
}

.lb-seg button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  color: var(--lb-fg);
  background: var(--lb-bg);
  border: 1px solid var(--lb-border-strong);
  border-radius: 6px;
  transition: border-color 0.12s, background-color 0.12s;
}

.lb-seg button:hover {
  background: var(--lb-hover);
}

.lb-seg button.is-on {
  color: var(--lb-fg-strong);
  border-color: var(--lb-fg-strong);
  box-shadow: inset 0 0 0 0.5px var(--lb-fg-strong);
  font-weight: 500;
}

/* 公众号主题色是文章的输出颜色，色块按原样显示 */
.lb-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.lb-prefs-toggles {
  margin-top: 14px;
}

.lb-prefs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  font-size: 13px;
  color: var(--lb-fg);
  cursor: pointer;
}
</style>
