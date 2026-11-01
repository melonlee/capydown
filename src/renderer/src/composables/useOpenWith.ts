/**
 * 「用 LazyBox 打开」的渲染进程部分：主进程交来一个 Markdown 文件路径后，
 * 文件在当前工作区内就直接打开；否则把它所在的文件夹作为工作区打开（Typora 式）。
 * 只读取文件，不会写入。
 */
import { useDocument } from '@renderer/composables/useDocument'
import { useStore, useWorkspaceStore } from '@renderer/stores'
import { useFileTreeStore } from '@renderer/stores/fileTree'
import { useWorkbenchStore } from '@renderer/stores/workbench'

async function waitFor(check: () => boolean, timeout = 10000): Promise<boolean> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout)
      return false
    await new Promise(r => setTimeout(r, 80))
  }
  return true
}

export function useOpenWith(): { openExternalFile: (file: string) => Promise<void>, takePending: () => Promise<void> } {
  const store = useStore()
  const workspace = useWorkspaceStore()
  const fileTree = useFileTreeStore()
  const wb = useWorkbenchStore()
  const doc = useDocument()

  let queue = Promise.resolve()

  async function open(file: string): Promise<void> {
    const target = await window.$api.resolveOpenTarget(file, workspace.currentWorkspace?.path ?? null)
    if (!target) {
      toast.error(`无法打开：${file}`)
      return
    }
    if (target.switchWorkspace) {
      // 先把当前文档未保存的修改写回，再切换工作区；新工作区载入后优先打开这个文件
      await doc.flushSave().catch(() => {})
      localStorage.setItem(`lb-last-file:${target.workspace}`, target.file)
      const ws = await workspace.openExistingWorkspace(target.workspace)
      if (!ws)
        return
    }
    const found = await waitFor(() => !!store.editor
      && fileTree.currentWorkspacePath === target.workspace
      && !!fileTree.findNodeByPath(fileTree.fileTree, target.file))
    if (!found) {
      toast.error(`没有在工作区里找到 ${target.file.split(/[\\/]/).pop()}`)
      return
    }
    if (wb.docPath !== target.file)
      await doc.openPath(target.file)
  }

  /** 依次处理，避免同时打开多个文件时互相打断 */
  function openExternalFile(file: string): Promise<void> {
    queue = queue.then(() => open(file)).catch((e) => {
      console.error('[open-with]', e)
    })
    return queue
  }

  async function takePending(): Promise<void> {
    const files: string[] = await window.$api.takePendingOpenFiles?.() ?? []
    for (const f of files)
      openExternalFile(f)
  }

  return { openExternalFile, takePending }
}
