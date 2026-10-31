<script setup lang="ts">
import { useWorkspaceStore } from '@renderer/stores'
import BrandMark from '@renderer/components/brand/BrandMark.vue'
import { Edit2, ExternalLink, FolderOpen, FolderPlus, MoreHorizontal, Trash2 } from 'lucide-vue-next'
import type { Workspace } from '@renderer/types'

const workspaceStore = useWorkspaceStore()

const showCreateDialog = ref(false)
const newWorkspaceName = ref('')
const newWorkspacePath = ref('')

const showRenameDialog = ref(false)
const renamingWorkspaceId = ref<string | null>(null)
const renameWorkspaceName = ref('')

// 创建新工作空间
const handleCreateWorkspace = async () => {
  try {
    if (!newWorkspaceName.value.trim()) {
      toast.error('请输入工作空间名称')
      return
    }
    const folderPath = await window.$api.selectWorkspaceFolder()
    
    if (!folderPath) {
      return
    }

    newWorkspacePath.value = folderPath
    const workspace = await workspaceStore.createWorkspace(newWorkspaceName.value, folderPath)
    
    if (workspace) {
      showCreateDialog.value = false
      newWorkspaceName.value = ''
      newWorkspacePath.value = ''
      // 自动打开新创建的工作空间
      await workspaceStore.setCurrentWorkspace(workspace.id)
    } else {
      console.error('[Welcome] Workspace creation returned null')
      toast.error('创建工作空间失败')
    }
  } catch (error) {
    console.error('[Welcome] Error creating workspace:', error)
    toast.error('创建工作空间时出错：' + (error as Error).message)
  }
}

// 打开已有工作空间
const handleOpenExisting = async () => {
  try {
    const folderPath = await window.$api.selectWorkspaceFolder()
    
    if (!folderPath) {
      return
    }
    const workspace = await workspaceStore.openExistingWorkspace(folderPath)
    
    if (!workspace) {
      toast.error('打开工作空间失败')
    }
  } catch (error) {
    console.error('Error opening workspace:', error)
    toast.error('打开工作空间时出错：' + (error as Error).message)
  }
}

// 打开工作空间
const openWorkspace = async (workspaceId: string) => {
  await workspaceStore.setCurrentWorkspace(workspaceId)
}

// 重命名工作空间
const handleRename = (workspace: Workspace) => {
  renamingWorkspaceId.value = workspace.id
  renameWorkspaceName.value = workspace.name
  showRenameDialog.value = true
}

const confirmRename = () => {
  if (!renamingWorkspaceId.value || !renameWorkspaceName.value.trim()) {
    return
  }
  
  workspaceStore.renameWorkspace(renamingWorkspaceId.value, renameWorkspaceName.value)
  showRenameDialog.value = false
  renamingWorkspaceId.value = null
  renameWorkspaceName.value = ''
}

// 删除工作空间
const handleRemove = (workspaceId: string) => {
  const workspace = workspaceStore.getWorkspace(workspaceId)
  if (!workspace) return

  const confirmed = confirm(`确定要移除工作空间 "${workspace.name}" 吗？\n\n这不会删除您的文件，只是从列表中移除。`)
  if (confirmed) {
    workspaceStore.removeWorkspace(workspaceId)
  }
}

// 路径里的用户目录显示成 ~
function shortPath(p: string) {
  return p.replace(/^\/Users\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/i, '~')
}

const isMac = /Mac/i.test(navigator.userAgent)

// 在文件管理器中打开
const openInFinder = async (workspace: Workspace) => {
  await window.$api.openWorkspaceFolder(workspace.path)
}
</script>

