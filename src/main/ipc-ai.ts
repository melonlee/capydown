/**
 * AI 相关 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron';
import { ensureAIService, getAIService, resetAIService, getActiveAIServiceConfig } from './ai';
import { getAIConfig, setAIConfig, isAIEnabled, getAIServiceConfig } from './config/ai';
import { buildWritingContext } from './ai/context';
import { generateTitleSummary, proofreadDocument } from './ai/features';
import { isExperimentalEnabled } from './config/experimental';

/** 单篇文章的长度上限（字符），防止误把超大文件整个发出去 */
const MAX_ARTICLE_CHARS = 300_000;

/** 每个窗口当前的校对任务，用于取消 */
const proofreadJobs = new Map<number, { cancelled: boolean }>();

/**
 * 初始化 AI 相关 IPC 处理器
 */
export function initAIIpcHandlers(): void {
  console.log('[AI IPC] Initializing AI IPC handlers...');

  // ========== AI 配置管理 ==========

  // 获取 AI 配置
  ipcMain.handle('ai:get-config', async () => {
    return getAIConfig();
  });

  // 更新 AI 配置
  ipcMain.handle('ai:set-config', async (_, config) => {
    setAIConfig(config);
    resetAIService();
    return { success: true };
  });

  // 检查 AI 是否已启用
  ipcMain.handle('ai:is-enabled', async () => {
    return isAIEnabled();
  });

  // 获取 AI 服务配置
  ipcMain.handle('ai:get-service-config', async () => {
    // 已初始化的服务优先；否则读取已保存的配置（服务是首次调用时才懒加载的）
    const active = getActiveAIServiceConfig() ?? getAIServiceConfig();
    // 不把 API Key 回传给渲染进程
    return active ? { provider: active.provider, model: active.model, baseURL: active.baseURL } : null;
  });

  // ========== AI 文本生成 ==========

  // 生成文本
  ipcMain.handle('ai:generate-text', async (_, { prompt, options }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.generateText(prompt, options);
    } catch (error) {
      console.error('[AI IPC] generate-text error:', error);
      throw error;
    }
  });

  // ========== 发布前校对 ==========

  ipcMain.handle('ai:proofread', async (event, payload) => {
    const text = payload?.text;
    if (typeof text !== 'string')
      throw new Error('没有可校对的内容');
    if (text.length > MAX_ARTICLE_CHARS)
      throw new Error('文章太长（超过 30 万字），请分篇校对');
    await ensureAIInitialized();
    const service = getAIService();
    const senderId = event.sender.id;
    const job = { cancelled: false };
    proofreadJobs.set(senderId, job);
    try {
      return await proofreadDocument(service, text, {
        includeStyle: payload?.includeStyle === true,
        onProgress: (done, total) => {
          if (!event.sender.isDestroyed())
            event.sender.send('ai:proofread-progress', { done, total });
        },
        isCancelled: () => job.cancelled || event.sender.isDestroyed(),
      });
    }
    finally {
      if (proofreadJobs.get(senderId) === job)
        proofreadJobs.delete(senderId);
    }
  });

  ipcMain.handle('ai:proofread-cancel', (event) => {
    const job = proofreadJobs.get(event.sender.id);
    if (job)
      job.cancelled = true;
    return { success: true };
  });

  // ========== 标题 + 摘要 ==========

  ipcMain.handle('ai:title-summary', async (_, payload) => {
    const content = payload?.content;
    if (typeof content !== 'string' || !content.trim())
      throw new Error('文章还是空的');
    await ensureAIInitialized();
    return await generateTitleSummary(getAIService(), content.slice(0, MAX_ARTICLE_CHARS));
  });

  // 以下是旧的写作辅助接口（续写、润色、扩写、大纲、分析、生图…）：界面入口已移除，
  // 源码保留，只在开启「实验功能」后注册
  if (isExperimentalEnabled())
    initLegacyWritingHandlers();

  console.log('[AI IPC] AI IPC handlers initialized successfully');
}

function initLegacyWritingHandlers(): void {
  // 流式生成文本
  ipcMain.handle('ai:stream-text', async (event, { prompt, options }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw new Error('No focused window found');
      }

      await aiService.streamText(
        prompt,
        (text) => {
          window.webContents.send('ai:stream-chunk', { text });
        },
        options
      );

      window.webContents.send('ai:stream-end');
      return { success: true };
    } catch (error) {
      console.error('[AI IPC] stream-text error:', error);
      event.sender.send('ai:stream-error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  // ========== AI 写作辅助 ==========

  // 续写
  ipcMain.handle('ai:continue-writing', async (_, { content, cursorPosition, selection, documentPath }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();

      const context = buildWritingContext(
        content,
        cursorPosition,
        selection,
        documentPath
      );

      return await aiService.continueWriting(context);
    } catch (error) {
      console.error('[AI IPC] continue-writing error:', error);
      throw error;
    }
  });

  // 润色
  ipcMain.handle('ai:polish-text', async (_, { text, style }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.polishText(text, style);
    } catch (error) {
      console.error('[AI IPC] polish-text error:', error);
      throw error;
    }
  });

  // 扩写
  ipcMain.handle('ai:expand-text', async (_, { text, targetLength }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.expandText(text, targetLength);
    } catch (error) {
      console.error('[AI IPC] expand-text error:', error);
      throw error;
    }
  });

  // 摘要
  ipcMain.handle('ai:summarize-text', async (_, { text }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.summarizeText(text);
    } catch (error) {
      console.error('[AI IPC] summarize-text error:', error);
      throw error;
    }
  });

  // ========== AI 大纲生成 ==========

  // 生成大纲
  ipcMain.handle('ai:generate-outline', async (_, { topic, style }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.generateOutline(topic, style);
    } catch (error) {
      console.error('[AI IPC] generate-outline error:', error);
      throw error;
    }
  });

  // ========== AI 内容分析 ==========

  // 分析内容
  ipcMain.handle('ai:analyze-content', async (_, { content }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.analyzeContent(content);
    } catch (error) {
      console.error('[AI IPC] analyze-content error:', error);
      throw error;
    }
  });

  // 提取关键词
  ipcMain.handle('ai:extract-keywords', async (_, { content }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.extractKeywords(content);
    } catch (error) {
      console.error('[AI IPC] extract-keywords error:', error);
      throw error;
    }
  });

  // 推荐标签
  ipcMain.handle('ai:suggest-tags', async (_, { content }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.suggestTags(content);
    } catch (error) {
      console.error('[AI IPC] suggest-tags error:', error);
      throw error;
    }
  });

  // ========== AI 图片生成 ==========

  // 生成图片（占位实现）
  ipcMain.handle('ai:generate-image', async (_, { prompt, options }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.generateImage(prompt, options);
    } catch (error) {
      console.error('[AI IPC] generate-image error:', error);
      throw error;
    }
  });

  // 建议图片
  ipcMain.handle('ai:suggest-images', async (_, { content }) => {
    try {
      await ensureAIInitialized();
      const aiService = getAIService();
      return await aiService.suggestImages(content);
    } catch (error) {
      console.error('[AI IPC] suggest-images error:', error);
      throw error;
    }
  });
}

/**
 * 确保 AI 服务已初始化
 */
async function ensureAIInitialized(): Promise<void> {
  // 每次都读取已保存的配置：用户在设置里换了 Key / 模型后无需重启
  const config = getAIServiceConfig();
  if (!config) {
    throw new Error('还没有配置 AI：请在「偏好设置 → AI」里填写 API Key');
  }
  ensureAIService(config);
}
