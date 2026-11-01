/**
 * Typora 式工作台的界面状态：侧边栏、各种写作模式、编辑器主题、当前文档信息。
 * 公众号排版相关的状态仍在主 store（stores/index.ts）里。
 */
import type { OutlineItem, TextStats } from '@renderer/editor/markdown-utils'
import type { MenuState } from '../../../shared/commands'
import { defineStore } from 'pinia'

export type EditorThemeName = 'github' | 'newsprint' | 'night'

export const EDITOR_THEMES: { id: EditorThemeName, label: string, desc: string }[] = [
  { id: 'github', label: 'GitHub', desc: '干净的无衬线排版，默认主题' },
  { id: 'newsprint', label: 'Newsprint', desc: '米色纸张与衬线字体，适合长文' },
  { id: 'night', label: 'Night', desc: '低对比度深色，夜间写作' },
]

const emptyStats: TextStats = {
  words: 0,
  cjk: 0,
  latinWords: 0,
  characters: 0,
  charactersWithSpaces: 0,
  paragraphs: 0,
  lines: 0,
  readingMinutes: 0,
}

export const useWorkbenchStore = defineStore('workbench', () => {
  // ------------------------------------------------------------- 布局与模式
  const sidebarOpen = useStorage('lb-sidebar-open', true)
  const sidebarTab = useStorage<'files' | 'outline'>('lb-sidebar-tab', 'files')
  const sidebarWidth = useStorage('lb-sidebar-width', 260)
  const statusBarVisible = useStorage('lb-status-bar', true)
  const wechatOpen = useStorage('lb-wechat-open', false)
  const sourceMode = ref(false)
  const focusMode = useStorage('lb-focus-mode', false)
  const typewriterMode = useStorage('lb-typewriter-mode', false)

  // ------------------------------------------------------------- 主题
  const editorTheme = useStorage<EditorThemeName>('lb-editor-theme', 'github')
  const followSystem = useStorage('lb-follow-system', true)
  const prefersDark = usePreferredDark()
  const effectiveTheme = computed<EditorThemeName>(() => {
    if (followSystem.value && prefersDark.value)
      return 'night'
    return editorTheme.value
  })

  // ◐ 按钮回到浅色时用的主题：记住用户最后一次用的浅色主题（GitHub / Newsprint）
  const lastLightTheme = useStorage<EditorThemeName>('lb-last-light-theme', 'github')
  watch(editorTheme, (t) => {
    if (t !== 'night')
      lastLightTheme.value = t
  }, { immediate: true })

  /**
   * 浅色 ↔ 深色切换（侧边栏底部 ◐）：以「当前看到的」主题为准切到另一边，
   * 这是用户的明确选择，所以同时关闭「跟随系统深色模式」，否则系统深色时切不回浅色。
   */
  function toggleDark() {
    const toDark = effectiveTheme.value !== 'night'
    followSystem.value = false
    editorTheme.value = toDark ? 'night' : (lastLightTheme.value === 'night' ? 'github' : lastLightTheme.value)
  }

  function setTheme(theme: EditorThemeName) {
    editorTheme.value = theme
    // 系统处于深色时手动选浅色主题：视为不再跟随系统
    if (followSystem.value && prefersDark.value && theme !== 'night')
      followSystem.value = false
  }

  // ------------------------------------------------------------- 当前文档
  const docPath = ref('')
  const docName = computed(() => {
    const base = docPath.value.split(/[\\/]/).pop() || ''
    return base.replace(/\.(md|markdown)$/i, '')
  })
  const dirty = ref(false)
  const saving = ref(false)
  const stats = shallowRef<TextStats>(emptyStats)
  const selectionStats = shallowRef<TextStats | null>(null)
  const outline = shallowRef<OutlineItem[]>([])
  const activeHeading = ref(-1)

  const menuState = computed<MenuState>(() => ({
    sourceMode: sourceMode.value,
    focusMode: focusMode.value,
    typewriterMode: typewriterMode.value,
    sidebar: sidebarOpen.value,
    sidebarTab: sidebarTab.value,
    statusBar: statusBarVisible.value,
    wechat: wechatOpen.value,
    theme: editorTheme.value,
    followSystem: followSystem.value,
  }))

  return {
    sidebarOpen,
    sidebarTab,
    sidebarWidth,
    statusBarVisible,
    wechatOpen,
    sourceMode,
    focusMode,
    typewriterMode,
    editorTheme,
    followSystem,
    effectiveTheme,
    setTheme,
    toggleDark,
    docPath,
    docName,
    dirty,
    saving,
    stats,
    selectionStats,
    outline,
    activeHeading,
    menuState,
  }
})
