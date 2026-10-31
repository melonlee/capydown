<script setup lang="ts">
/**
 * 主工作台（Typora 式）：
 *   标题栏 ─ 侧边栏（文件 / 大纲）─ 单栏实时预览编辑器 ─ 可开关的公众号预览面板
 * 所有操作都通过 runCommand(id) 进入：菜单、快捷键、命令面板共用一套命令表（src/shared/commands.ts）。
 */
import type { PaletteItem, PaletteMode } from '@renderer/components/workbench/CommandPalette.vue'
import type { FileNode } from '@renderer/types'
import CssEditor from '@renderer/components/CodemirrorEditor/CssEditor.vue'
import FileTreePanel from '@renderer/components/CodemirrorEditor/FileTreePanel.vue'
import InsertFormDialog from '@renderer/components/CodemirrorEditor/InsertFormDialog.vue'
import RightSlider from '@renderer/components/CodemirrorEditor/RightSlider.vue'
import UploadImgDialog from '@renderer/components/CodemirrorEditor/UploadImgDialog.vue'
import PublishDialog from '@renderer/components/PublishDialog.vue'
import RunLoading from '@renderer/components/RunLoading.vue'
import CommandPalette from '@renderer/components/workbench/CommandPalette.vue'
import OutlinePanel from '@renderer/components/workbench/OutlinePanel.vue'
import StatusBar from '@renderer/components/workbench/StatusBar.vue'
import TitleBar from '@renderer/components/workbench/TitleBar.vue'
import WeChatPanel from '@renderer/components/workbench/WeChatPanel.vue'
import { loadedTick, useDocument } from '@renderer/composables/useDocument'
import { registerWeChatHtmlProvider, useWeChatCopy } from '@renderer/composables/useWeChatCopy'
import { computeTextStats, extractOutline, type FormatCommand, MarkdownEditor } from '@renderer/editor'
import { activeOutlineIndex } from '@renderer/editor/markdown-utils'
import { useDisplayStore, useStore, useWorkspaceStore } from '@renderer/stores'
import { useFileTreeStore } from '@renderer/stores/fileTree'
import { useWorkbenchStore } from '@renderer/stores/workbench'
import { checkImage, formatDoc, toBase64 } from '@renderer/utils'
import emitter from '@renderer/utils/event'
import fileApi from '@renderer/utils/file'
import { getInlineAI, initInlineAI } from '@renderer/utils/inline-ai'
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import mermaid from 'mermaid'
import * as path from 'path-browserify'
import { APP_COMMANDS, COMMAND_MAP, formatAccelerator, matchShortcut, parseAccelerator } from '../../../shared/commands'

const store = useStore()
const display = useDisplayStore()
const fileTree = useFileTreeStore()
const workspace = useWorkspaceStore()
const wb = useWorkbenchStore()
const doc = useDocument()
const { copy: copyToWeChat } = useWeChatCopy()
registerWeChatHtmlProvider()

const isMac = /Mac/i.test(navigator.userAgent)
const editorHost = ref<HTMLElement>()
const wechatPanel = ref<InstanceType<typeof WeChatPanel>>()
let editor: MarkdownEditor | null = null

// ------------------------------------------------------------------ 编辑器里的图片 / 表格 / mermaid

const imageCache = new Map<string, string>()
function resolveImage(src: string): string | Promise<string> {
  if (/^(?:https?:|data:|blob:)/i.test(src))
    return src
  let p = src
  try {
    p = decodeURI(src.replace(/^file:\/\//, ''))
  }
  catch {}
  if (!path.isAbsolute(p)) {
    const base = wb.docPath ? path.dirname(wb.docPath) : fileTree.currentWorkspacePath
    p = path.join(base, p)
  }
  const cached = imageCache.get(p)
  if (cached)
    return cached
  return window.$api.readImageAsBase64(p).then((url: string) => {
    imageCache.set(p, url)
    return url
  })
}

const tableMarked = new Marked({ gfm: true })
function renderMarkdown(src: string) {
  return DOMPurify.sanitize(tableMarked.parse(src, { async: false }) as string)
}

let mermaidSeq = 0
async function renderMermaid(code: string) {
  await mermaid.parse(code)
  const { svg } = await mermaid.render(`lb-mmd-${++mermaidSeq}`, code)
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] })
}