<template>
  <div class="lb-welcome">
    <div class="lb-welcome-drag draggable-area" />

    <main class="lb-welcome-main">
      <header class="lb-welcome-brand">
        <BrandMark class="lb-welcome-logo" />
        <h1>LazyBox <span class="lb-welcome-dot">·</span> 墨排</h1>
        <p>Typora 式公众号编辑器</p>
      </header>

      <section class="lb-welcome-actions">
        <button class="lb-welcome-action" @click="handleOpenExisting">
          <FolderOpen class="size-[18px]" />
          <span class="lb-welcome-action-text">
            <strong>打开文件夹…</strong>
            <small>选择一个装着 Markdown 文章的文件夹</small>
          </span>
        </button>
        <button class="lb-welcome-action" @click="showCreateDialog = true">
          <FolderPlus class="size-[18px]" />
          <span class="lb-welcome-action-text">
            <strong>新建工作空间…</strong>
            <small>起个名字，再选一个空文件夹存放文章和素材</small>
          </span>
        </button>
      </section>

      <section v-if="workspaceStore.recentWorkspaces.length > 0" class="lb-welcome-recent">
        <h2>最近打开</h2>
        <ul>
          <li
            v-for="workspace in workspaceStore.recentWorkspaces"
            :key="workspace.id"
            class="lb-welcome-recent-item"
            @click="openWorkspace(workspace.id)"
          >
            <span class="lb-welcome-recent-name">{{ workspace.name }}</span>
            <span class="lb-welcome-recent-path" :title="workspace.path">{{ shortPath(workspace.path) }}</span>
            <DropdownMenu>
              <!-- 不用 as-child：v-for 里 as-child 会丢掉子元素的 class -->
              <DropdownMenuTrigger class="lb-welcome-more" title="更多" @click.stop>
                <MoreHorizontal class="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click.stop="openWorkspace(workspace.id)">
                  <FolderOpen class="mr-2 size-4" />
                  打开
                </DropdownMenuItem>
                <DropdownMenuItem @click.stop="handleRename(workspace)">
                  <Edit2 class="mr-2 size-4" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuItem @click.stop="openInFinder(workspace)">
                  <ExternalLink class="mr-2 size-4" />
                  {{ isMac ? '在访达中显示' : '在文件管理器中打开' }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click.stop="handleRemove(workspace.id)">
                  <Trash2 class="mr-2 size-4" />
                  从列表中移除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </section>
    </main>

    <footer class="lb-welcome-foot">
      文章就是你硬盘里的 .md 文件 · 打开不会改动文件，编辑后自动保存
    </footer>

    <!-- 创建工作空间对话框 -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建工作空间</DialogTitle>
          <DialogDescription>
            输入名称后选择一个文件夹，文章会以 .md 文件保存在里面
          </DialogDescription>
        </DialogHeader>

        <div class="dialog-form">
          <div class="form-field">
            <Label for="workspace-name">工作空间名称</Label>
            <Input
              id="workspace-name"
              v-model="newWorkspaceName"
              placeholder="例如：我的公众号"
              @keyup.enter="handleCreateWorkspace"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">
            取消
          </Button>
          <Button @click="handleCreateWorkspace">
            选择文件夹并创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 重命名工作空间对话框 -->
    <Dialog v-model:open="showRenameDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名工作空间</DialogTitle>
        </DialogHeader>

        <div class="dialog-form">
          <div class="form-field">
            <Label for="rename-workspace">新名称</Label>
            <Input
              id="rename-workspace"
              v-model="renameWorkspaceName"
              @keyup.enter="confirmRename"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showRenameDialog = false">
            取消
          </Button>
          <Button @click="confirmRename">
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* 与工作台同一套主题变量（workbench.css），跟随 GitHub / Newsprint / Night 主题 */
.lb-welcome {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  background: var(--lb-bg);
  color: var(--lb-fg);
  font-family: var(--lb-font);
  -webkit-font-smoothing: antialiased;
}

.lb-welcome-drag {
  position: fixed;
  inset: 0 0 auto;
  height: 38px;
  z-index: 1;
}

.lb-welcome-main {
  width: 100%;
  max-width: 460px;
  margin: auto 0;
  padding: 64px 24px 24px;
}

.lb-welcome-brand {
  text-align: center;
  margin-bottom: 36px;
}

.lb-welcome-logo {
  width: 52px;
  height: 52px;
  margin: 0 auto 18px;
  color: var(--lb-fg-strong);
  user-select: none;
}

.lb-welcome-brand h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--lb-fg-strong);
}

.lb-welcome-dot {
  color: var(--lb-faint);
  font-weight: 400;
}

.lb-welcome-brand p {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--lb-muted);
}

.lb-welcome-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lb-welcome-action {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 13px 16px;
  text-align: left;
  color: var(--lb-fg-strong);
  background: var(--lb-bg);
  border: 1px solid var(--lb-border-strong);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.lb-welcome-action:hover {
  background: var(--lb-hover);
}

.lb-welcome-action:first-child svg {
  color: var(--lb-fg-strong);
}

.lb-welcome-action svg {
  flex-shrink: 0;
  color: var(--lb-muted);
}

.lb-welcome-action-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lb-welcome-action strong {
  font-size: 14px;
  font-weight: 550;
}

.lb-welcome-action small {
  font-size: 12px;
  color: var(--lb-muted);
}

.lb-welcome-recent {
  margin-top: 32px;
}

.lb-welcome-recent h2 {
  margin: 0 0 6px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--lb-faint);
}

.lb-welcome-recent ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lb-welcome-recent-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  height: 34px;
  padding: 0 4px 0 10px;
  border-radius: 7px;
  cursor: pointer;
  line-height: 34px;
}

.lb-welcome-recent-item:hover {
  background: var(--lb-hover);
}

.lb-welcome-recent-name {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  color: var(--lb-fg-strong);
}

.lb-welcome-recent-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--lb-faint);
}

.lb-welcome-more {
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lb-muted);
  cursor: pointer;
  opacity: 0;
}

.lb-welcome-recent-item:hover .lb-welcome-more,
.lb-welcome-more[data-state='open'] {
  opacity: 1;
}

.lb-welcome-more:hover {
  background: var(--lb-active);
}

.lb-welcome-foot {
  padding: 16px 24px 22px;
  font-size: 12px;
  color: var(--lb-faint);
  text-align: center;
}

.dialog-form {
  padding: 1rem 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
