<script setup lang="ts">
import { useWorkspaceStore } from '@renderer/stores'
import { useFileTreeStore } from '@renderer/stores/fileTree'
import type { FileNode } from '@renderer/types'
import FileTree from '@renderer/components/FileTree/FileTree.vue'
import emitter from '@renderer/utils/event'
import { MoreVertical, X, RefreshCw, Plus, FolderPlus } from 'lucide-vue-next'
import { toast } from '@renderer/utils/toast'
import { useDocument } from '@renderer/composables/useDocument'

const fileTreeStore = useFileTreeStore()
const workspaceStore = useWorkspaceStore()
const doc = useDocument()

// 对话框状态
const createFileDialog = ref(false)
const createFolderDialog = ref(false)
const renameDialog = ref(false)
const deleteDialog = ref(false)

// 输入框内容
const newFileName = ref('')
const newFolderName = ref('')
const renameValue = ref('')

// 当前操作的节点
const currentNode = ref<FileNode | null>(null)
const parentFolderForCreate = ref<FileNode | null>(null)

// 关闭工作区
const handleCloseWorkspace = async () => {
  await doc.flushSave()
  workspaceStore.closeCurrentWorkspace()
}

// 切换工作区
const handleWorkspaceChange = async (workspaceId: string) => {
  if (!workspaceId || workspaceId === workspaceStore.currentWorkspaceId) {
    return
  }
  
  const workspace = workspaceStore.setCurrentWorkspace(workspaceId)
  if (workspace) {
    // 重新加载文件树
    await fileTreeStore.loadFileTree()
    toast.success(`已切换到工作区：${workspace.name}`)
  }
}

// 刷新文件树
const isRefreshing = ref(false)
const handleRefreshFileTree = async () => {
  if (isRefreshing.value) return
  
  isRefreshing.value = true
  try {
    await fileTreeStore.loadFileTree()
    toast.success('文件树已刷新')
  } catch (error) {
    console.error('Failed to refresh file tree:', error)
    toast.error('刷新文件树失败')
  } finally {
    isRefreshing.value = false
  }
}

// 加载文件树
onMounted(async () => {
  // 监听新建文件事件
  emitter.on('new-file', () => {
    handleCreateFile()
  })
})

onUnmounted(() => {
  emitter.off('new-file')
})

// 选择文件：交给 useDocument 打开（会先保存当前文件）
const handleSelectNode = async (node: FileNode) => {
  await doc.openNode(node)
}

// 创建文件
const handleCreateFile = (parentNode: FileNode | null = null) => {
  createFileDialog.value = true
  newFileName.value = ''
  
  // 优先使用传入的父节点，其次使用当前选中的节点（如果是文件夹）
  if (parentNode) {
    parentFolderForCreate.value = parentNode
  } else if (fileTreeStore.selectedNode?.type === 'folder') {
    parentFolderForCreate.value = fileTreeStore.selectedNode
  } else {
    parentFolderForCreate.value = null
  }
}

const confirmCreateFile = async () => {
  if (!newFileName.value.trim()) {
    toast.error('文件名不能为空')
    return
  }

  // 确定父目录路径
  const parentPath = parentFolderForCreate.value?.path || getDefaultAppDir()
  
  const result = await fileTreeStore.createFile(parentPath, newFileName.value)
  if (result) {
    createFileDialog.value = false
    
    // 选中新创建的文件
    const newNode = fileTreeStore.findNodeByPath(fileTreeStore.fileTree, result)
    if (newNode) {
      await handleSelectNode(newNode)
    }
  }
}

// 创建文件夹
const handleCreateFolder = (parentNode: FileNode | null) => {
  createFolderDialog.value = true
  newFolderName.value = ''
  parentFolderForCreate.value = parentNode
}

const confirmCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    toast.error('文件夹名不能为空')
    return
  }

  const parentPath = parentFolderForCreate.value?.path || getDefaultAppDir()
  
  const result = await fileTreeStore.createFolder(parentPath, newFolderName.value)
  if (result) {
    createFolderDialog.value = false
  }
}

// 重命名
const handleRename = (node: FileNode) => {
  currentNode.value = node
  renameValue.value = node.type === 'file' 
    ? node.name.replace('.md', '') 
    : node.name
  renameDialog.value = true
}

const confirmRename = async () => {
  if (!renameValue.value.trim()) {
    toast.error('名称不能为空')
    return
  }

  if (currentNode.value) {
    const oldPath = currentNode.value.path
    await doc.flushSave()
    const result = await fileTreeStore.renameNode(currentNode.value, renameValue.value)
    if (result) {
      renameDialog.value = false
      doc.pathChanged(oldPath, result)
    }
  }
}

// 删除
const handleDelete = (node: FileNode) => {
  currentNode.value = node
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (currentNode.value) {
    const path = currentNode.value.path
    const result = await fileTreeStore.deleteNode(currentNode.value)
    if (result) {
      deleteDialog.value = false
      doc.closeIfDeleted(path)
    }
  }
}