// ------------------------------------------------------------------ 派生信息：预览、大纲、字数

const refreshAll = useDebounceFn(() => {
  if (!editor)
    return
  store.editorRefresh()
  const text = editor.getValue()
  wb.stats = computeTextStats(text)
  wb.outline = extractOutline(text)
  updateActiveHeading('cursor')
}, 250)

function updateActiveHeading(source: 'cursor' | 'scroll') {
  if (!editor)
    return
  const line = source === 'cursor' ? editor.cursorLine() : editor.topVisibleLine()
  wb.activeHeading = activeOutlineIndex(wb.outline, line)
}

let selectionFrame = 0
function onSelectionChange() {
  cancelAnimationFrame(selectionFrame)
  selectionFrame = requestAnimationFrame(() => {
    if (!editor)
      return
    const sel = editor.somethingSelected() ? editor.getSelection() : ''
    wb.selectionStats = sel ? computeTextStats(sel) : null
    updateActiveHeading('cursor')
  })
}

let scrollFrame = 0
function onScroll() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    if (!editor)
      return
    if (!editor.view.hasFocus)
      updateActiveHeading('scroll')
    // 公众号预览跟随编辑区滚动
    const el = wechatPanel.value?.scroller
    if (wb.wechatOpen && el)
      el.scrollTop = editor.scrollRatio() * (el.scrollHeight - el.clientHeight)
  })
}

watch(loadedTick, async () => {
  await nextTick()
  refreshAll()
})

// ------------------------------------------------------------------ 图片上传（粘贴 / 拖入 / 对话框）

const isImgLoading = ref(false)

function beforeUpload(file: File) {
  const checkResult = checkImage(file)
  if (!checkResult.ok) {
    toast.error(checkResult.msg!)
    return false
  }
  const imgHost = localStorage.getItem(`imgHost`) || `default`
  localStorage.setItem(`imgHost`, imgHost)
  const config = localStorage.getItem(`${imgHost}Config`)
  if (!(imgHost === `default` || config)) {
    toast.error(`请先配置 ${imgHost} 图床参数`)
    return false
  }
  return true
}

function uploaded(imageUrl: string) {
  if (!imageUrl) {
    toast.error(`上传图片未知异常`)
    return
  }
  display.toggleShowUploadImgDialog(false)
  editor?.replaceSelection(`\n![](${imageUrl})\n`)
  toast.success(`图片上传成功`)
}

function uploadImage(file: File, cb?: (url: any) => void) {
  isImgLoading.value = true
  toBase64(file)
    .then(base64Content => fileApi.fileUpload(base64Content, file))
    .then((url) => {
      if (cb)
        cb(url)
      else
        uploaded(url)
    })
    .catch(err => toast.error(err.message))
    .finally(() => (isImgLoading.value = false))
}

function onPasteFiles(files: File[]) {
  if (isImgLoading.value)
    return true
  for (const f of files) {
    if (beforeUpload(f))
      uploadImage(f)
  }
  return true
}

/** 拖入图片：上传；拖入包含 .md 与图片的文件夹：上传其中的本地图片并替换链接（原有功能） */
function onDropFiles(evt: DragEvent) {
  const items = Array.from(evt.dataTransfer?.items ?? [])
  if (!items.length)
    return false
  const pos = editor?.view.posAtCoords({ x: evt.clientX, y: evt.clientY })
  if (pos != null)
    editor?.view.dispatch({ selection: { anchor: pos } })
  for (const item of items) {
    if (item.kind !== 'file')
      continue
    const handlePromise = (item as any).getAsFileSystemHandle?.()
    const file = item.getAsFile()
    Promise.resolve(handlePromise).then(async (handle: any) => {
      if (handle?.kind === 'directory') {
        const list = await readDirectoryHandle(handle)
        const md = await readFirstMarkdown(list)
        if (md)
          uploadMarkdownImages(md, list)
      }
      else if (file && file.type.startsWith('image/') && beforeUpload(file)) {
        uploadImage(file)
      }
    })
  }
  return true
}

