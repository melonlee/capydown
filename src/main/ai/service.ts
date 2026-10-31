/**
 * AI 服务实例管理
 *
 * 配置变化（换 Key / 换模型 / 换服务商）后会自动重建实例。
 */

import type { AIService, AIServiceConfig } from './types';
import { ClaudeAIProvider } from './providers/claude';
import { OpenAICompatibleProvider } from './providers/openai-compatible';

let aiServiceInstance: AIService | null = null;
let aiServiceConfig: AIServiceConfig | null = null;
let configKey = '';

function keyOf(config: AIServiceConfig): string {
  return JSON.stringify([config.provider, config.apiKey, config.baseURL ?? '', config.model ?? ''])
}

export function createAIService(config: AIServiceConfig): AIService {
  switch (config.provider) {
    case 'claude':
      aiServiceInstance = new ClaudeAIProvider(config);
      break;
    case 'openai':
    case 'custom':
      aiServiceInstance = new OpenAICompatibleProvider(config);
      break;
    default:
      throw new Error(`未知的 AI 服务商：${String(config.provider)}`);
  }
  aiServiceConfig = config;
  configKey = keyOf(config);
  return aiServiceInstance;
}

/** 按当前配置拿到可用实例；配置没变就复用 */
export function ensureAIService(config: AIServiceConfig): AIService {
  if (!aiServiceInstance || keyOf(config) !== configKey) {
    return createAIService(config);
  }
  return aiServiceInstance;
}

export function resetAIService(): void {
  aiServiceInstance = null;
  aiServiceConfig = null;
  configKey = '';
}

export function getAIService(): AIService {
  if (!aiServiceInstance) {
    throw new Error('AI 服务未初始化，请先在设置中配置 API Key');
  }
  return aiServiceInstance;
}

export function getActiveAIServiceConfig(): AIServiceConfig | null {
  return aiServiceConfig;
}

export function hasAIService(): boolean {
  return aiServiceInstance !== null;
}
