import { contextBridge, ipcRenderer } from 'electron'

// 注意：本预加载脚本运行在 sandbox 中，只能使用 contextBridge / ipcRenderer。
// 不再暴露 @electron-toolkit/preload 的通用 ipcRenderer（它允许渲染进程调用任意通道）。

// Custom APIs for renderer
const api = {
  // 仅在端到端测试（CAPYDOWN_E2E=1 启动）时为 true，用于暴露测试钩子
  isE2E: process.env.CAPYDOWN_E2E === '1',
  onMessage: (callback: (...args: any[]) => void) => ipcRenderer.on('message-to-renderer', (_, ...args) => callback(...args)),

  // 应用信息 / 设置
  getDefaultDocument: () => ipcRenderer.invoke('app:get-default-document'),
  getExperimentalEnabled: () => ipcRenderer.invoke('app:get-experimental'),
  setExperimentalEnabled: (enabled: boolean) => ipcRenderer.invoke('app:set-experimental', enabled),
  
  // 旧版 API（保留向后兼容）
  addPost2Local: (title, content) => ipcRenderer.invoke('add-post', { title, content }),
  renamePost: (originTitle, newTitle) => ipcRenderer.invoke('rename-post', { originTitle, newTitle }),
  removePost: (title) => ipcRenderer.invoke('remove-post', { title }),
  updatePost: (title, content) => ipcRenderer.invoke('update-post', { title, content }),
  getPost: (title) => ipcRenderer.invoke('get-post', { title }),
  importPost: () => ipcRenderer.invoke('import-post'),

  // 新版文件树 API
  readDirectoryTree: (workspaceDir?: string) => ipcRenderer.invoke('read-directory-tree', { workspaceDir }),
  selectWorkspaceFolder: () => ipcRenderer.invoke('select-workspace-folder'),
  createFolder: (parentPath: string, folderName: string) => 
    ipcRenderer.invoke('create-folder', { parentPath, folderName }),
  renameFolder: (oldPath: string, newName: string) => 
    ipcRenderer.invoke('rename-folder', { oldPath, newName }),
  removeFolder: (folderPath: string) => 
    ipcRenderer.invoke('remove-folder', { folderPath }),
  createFile: (dirPath: string, fileName: string, content: string) => 
    ipcRenderer.invoke('create-file', { dirPath, fileName, content }),
  renameFile: (filePath: string, newName: string) => 
    ipcRenderer.invoke('rename-file', { filePath, newName }),
  removeFile: (filePath: string) => 
    ipcRenderer.invoke('remove-file', { filePath }),
  readFile: (filePath: string) => 
    ipcRenderer.invoke('read-file', { filePath }),
  readImageAsBase64: (filePath: string) => 
    ipcRenderer.invoke('read-image-as-base64', { filePath }),
  saveImageAsset: (docPath: string, fileName: string, mime: string, base64: string) =>
    ipcRenderer.invoke('save-image-asset', { docPath, fileName, mime, base64 }),
  readPdfAsBase64: (filePath: string) => 
    ipcRenderer.invoke('read-pdf-as-base64', { filePath }),
  updateFile: (filePath: string, content: string) => 
    ipcRenderer.invoke('update-file', { filePath, content }),
  moveFileOrFolder: (sourcePath: string, targetPath: string) => 
    ipcRenderer.invoke('move-file-or-folder', { sourcePath, targetPath }),
  copyFile: (sourcePath: string, targetPath: string) => 
    ipcRenderer.invoke('copy-file', { sourcePath, targetPath }),

  // 工作空间 API
  createWorkspace: (path: string) => 
    ipcRenderer.invoke('create-workspace', { path }),
  validateWorkspace: (path: string) => 
    ipcRenderer.invoke('validate-workspace', { path }),
  getDefaultWorkspacePath: () => 
    ipcRenderer.invoke('get-default-workspace-path'),
  openWorkspaceFolder: (path: string) => 
    ipcRenderer.invoke('open-workspace-folder', { path }),
  openPdfExternally: (filePath: string) =>
    ipcRenderer.invoke('open-pdf-externally', { filePath }),
  
  // 窗口管理 API
  setWindowTitle: (title: string) =>
    ipcRenderer.invoke('set-window-title', { title }),
  updateMenuState: (state: Record<string, unknown>) =>
    ipcRenderer.send('menu:update-state', state),
  /** 编辑区右键菜单：只上报上下文，菜单由主进程用共享命令表生成 */
  showEditorContextMenu: (ctx: { hasSelection: boolean, linkUrl: string | null, imageUrl: string | null }) =>
    ipcRenderer.invoke('editor:context-menu', {
      hasSelection: ctx.hasSelection === true,
      linkUrl: typeof ctx.linkUrl === 'string' ? ctx.linkUrl : null,
      imageUrl: typeof ctx.imageUrl === 'string' ? ctx.imageUrl : null,
    }),
  /** 记录当前主题的窗口底色（下次启动的 BrowserWindow.backgroundColor） */
  setBootTheme: (theme: 'light' | 'paper' | 'dark') =>
    ipcRenderer.send('app:set-boot-theme', theme),

  // 用 Capydown 打开（系统「打开方式」/ 命令行参数）
  takePendingOpenFiles: () => ipcRenderer.invoke('app:take-pending-open-files'),
  resolveOpenTarget: (file: string, workspace?: string | null) =>
    ipcRenderer.invoke('app:resolve-open-target', { file, workspace }),

  // 导出 PDF / Word
  exportPdf: (html: string, docPath?: string, title?: string) =>
    ipcRenderer.invoke('export:pdf', { html, docPath, title }),
  exportDocx: (markdown: string, docPath?: string, title?: string) =>
    ipcRenderer.invoke('export:docx', { markdown, docPath, title }),
  showExportedFile: (filePath: string) =>
    ipcRenderer.invoke('export:show-in-folder', { filePath }),

  // ========== AI 配置管理 ==========
  aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
  aiSetConfig: (config: any) => ipcRenderer.invoke('ai:set-config', config),
  aiIsEnabled: () => ipcRenderer.invoke('ai:is-enabled'),
  aiGetServiceConfig: () => ipcRenderer.invoke('ai:get-service-config'),

  // ========== 发布前校对 / 标题 + 摘要 ==========
  aiProofread: (text: string, options?: { includeStyle?: boolean }) => ipcRenderer.invoke('ai:proofread', { text, includeStyle: options?.includeStyle === true }),
  aiProofreadCancel: () => ipcRenderer.invoke('ai:proofread-cancel'),
  /** 订阅校对进度，返回取消订阅函数 */
  onAIProofreadProgress: (callback: (data: { done: number, total: number }) => void) => {
    const listener = (_: unknown, data: { done: number, total: number }) => callback(data)
    ipcRenderer.on('ai:proofread-progress', listener)
    return () => ipcRenderer.removeListener('ai:proofread-progress', listener)
  },
  aiTitleSummary: (content: string) => ipcRenderer.invoke('ai:title-summary', { content }),

  // ========== AI 文本生成 ==========
  aiGenerateText: (prompt: string, options?: any) =>
    ipcRenderer.invoke('ai:generate-text', { prompt, options }),
  aiStreamText: (prompt: string, options?: any) =>
    ipcRenderer.invoke('ai:stream-text', { prompt, options }),

  // 监听 AI 流式响应事件
  onAIStreamChunk: (callback: (data: { text: string }) => void) =>
    ipcRenderer.on('ai:stream-chunk', (_, data) => callback(data)),
  onAIStreamEnd: (callback: () => void) =>
    ipcRenderer.once('ai:stream-end', () => callback()),
  onAIStreamError: (callback: (data: { error: string }) => void) =>
    ipcRenderer.once('ai:stream-error', (_, data) => callback(data)),

  // ========== AI 写作辅助 ==========
  aiContinueWriting: (params: {
    content: string;
    cursorPosition: { line: number; ch: number };
    selection: { start: { line: number; ch: number }; end: { line: number; ch: number } } | null;
    documentPath: string;
  }) => ipcRenderer.invoke('ai:continue-writing', params),

  aiPolishText: (text: string, style: string) =>
    ipcRenderer.invoke('ai:polish-text', { text, style }),
  aiExpandText: (text: string, targetLength?: number) =>
    ipcRenderer.invoke('ai:expand-text', { text, targetLength }),
  aiSummarizeText: (text: string) =>
    ipcRenderer.invoke('ai:summarize-text', { text }),

  // ========== AI 大纲生成 ==========
  aiGenerateOutline: (topic: string, style: string) =>
    ipcRenderer.invoke('ai:generate-outline', { topic, style }),

  // ========== AI 内容分析 ==========
  aiAnalyzeContent: (content: string) =>
    ipcRenderer.invoke('ai:analyze-content', { content }),
  aiExtractKeywords: (content: string) =>
    ipcRenderer.invoke('ai:extract-keywords', { content }),
  aiSuggestTags: (content: string) =>
    ipcRenderer.invoke('ai:suggest-tags', { content }),

  // ========== 图片生成 ==========
  imageGenerate: (prompt: string, options?: any) =>
    ipcRenderer.invoke('image:generate', { prompt, options }),
  imageSaveApiKey: (apiKey: string) =>
    ipcRenderer.invoke('image:save-api-key', { apiKey }),
  imageGetApiKey: () =>
    ipcRenderer.invoke('image:get-api-key'),
  imageSuggest: (content: string) =>
    ipcRenderer.invoke('image:suggest', { content }),
  imageRemoveBackground: (imageData: string) =>
    ipcRenderer.invoke('image:remove-background', { imageData }),
  imageTransformStyle: (imageData: string, style: string) =>
    ipcRenderer.invoke('image:transform-style', { imageData, style }),
  imageSelectFile: () =>
    ipcRenderer.invoke('image:select-file'),

  // ========== 模板系统 ==========
  templateGetAll: () =>
    ipcRenderer.invoke('template:get-all'),
  templateGetByCategory: (category: string) =>
    ipcRenderer.invoke('template:get-by-category', { category }),
  templateSearch: (query: string) =>
    ipcRenderer.invoke('template:search', { query }),
  templateApply: (content: string, templateId: string) =>
    ipcRenderer.invoke('template:apply', { content, templateId }),
  templateGetDetails: (templateId: string) =>
    ipcRenderer.invoke('template:get-details', { templateId }),
  templateAdd: (template: any) =>
    ipcRenderer.invoke('template:add', { template }),
  templateRemove: (templateId: string) =>
    ipcRenderer.invoke('template:remove', { templateId }),

  // ========== 发布（公众号复制 / Markdown 导出） ==========
  publishGetPlatforms: () =>
    ipcRenderer.invoke('publish:get-platforms'),
  publish: (platform: string, content: string, metadata: any, context?: { html?: string; filePath?: string }) =>
    ipcRenderer.invoke('publish:publish', { platform, content, metadata, context }),
  publishSelectSavePath: (defaultName?: string) =>
    ipcRenderer.invoke('publish:select-save-path', { defaultName }),

  // ========== 向量存储与语义搜索 ==========
  vectorSemanticSearch: (query: string, options?: any) =>
    ipcRenderer.invoke('vector:semantic-search', { query, options }),
  vectorHybridSearch: (query: string, options?: any) =>
    ipcRenderer.invoke('vector:hybrid-search', { query, options }),
  vectorQuestionAnswer: (question: string, topK?: number) =>
    ipcRenderer.invoke('vector:question-answer', { question, topK }),
  vectorIndexDocument: (content: string, metadata: any) =>
    ipcRenderer.invoke('vector:index-document', { content, metadata }),
  vectorFindSimilar: (documentId: string, topK?: number) =>
    ipcRenderer.invoke('vector:find-similar', { documentId, topK }),
  vectorGraphStats: () =>
    ipcRenderer.invoke('vector:graph-stats'),
  vectorGetRelated: (documentId: string, maxDepth?: number) =>
    ipcRenderer.invoke('vector:get-related', { documentId, maxDepth }),
  vectorGraphVisualization: () =>
    ipcRenderer.invoke('vector:graph-visualization'),
  vectorAnalyzeRelations: (documentId: string) =>
    ipcRenderer.invoke('vector:analyze-relations', { documentId }),
  vectorGetChunks: (documentId: string) =>
    ipcRenderer.invoke('vector:get-chunks', { documentId }),
  vectorRemoveDocument: (documentId: string) =>
    ipcRenderer.invoke('vector:remove-document', { documentId }),
  vectorClearStore: () =>
    ipcRenderer.invoke('vector:clear-store'),
  vectorSimilarity: (text1: string, text2: string) =>
    ipcRenderer.invoke('vector:similarity', { text1, text2 }),

  // ========== MCP 插件系统 ==========
  mcpGetPlugins: () =>
    ipcRenderer.invoke('mcp:get-plugins'),
  mcpEnablePlugin: (pluginId: string) =>
    ipcRenderer.invoke('mcp:enable-plugin', { pluginId }),
  mcpDisablePlugin: (pluginId: string) =>
    ipcRenderer.invoke('mcp:disable-plugin', { pluginId }),
  mcpGetTools: () =>
    ipcRenderer.invoke('mcp:get-tools'),
  mcpSearchTools: (query: string) =>
    ipcRenderer.invoke('mcp:search-tools', { query }),
  mcpExecuteTool: (toolName: string, params: any, context?: any) =>
    ipcRenderer.invoke('mcp:execute-tool', { toolName, params, context }),
  mcpGetResources: () =>
    ipcRenderer.invoke('mcp:get-resources'),
  mcpGetResource: (uri: string, context?: any) =>
    ipcRenderer.invoke('mcp:get-resource', { uri, context }),

  // ========== SKILL 系统 ==========
  skillGetAll: () =>
    ipcRenderer.invoke('skill:get-all'),
  skillGetByCategory: (category: string) =>
    ipcRenderer.invoke('skill:get-by-category', { category }),
  skillSearch: (query: string) =>
    ipcRenderer.invoke('skill:search', { query }),
  skillExecute: (skillId: string, context: any) =>
    ipcRenderer.invoke('skill:execute', { skillId, context }),
  skillEnable: (skillId: string) =>
    ipcRenderer.invoke('skill:enable', { skillId }),
  skillDisable: (skillId: string) =>
    ipcRenderer.invoke('skill:disable', { skillId }),
  skillImport: (skillDefinition: any) =>
    ipcRenderer.invoke('skill:import', { skillDefinition }),
  skillExport: (skillId: string) =>
    ipcRenderer.invoke('skill:export', { skillId }),
  skillRegister: (skill: any) =>
    ipcRenderer.invoke('skill:register', { skill }),
  skillUnregister: (skillId: string) =>
    ipcRenderer.invoke('skill:unregister', { skillId }),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('$api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.$api = api
}