async function readDirectoryHandle(root: any) {
  const result: { path: string, file?: File }[] = []
  try {
    const dirs: { handle: any, prefix: string }[] = [{ handle: root, prefix: `${root.name}/` }]
    for (const { handle: dir, prefix } of dirs) {
      for await (const [, handle] of dir) {
        if (handle.kind === `file`)
          result.push({ path: prefix + handle.name, file: await handle.getFile() })
        else
          dirs.push({ handle, prefix: `${prefix}${handle.name}/` })
      }
    }
  }
  catch (err) {
    console.error(err)
  }
  return result
}

function readFirstMarkdown(list: { path: string, file?: File }[]) {
  const found = list.find(item => /\.md$/.test(item.path) && item.file)
  if (!found)
    return Promise.resolve(null)
  return new Promise<{ str: string, path: string }>((resolve) => {
    const reader = new FileReader()
    reader.readAsText(found.file!, `UTF-8`)
    reader.onload = evt => resolve({ str: evt.target!.result as string, path: found.path })
  })
}

async function uploadMarkdownImages(md: { str: string, path: string }, list: { path: string, file?: File }[]) {
  const root = md.path.match(/.+?\//)![0]
  const images = [...md.str.matchAll(/!\[(.*?)\]\((.*?)\)/g)]
  const results = await Promise.all(images.map(([, , raw]) => new Promise<{ matchStr: string, url: string }>((resolve) => {
    const matchStr = raw.replace(/^.\//, ``)
    const { file } = list.find(f => f.path === `${root}${matchStr}`) || {}
    if (!file)
      return resolve({ matchStr, url: raw })
    uploadImage(file, url => resolve({ matchStr, url }))
  })))
  let str = md.str
  for (const item of results) {
    str = str.replace(`](./${item.matchStr})`, `](${item.url})`).replace(`](${item.matchStr})`, `](${item.url})`)
  }
  editor?.setValue(str)
}

// ------------------------------------------------------------------ AI

const showPublishDialog = ref(false)
const publishContent = ref('')

async function handleAICommand(commandId: string) {
  if (!editor)
    return
  const selected = editor.getSelection()
  const needsSelection = !['continue', 'outline'].includes(commandId)
  if (needsSelection && !selected) {
    toast.error('请先选中要处理的文字')
    return
  }
  try {
    switch (commandId) {
      case 'continue':
        await handleAIContinue()
        break
      case 'polish-professional':
      case 'polish-casual':
      case 'polish-concise':
        editor.replaceSelection(await window.$api.aiPolishText(selected, commandId.replace('polish-', '')), 'around')
        toast.success('润色完成')
        break
      case 'expand':
        editor.replaceSelection(await window.$api.aiExpandText(selected), 'around')
        toast.success('扩写完成')
        break
      case 'summarize': {
        const result = await window.$api.aiSummarizeText(selected)
        const end = editor.view.state.selection.main.to
        editor.view.dispatch({ changes: { from: end, insert: `\n\n**摘要：**\n${result}\n` } })
        toast.success('摘要已生成')
        break
      }
      case 'outline':
        await handleAIGenerateOutline()
        break
      case 'analyze': {
        const r = await window.$api.aiAnalyzeContent(selected)
        const text = `\n\n## 内容分析\n\n**摘要：** ${r.summary}\n\n**关键词：** ${r.keywords.join('、')}\n\n**话题：** ${r.topics.join('、')}\n\n**情感：** ${r.sentiment}\n\n**可读性分数：** ${r.readabilityScore}/100\n\n**建议标签：** ${r.suggestedTags.join('、')}\n`
        editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: text } })
        toast.success('分析完成')
        break
      }
      case 'translate-en':
      case 'translate-zh':
        editor.replaceSelection(await window.$api.aiPolishText(selected, commandId), 'around')
        toast.success('翻译完成')
        break
    }
  }
  catch (error: any) {
    toast.error(`AI 处理失败：${String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
  }
}

async function handleAIContinue() {
  const inlineAI = getInlineAI()
  if (!inlineAI || !editor)
    return
  await inlineAI.continueWriting({
    content: editor.getValue(),
    cursorPosition: editor.getCursor(),
    documentPath: wb.docPath,
  })
}

async function handleAIGenerateOutline() {
  // eslint-disable-next-line no-alert
  const topic = prompt('请输入文章主题：')
  if (!topic || !editor)
    return
  const result = await window.$api.aiGenerateOutline(topic, 'blog')
  let markdown = `# ${result.title}\n\n`
  const formatSections = (sections: any[], level = 1) => {
    for (const section of sections) {
      markdown += `${'#'.repeat(level + 1)} ${section.title}\n\n`
      if (section.children)
        formatSections(section.children, level + 1)
    }
  }
  if (result.outline?.sections)
    formatSections(result.outline.sections)
  editor.setValue(markdown)
  toast.success('大纲已生成')
}

const AI_COMMANDS: (PaletteItem & { needsSelection: boolean })[] = [
  { id: 'continue', label: 'AI 续写', hint: '根据上下文继续写作，Tab 接受', group: 'AI', shortcut: isMac ? '⌘L' : 'Ctrl+L', needsSelection: false },
  { id: 'polish-professional', label: '润色为专业风格', hint: '更专业正式', group: 'AI', needsSelection: true },
  { id: 'polish-casual', label: '润色为轻松风格', hint: '更轻松口语', group: 'AI', needsSelection: true },
  { id: 'polish-concise', label: '精简文本', hint: '去除冗余，保留核心', group: 'AI', needsSelection: true },
  { id: 'expand', label: '扩写内容', hint: '增加细节和说明', group: 'AI', needsSelection: true },
  { id: 'summarize', label: '生成摘要', hint: '提取核心观点', group: 'AI', needsSelection: true },
  { id: 'translate-en', label: '翻译成英文', group: 'AI', needsSelection: true },
  { id: 'translate-zh', label: '翻译成中文', group: 'AI', needsSelection: true },
  { id: 'analyze', label: '分析内容', hint: '关键词、话题、可读性', group: 'AI', needsSelection: true },
  { id: 'outline', label: '生成大纲', hint: '为一个主题生成文章大纲（会替换当前内容）', group: 'AI', needsSelection: false },
]

// ------------------------------------------------------------------ 命令面板

const palette = reactive({ open: false, mode: 'files' as PaletteMode, hasSelection: false })

function openPalette(mode: PaletteMode) {
  if (palette.open && palette.mode === mode) {
    palette.open = false
    return
  }
  palette.hasSelection = !!editor?.somethingSelected()
  palette.mode = mode
  palette.open = true
}

const paletteCommands = computed<PaletteItem[]>(() => APP_COMMANDS
  .filter(c => c.palette !== false && c.category !== 'AI')
  .map(c => ({
    id: c.id,
    label: c.label,
    group: c.category,
    shortcut: c.accelerator ? formatAccelerator(c.accelerator, isMac) : undefined,
  })))

const paletteAICommands = computed<PaletteItem[]>(() => AI_COMMANDS
  .filter(c => palette.hasSelection || !c.needsSelection)
  .map(c => ({ ...c, id: `ai:${c.id}` })))

function onPaletteRun(id: string) {
  if (id.startsWith('ai:'))
    handleAICommand(id.slice(3))
  else
    runCommand(id)
}

function onPaletteOpenFile(node: FileNode) {
  doc.openNode(node)
}

// ------------------------------------------------------------------ 命令

const renaming = ref(false)

async function renameCurrent(name: string) {
  const node = fileTree.findNodeByPath(fileTree.fileTree, wb.docPath)
  if (!node)
    return
  await doc.flushSave()
  const oldPath = node.path
  const result = await fileTree.renameNode(node, name)
  if (result) {
    doc.pathChanged(oldPath, result)
    const fresh = fileTree.findNodeByPath(fileTree.fileTree, result)
    if (fresh)
      fileTree.selectNode(fresh)
  }
}

function toggleSidebarTab(tab: 'files' | 'outline') {
  if (wb.sidebarOpen && wb.sidebarTab === tab) {
    wb.sidebarOpen = false
  }
  else {
    wb.sidebarTab = tab
    wb.sidebarOpen = true
  }
}

function formatDocument() {
  if (!editor)
    return
  formatDoc(editor.getValue()).then(text => editor?.setValue(text))
}

const FORMAT_COMMANDS: Record<string, FormatCommand> = {
  'para.h1': 'h1',
  'para.h2': 'h2',
  'para.h3': 'h3',
  'para.h4': 'h4',
  'para.h5': 'h5',
  'para.h6': 'h6',
  'para.paragraph': 'paragraph',
  'para.codeBlock': 'codeBlock',
  'para.quote': 'quote',
  'para.ol': 'ol',
  'para.ul': 'ul',
  'para.task': 'task',
  'para.hr': 'hr',
  'fmt.bold': 'bold',
  'fmt.italic': 'italic',
  'fmt.strike': 'strike',
  'fmt.code': 'code',
  'fmt.link': 'link',
  'fmt.image': 'image',
}

function runCommand(id: string) {
  const fmt = FORMAT_COMMANDS[id]
  if (fmt) {
    if (editor && store.currentFileType !== 'image' && store.currentFileType !== 'pdf')
      editor.exec(fmt)
    return
  }
  switch (id) {
    case 'file.new': emitter.emit('new-file'); break
    case 'file.quickOpen': openPalette('files'); break
    case 'app.commandPalette': openPalette('commands'); break
    case 'file.save':
      doc.flushSave().then(ok => ok && wb.docPath && toast.success('已保存', { duration: 1200 }))
      break
    case 'file.rename': renaming.value = !!wb.docPath; break
    case 'file.import': store.importMarkdownContent(); break
    case 'file.exportMd': store.exportEditorContent2MD(); break
    case 'file.exportHtml': store.exportEditorContent2HTML(); break
    case 'file.closeWorkspace':
      doc.flushSave().then(() => workspace.closeCurrentWorkspace())
      break
    case 'app.settings': store.isOpenRightSlider = !store.isOpenRightSlider; break

    case 'edit.undo': editor?.undo(); break
    case 'edit.redo': editor?.redo(); break
    case 'edit.find': editor?.openSearch(); break
    case 'edit.format': formatDocument(); break

    case 'para.table': display.toggleShowInsertFormDialog(true); break
    case 'fmt.uploadImage': display.toggleShowUploadImgDialog(true); break

    case 'view.sourceMode': wb.sourceMode = !wb.sourceMode; break
    case 'view.sidebar': wb.sidebarOpen = !wb.sidebarOpen; break
    case 'view.outline': toggleSidebarTab('outline'); break
    case 'view.files': toggleSidebarTab('files'); break
    case 'view.focus': wb.focusMode = !wb.focusMode; break
    case 'view.typewriter': wb.typewriterMode = !wb.typewriterMode; break
    case 'view.statusBar': wb.statusBarVisible = !wb.statusBarVisible; break
    case 'view.wechat': wb.wechatOpen = !wb.wechatOpen; break

    case 'theme.github': wb.setTheme('github'); break
    case 'theme.newsprint': wb.setTheme('newsprint'); break
    case 'theme.night': wb.setTheme('night'); break
    case 'theme.followSystem': wb.followSystem = !wb.followSystem; break
    case 'theme.articleStyle':
      wb.wechatOpen = true
      store.isOpenRightSlider = true
      break
    case 'theme.customCss':
      wb.wechatOpen = true
      if (!display.isShowCssEditor)
        display.toggleShowCssEditor()
      setTimeout(() => store.cssEditor?.refresh(), 50)
      break

    case 'wechat.copy': copyToWeChat(); break
    case 'wechat.publish':
      publishContent.value = editor?.getValue() ?? ''
      showPublishDialog.value = true
      break

    case 'ai.palette': openPalette('ai'); break
    case 'ai.continue': handleAIContinue(); break
  }
  if (id !== 'file.rename' && !id.startsWith('file.') && !palette.open)
    editor?.focus()
}

// 快捷键：在捕获阶段统一处理，阻止默认行为后菜单不会再重复触发
const SHORTCUTS = APP_COMMANDS.filter(c => c.accelerator).map(c => ({ id: c.id, spec: parseAccelerator(c.accelerator!) }))
const lastHandled = new Map<string, number>()

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229)
    return
  const hit = SHORTCUTS.find(s => matchShortcut(e, s.spec, isMac))
  if (!hit)
    return
  const cmd = COMMAND_MAP[hit.id]
  const target = e.target as HTMLElement | null
  const inEditor = !!(editor && target && editor.view.dom.contains(target))
  const inOtherInput = !inEditor && !!target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')
  // 对话框 / 输入框里的编辑快捷键（撤销、加粗…）交给原生处理
  if (inOtherInput && (cmd.editor || hit.id === 'file.save'))
    return
  if (cmd.editor && !editor)
    return
  e.preventDefault()
  e.stopPropagation()
  lastHandled.set(hit.id, Date.now())
  runCommand(hit.id)
}

