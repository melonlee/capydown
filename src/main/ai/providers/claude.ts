/**
 * Claude (Anthropic) Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIServiceConfig, GenerationOptions, StreamCallback } from '../types';
import { BaseAIProvider } from './base';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-7';

export class ClaudeAIProvider extends BaseAIProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: AIServiceConfig) {
    super();
    this.model = config.model || DEFAULT_CLAUDE_MODEL;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
    });
  }

  // 注意：不传 temperature / top_p —— Claude Opus 4.7 不再接受采样参数（会返回 400）
  private buildParams(prompt: string, options?: GenerationOptions) {
    return {
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
      ...(options?.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
      messages: [{ role: 'user' as const, content: prompt }],
    };
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    try {
      const response = await this.client.messages.create(this.buildParams(prompt, options));
      return response.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('');
    }
    catch (error) {
      console.error('Claude generateText error:', error);
      throw new Error(`AI 生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async streamText(prompt: string, callback: StreamCallback, options?: GenerationOptions): Promise<void> {
    try {
      const stream = this.client.messages.stream(this.buildParams(prompt, options));
      stream.on('text', delta => callback(delta));
      await stream.finalMessage();
    }
    catch (error) {
      console.error('Claude streamText error:', error);
      throw new Error(`AI 流式生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
