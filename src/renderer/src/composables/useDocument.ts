/**
 * 当前文档的打开 / 保存。
 *
 * - 打开文件只把内容载入编辑器，不写盘（文件保持逐字节不变）
 * - 只有用户编辑后才自动保存；切换文件、关闭工作区前会先把未保存的内容写回原文件
 */
import type { MarkdownEditor } from '@renderer/editor'
import type { FileNode } from '@renderer/types'
import { useStore } from '@renderer/stores'
import { useFileTreeStore } from '@renderer/stores/fileTree'
import { useWorkbenchStore } from '@renderer/stores/workbench'

const SAVE_DELAY = 600
let saveTimer: ReturnType<typeof setTimeout> | undefined

/** 每载入一次文件 +1，供界面刷新预览 / 大纲 / 字数 */
export const loadedTick = ref(0)

export type OpenFileType = 'markdown' | 'image' | 'pdf' | 'other'

export function fileTypeOf(filename: string): OpenFileType {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md' || ext === 'markdown')
    return 'markdown'
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext))
    return 'image'
  if (ext === 'pdf')
    return 'pdf'
  return 'other'
}

const recentFiles = useStorage<string[]>('lb-recent-files', [])

export function useDocument() {
  const store = useStore()
  const fileTree = useFileTreeStore()
  const wb = useWorkbenchStore()

  const editor = () => store.editor as unknown as MarkdownEditor | null

  async function flushSave(): Promise<boolean> {
    clearTimeout(saveTimer)
    const ed = editor()
    if (!ed || !wb.dirty || !wb.docPath || store.currentFileType !== 'markdown')
      return true
    const path = wb.docPath
    const content = ed.getValue()
    wb.saving = true
    try {
      const ok = await fileTree.updateFileContent(path, content)
      // 保存期间用户可能又改了内容，只有内容一致时才算「已保存」
      if (ok && path === wb.docPath && ed.getValue() === content)
        wb.dirty = false
      return !!ok
    }
    finally {
      wb.saving = false
    }
  }

  function markDirty() {
    if (!wb.docPath || store.currentFileType !== 'markdown')
      return
    wb.dirty = true
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flushSave, SAVE_DELAY)
  }

  function remember(path: string) {
    recentFiles.value = [path, ...recentFiles.value.filter(p => p !== path)].slice(0, 30)
    const ws = fileTree.currentWorkspacePath
    if (ws)
      localStorage.setItem(`lb-last-file:${ws}`, path)
  }

  async function openNode(node: FileNode) {
    if (node.type !== 'file')
      return
    await flushSave()
    fileTree.selectNode(node)
    const type = fileTypeOf(node.name)
    store.currentFileType = type
    store.currentFilePath = node.path
    const ed = editor()
    let content = ''
    if (type === 'markdown' || type === 'other') {
      try {
        content = await fileTree.readFileContent(node.path)
      }
      catch {
        toast.error('无法读取该文件')
      }
    }
    ed?.loadDocument(content)
    wb.docPath = node.path
    wb.dirty = false
    if (type === 'markdown')
      remember(node.path)
    loadedTick.value++
    if (type === 'markdown' || type === 'other')
      ed?.focus()
  }

  async function openPath(path: string) {
    const node = fileTree.findNodeByPath(fileTree.fileTree, path)
    if (node)
      await openNode(node)
    return !!node
  }

  /** 工作区载入后：恢复上次打开的文件，否则打开第一篇 Markdown */
  async function openInitial() {
    const ws = fileTree.currentWorkspacePath
    const last = ws ? localStorage.getItem(`lb-last-file:${ws}`) : null
    if (last && await openPath(last))
      return
    const first = allFiles().find(n => fileTypeOf(n.name) === 'markdown')
    if (first)
      await openNode(first)
  }

  function allFiles(): FileNode[] {
    const out: FileNode[] = []
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.type === 'file')
          out.push(n)
        if (n.children)
          walk(n.children)
      }
    }
    walk(fileTree.fileTree)
    return out
  }

  /** 文件被重命名 / 移动后，更新当前文档路径 */
  function pathChanged(oldPath: string, newPath: string) {
    if (wb.docPath === oldPath) {
      wb.docPath = newPath
      store.currentFilePath = newPath
      remember(newPath)
    }
    else if (wb.docPath.startsWith(`${oldPath}/`)) {
      wb.docPath = newPath + wb.docPath.slice(oldPath.length)
      store.currentFilePath = wb.docPath
    }
    recentFiles.value = recentFiles.value.map(p => p === oldPath ? newPath : p)
  }

  /** 当前文件被删除 */
  function closeIfDeleted(path: string) {
    if (wb.docPath === path || wb.docPath.startsWith(`${path}/`)) {
      clearTimeout(saveTimer)
      wb.dirty = false
      wb.docPath = ''
      store.currentFilePath = ''
      store.currentFileType = 'markdown'
      editor()?.loadDocument('')
      loadedTick.value++
    }
  }

  return { flushSave, markDirty, openNode, openPath, openInitial, allFiles, pathChanged, closeIfDeleted, recentFiles }
}