function onMenuCommand(id: unknown) {
  if (typeof id !== 'string')
    return
  // 同一个快捷键既被页面处理又被菜单触发时，忽略菜单那一次
  if (Date.now() - (lastHandled.get(id) ?? 0) < 400)
    return
  // 焦点在对话框输入框里时，菜单的撤销 / 重做作用于输入框，其余编辑命令忽略
  const cmd = COMMAND_MAP[id]
  const active = document.activeElement as HTMLElement | null
  const inOtherInput = !!active && !(editor && editor.view.dom.contains(active)) && !!active.closest('input, textarea, [contenteditable="true"]')
  if (cmd?.editor && inOtherInput) {
    if (id === 'edit.undo' || id === 'edit.redo')
      document.execCommand(id === 'edit.undo' ? 'undo' : 'redo')
    return
  }
  runCommand(id)
}

// ------------------------------------------------------------------ 状态同步

watch(() => wb.sourceMode, on => editor?.setSourceMode(on))
watch(() => wb.focusMode, on => editor?.setFocusMode(on))
watch(() => wb.typewriterMode, on => editor?.setTypewriterMode(on))

watch(() => wb.effectiveTheme, (theme) => {
  document.documentElement.dataset.lbTheme = theme
  store.isDark = theme === 'night'
}, { immediate: true })

