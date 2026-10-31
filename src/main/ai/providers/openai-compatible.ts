/**
 * OpenAI 兼容 Provider
 *
 * 走标准的 POST {baseURL}/chat/completions 协议，可用于 OpenAI，以及提供
 * 兼容接口的国内模型服务（DeepSeek、Kimi / Moonshot、通义千问 DashScope 等），
 * 只需填写对应的 Base URL、API Key 和模型名。
 */

import type { AIServiceConfig, GenerationOptions, StreamCallback } from '../types';
import { BaseAIProvider } from './base';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** 去掉末尾斜杠，并补全 /chat/completions */
export function buildChatCompletionsUrl(baseURL?: string): string {
  const base = (baseURL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

/**
 * 解析 SSE 文本块。返回本次解析出的增量文本、是否收到 [DONE]，
 * 以及尚未构成完整行、需要和下一块拼接的剩余内容。
 */
export function parseChatCompletionSSE(buffer: string): { deltas: string[], done: boolean, rest: string } {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';
  const deltas: string[] = [];
  let done = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:'))
      continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const json = JSON.parse(data);
      const text = json?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0)
        deltas.push(text);
    }
    catch {
      // 心跳或不完整的 JSON，忽略
    }
  }
  return { deltas, done, rest };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    try {
      const json = JSON.parse(body);
      return json?.error?.message || json?.message || body.slice(0, 300);
    }
    catch {
      return body.slice(0, 300);
    }
  }
  catch {
    return response.statusText
  }
}

export class OpenAICompatibleProvider extends BaseAIProvider {
  private url: string;
  private apiKey: string;
  private model: string;

  constructor(config: AIServiceConfig) {
    super();
    if (!config.model) {
      throw new Error('请填写模型名称（例如 deepseek-chat、qwen-plus、gpt-4o-mini）');
    }
    this.url = buildChatCompletionsUrl(config.baseURL);
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  private buildBody(prompt: string, options: GenerationOptions | undefined, stream: boolean) {
    const messages: Array<{ role: string, content: string }> = [];
    if (options?.systemPrompt)
      messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });
    return {
      model: this.model,
      messages,
      max_tokens: options?.maxTokens || 4096,
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.stopSequences?.length ? { stop: options.stopSequences } : {}),
      stream,
    };
  }

  private async post(body: unknown): Promise<Response> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await readError(response)}`);
    }
    return response;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    try {
      const response = await this.post(this.buildBody(prompt, options, false));
      const json: any = await response.json();
      return json?.choices?.[0]?.message?.content ?? '';
    }
    catch (error) {
      console.error('OpenAI-compatible generateText error:', error);
      throw new Error(`AI 生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async streamText(prompt: string, callback: StreamCallback, options?: GenerationOptions): Promise<void> {
    try {
      const response = await this.post(this.buildBody(prompt, options, true));
      if (!response.body) {
        throw new Error('服务端没有返回数据流');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseChatCompletionSSE(buffer);
        buffer = parsed.rest;
        parsed.deltas.forEach(callback);
        if (parsed.done) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
      // 处理最后一行（没有换行结尾的情况）
      parseChatCompletionSSE(`${buffer}\n`).deltas.forEach(callback);
    }
    catch (error) {
      console.error('OpenAI-compatible streamText error:', error);
      throw new Error(`AI 流式生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