// 移动节点
const handleMoveNode = async (sourceNode: FileNode, targetNode: FileNode) => {
  await doc.flushSave()
  const result = await fileTreeStore.moveNode(sourceNode, targetNode)
  if (result)
    doc.pathChanged(sourceNode.path, result)
}

// 复制节点
const handleCopyNode = async (sourceNode: FileNode, targetNode: FileNode) => {
  await fileTreeStore.copyNode(sourceNode, targetNode)
}

// 获取默认应用目录
const getDefaultAppDir = () => {
  return fileTreeStore.getWorkspacePath()
}
</script>

<template>
  <div class="file-tree-panel">
    <div class="panel-content">
      <!-- 工作区标题栏 -->
      <div class="workspace-header">
        <Select 
          :model-value="workspaceStore.currentWorkspaceId || undefined"
          @update:model-value="handleWorkspaceChange"
        >
          <SelectTrigger class="workspace-select">
            <SelectValue :placeholder="workspaceStore.currentWorkspace?.name || '选择工作区'" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem 
              v-for="workspace in workspaceStore.workspaces" 
              :key="workspace.id"
              :value="workspace.id"
            >
              <div class="workspace-item">
                <span v-if="workspace.icon" class="workspace-icon">{{ workspace.icon }}</span>
                <span class="workspace-item-name">{{ workspace.name }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <div class="workspace-actions">
          <TooltipProvider :delay-duration="200">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button 
                  size="xs" 
                  variant="ghost" 
                  @click="handleRefreshFileTree"
                  :disabled="isRefreshing"
                >
                  <RefreshCw class="size-4" :class="{ 'animate-spin': isRefreshing }" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">刷新</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider :delay-duration="200">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button size="xs" variant="ghost" @click="handleCreateFile(null)">
                  <Plus class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">新建文件</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider :delay-duration="200">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button size="xs" variant="ghost" @click="handleCreateFolder(null)">
                  <FolderPlus class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">新建文件夹</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button size="xs" variant="ghost">
                <MoreVertical class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click="handleCloseWorkspace">
                <X class="mr-2 size-4" />
                关闭工作区
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <!-- 文件树 -->
      <FileTree
        :nodes="fileTreeStore.fileTree"
        :selected-id="fileTreeStore.selectedNode?.id"
        @select="handleSelectNode"
        @create-file="handleCreateFile"
        @create-folder="handleCreateFolder"
        @rename-node="handleRename"
        @delete-node="handleDelete"
        @move-node="handleMoveNode"
        @copy-node="handleCopyNode"
      />
    </div>

    <!-- 创建文件对话框 -->
    <Dialog v-model:open="createFileDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件</DialogTitle>
          <DialogDescription>
            请输入文件名（自动添加 .md 后缀）
          </DialogDescription>
        </DialogHeader>
        <Input v-model="newFileName" placeholder="文件名" @keyup.enter="confirmCreateFile" />
        <DialogFooter>
          <Button variant="outline" @click="createFileDialog = false">
            取消
          </Button>
          <Button @click="confirmCreateFile">
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 创建文件夹对话框 -->
    <Dialog v-model:open="createFolderDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            请输入文件夹名称
          </DialogDescription>
        </DialogHeader>
        <Input v-model="newFolderName" placeholder="文件夹名称" @keyup.enter="confirmCreateFolder" />
        <DialogFooter>
          <Button variant="outline" @click="createFolderDialog = false">
            取消
          </Button>
          <Button @click="confirmCreateFolder">
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 重命名对话框 -->
    <Dialog v-model:open="renameDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名</DialogTitle>
          <DialogDescription>
            请输入新的名称
          </DialogDescription>
        </DialogHeader>
        <Input v-model="renameValue" @keyup.enter="confirmRename" />
        <DialogFooter>
          <Button variant="outline" @click="renameDialog = false">
            取消
          </Button>
          <Button @click="confirmRename">
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认对话框 -->
    <AlertDialog v-model:open="deleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 "{{ currentNode?.name }}" 吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
.file-tree-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-content {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 工作区标题栏 */
.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px 2px 10px;
  flex-shrink: 0;
  gap: 4px;
}

.workspace-select {
  flex: 1;
  height: 28px;
  min-width: 0;
  background-color: transparent;
  border: none;
  box-shadow: none;
  color: var(--lb-fg-strong);
  font-size: 13px;
  font-weight: 600;
  padding: 0 6px;
  border-radius: 6px;
}

.workspace-select:hover {
  background-color: var(--lb-hover);
}

.workspace-select :deep(svg) {
  color: var(--lb-faint);
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-icon {
  font-size: 1rem;
  line-height: 1;
}

.workspace-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.15s;
}

.workspace-header:hover .workspace-actions {
  opacity: 1;
}

.workspace-actions :deep(button) {
  color: var(--lb-muted);
  height: 26px;
  width: 26px;
  padding: 0;
}

.workspace-actions :deep(button:hover) {
  background: var(--lb-hover);
  color: var(--lb-fg);
}
</style>