watch(() => wb.menuState, state => window.$api.updateMenuState?.(JSON.parse(JSON.stringify(state))), { immediate: true, deep: true })

watch(() => [wb.docName, workspace.currentWorkspace?.name] as const, ([name, ws]) => {
  window.$api.setWindowTitle(name ? `${name}${ws ? ` — ${ws}` : ''}` : (ws ? `${ws} — LazyBox` : 'LazyBox'))
}, { immediate: true })

// 打开公众号预览时立刻同步一次滚动位置
watch(() => wb.wechatOpen, async (open) => {
  if (open) {
    await nextTick()
    setTimeout(onScroll, 260)
  }
})

// 工作区文件树加载完成后打开上次的文件
let initialOpened = false
watch(() => fileTree.fileTree, async (tree) => {
  if (!initialOpened && tree.length && editor) {
    initialOpened = true
    if (!wb.docPath)
      await doc.openInitial()
  }
}, { immediate: true })

// 侧边栏拖拽调宽
const resizing = ref(false)
function startResize(e: MouseEvent) {
  resizing.value = true
  const startX = e.clientX
  const startW = wb.sidebarWidth
  const move = (ev: MouseEvent) => {
    wb.sidebarWidth = Math.max(200, Math.min(420, startW + ev.clientX - startX))
  }
  const up = () => {
    resizing.value = false
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

// ------------------------------------------------------------------ 图片 / PDF 文件预览

const imageBase64 = ref('')
const pdfBase64 = ref('')
watch([() => store.currentFilePath, () => store.currentFileType], async ([p, type]) => {
  imageBase64.value = ''
  pdfBase64.value = ''
  try {
    if (type === 'image' && p)
      imageBase64.value = await window.$api.readImageAsBase64(p)
    else if (type === 'pdf' && p)
      pdfBase64.value = await window.$api.readPdfAsBase64(p)
  }
  catch (error: any) {
    toast.error(`无法加载文件：${error?.message || '未知错误'}`)
  }
}, { immediate: true })

function openPdfExternally() {
  window.$api.openPdfExternally(store.currentFilePath)
}

const isTextView = computed(() => store.currentFileType !== 'image' && store.currentFileType !== 'pdf')

// ------------------------------------------------------------------ 生命周期

onMounted(() => {
  editor = new MarkdownEditor({
    parent: editorHost.value!,
    preview: { resolveImage, renderMarkdown, renderMermaid },
    onDocChange: () => {
      doc.markDirty()
      refreshAll()
    },
    onSelectionChange,
    onScroll,
    onPasteFiles,
    onDropFiles,
    openLink: url => window.open(url, '_blank'),
  })
  store.editor = markRaw(editor) as any
  initInlineAI(editor)
  editor.setSourceMode(wb.sourceMode)
  editor.setFocusMode(wb.focusMode)
  editor.setTypewriterMode(wb.typewriterMode)
  refreshAll()

  window.addEventListener('keydown', onKeydown, true)
  emitter.on('command', onMenuCommand)
  emitter.on('ai:command-palette', () => openPalette('ai'))
  emitter.on('ai:continue-writing', handleAIContinue)
  emitter.on('publish:open-dialog', () => runCommand('wechat.publish'))

  if (fileTree.fileTree.length && !initialOpened) {
    initialOpened = true
    doc.openInitial()
  }
})

onBeforeUnmount(() => {
  doc.flushSave()
  window.removeEventListener('keydown', onKeydown, true)
  emitter.off('command', onMenuCommand)
  emitter.off('ai:command-palette')
  emitter.off('ai:continue-writing')
  emitter.off('publish:open-dialog')
  editor?.destroy()
  editor = null
  store.editor = null
})

window.addEventListener('beforeunload', () => {
  doc.flushSave()
})
</script>

<template>
  <div class="lb-app container" :class="{ 'is-resizing': resizing }">
    <aside class="lb-sidebar" :class="{ 'is-open': wb.sidebarOpen }" :style="{ width: wb.sidebarOpen ? `${wb.sidebarWidth}px` : '0px' }">
      <div class="lb-sidebar-inner" :style="{ width: `${wb.sidebarWidth}px` }">
        <div class="lb-sidebar-drag draggable-area" />
        <div class="lb-sidebar-tabs">
          <button :class="{ 'is-active': wb.sidebarTab === 'files' }" @click="wb.sidebarTab = 'files'">
            文件
          </button>
          <button :class="{ 'is-active': wb.sidebarTab === 'outline' }" @click="wb.sidebarTab = 'outline'">
            大纲
          </button>
        </div>
        <FileTreePanel v-show="wb.sidebarTab === 'files'" />
        <OutlinePanel v-show="wb.sidebarTab === 'outline'" @jump="line => editor?.scrollToLine(line)" />
      </div>
      <div v-if="wb.sidebarOpen" class="lb-sidebar-resizer" @mousedown.prevent="startResize" />
    </aside>

    <div class="lb-column">
      <TitleBar
        v-model:renaming="renaming"
        :class="{ 'has-traffic-lights': !wb.sidebarOpen }"
        @rename="renameCurrent"
        @toggle-wechat="runCommand('view.wechat')"
      />

      <div class="lb-body">
        <main class="lb-main">
          <div v-show="isTextView" ref="editorHost" class="lb-editor" />

          <div v-if="store.currentFileType === 'image'" class="lb-file-view">
            <img v-if="imageBase64" :src="imageBase64" :alt="wb.docName">
            <p class="lb-file-caption">
              {{ store.currentFilePath.split('/').pop() }}
            </p>
          </div>

          <div v-if="store.currentFileType === 'pdf'" class="lb-file-view is-pdf">
            <iframe v-if="pdfBase64" :src="pdfBase64" />
            <button class="lb-link-btn" @click="openPdfExternally">
              在系统中打开
            </button>
          </div>

          <div v-if="!wb.docPath && isTextView" class="lb-empty">
            <p class="lb-empty-title">
              没有打开的文档
            </p>
            <p class="lb-empty-actions">
              <button @click="runCommand('file.new')">
                新建文件 <kbd>{{ isMac ? '⌘N' : 'Ctrl+N' }}</kbd>
              </button>
              <button @click="runCommand('file.quickOpen')">
                快速打开 <kbd>{{ isMac ? '⌘P' : 'Ctrl+P' }}</kbd>
              </button>
            </p>
          </div>

          <StatusBar @toggle-sidebar="runCommand('view.sidebar')" @toggle-source="runCommand('view.sourceMode')" />
        </main>

        <WeChatPanel ref="wechatPanel" @publish="runCommand('wechat.publish')" />
        <CssEditor class="lb-side-panel" />
        <RightSlider class="lb-side-panel" />
      </div>
    </div>

    <UploadImgDialog @upload-image="uploadImage" />
    <InsertFormDialog />
    <RunLoading />

    <AlertDialog v-model:open="store.isOpenConfirmDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>提示</AlertDialogTitle>
          <AlertDialogDescription>
            此操作将丢失本地自定义样式，是否继续？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="store.resetStyle()">
            确认
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <CommandPalette
      v-model="palette.open"
      :mode="palette.mode"
      :commands="paletteCommands"
      :ai-commands="paletteAICommands"
      :recent-files="doc.recentFiles.value"
      :current-path="wb.docPath"
      @open-file="onPaletteOpenFile"
      @run="onPaletteRun"
    />

    <PublishDialog v-model="showPublishDialog" :content="publishContent" />

    <Toaster position="top-center" />
  </div>
</template>

<style scoped>
.lb-app {
  height: 100vh;
  width: 100vw;
  max-width: none;
  padding: 0;
  display: flex;
  background: var(--lb-bg);
  color: var(--lb-fg);
  overflow: hidden;
}

.lb-app.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.lb-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.lb-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 侧边栏 */
.lb-sidebar {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--lb-sidebar-bg);
  transition: width 0.22s ease;
}

.lb-sidebar-drag {
  height: 38px;
  flex-shrink: 0;
}

.lb-sidebar.is-open {
  border-right: 1px solid var(--lb-border);
}

.is-resizing .lb-sidebar {
  transition: none;
}

.lb-sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.lb-sidebar-tabs {
  display: flex;
  gap: 2px;
  margin: 2px 10px 8px;
  padding: 2px;
  border-radius: 7px;
  background: var(--lb-hover);
}

.lb-sidebar-tabs button {
  flex: 1;
  height: 24px;
  font-size: 12px;
  color: var(--lb-muted);
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.lb-sidebar-tabs button.is-active {
  color: var(--lb-fg-strong);
  background: var(--lb-bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  font-weight: 500;
}

.lb-sidebar-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

/* 主编辑区 */
.lb-main {
  position: relative;
  flex: 1;
  min-width: 0;
  background: var(--lb-bg);
}

.lb-side-panel {
  flex-shrink: 0;
  background: var(--lb-bg);
  border-left: 1px solid var(--lb-border);
}

.lb-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--lb-bg);
  color: var(--lb-muted);
}

.lb-empty-title {
  font-size: 15px;
  color: var(--lb-fg);
}

.lb-empty-actions {
  display: flex;
  gap: 10px;
}

.lb-empty-actions button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  border-radius: 7px;
  border: 1px solid var(--lb-border-strong);
  background: var(--lb-bg);
  color: var(--lb-fg);
  cursor: pointer;
}

.lb-empty-actions button:hover {
  background: var(--lb-hover);
}

.lb-empty-actions kbd {
  font-family: var(--lb-font);
  font-size: 11px;
  color: var(--lb-faint);
}

.lb-file-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  overflow: auto;
}

.lb-file-view img {
  max-width: 100%;
  max-height: calc(100% - 40px);
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
}

.lb-file-view.is-pdf iframe {
  width: 100%;
  flex: 1;
  border: none;
  border-radius: 6px;
  background: #fff;
}

.lb-file-caption {
  font-size: 12px;
  color: var(--lb-muted);
}

.lb-link-btn {
  font-size: 12px;
  color: var(--lb-link);
  background: none;
  border: none;
  cursor: pointer;
}
</style>
