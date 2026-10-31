/**
 * Cursor 风格的 AI 内联编辑器
 * 在编辑器中直接显示 AI 建议和编辑
 */

import type { MarkdownEditor } from '@renderer/editor';
import { toast } from '@renderer/utils/toast';

export interface AISuggestion {
  text: string;
  type: 'continue' | 'edit' | 'insert';
}

interface InlineAIState {
  isGenerating: boolean;
  suggestion: AISuggestion | null;
  pendingRequest: AbortController | null;
}

/**
 * 灰色建议文字由编辑器的 ghostField 负责显示（见 editor/modes.ts）：
 * 用户继续输入或移动光标会自动清除，Tab 接受、Esc 取消。
 */
export class CursorInlineAI {
  private editor: MarkdownEditor;
  private state: InlineAIState = {
    isGenerating: false,
    suggestion: null,
    pendingRequest: null,
  };

  constructor(editor: MarkdownEditor) {
    this.editor = editor;
  }

  /**
   * 显示 ghost text (灰色建议文字)
   */
  showGhostText(text: string) {
    this.editor.showGhost(text);
    this.state.suggestion = { text, type: 'continue' };
  }

  /**
   * 清除 ghost text
   */
  clearGhost() {
    this.editor.clearGhost();
    this.state.suggestion = null;
  }

  /**
   * 接受建议
   */
  acceptSuggestion() {
    this.editor.acceptGhost();
    this.state.suggestion = null;
  }

  /**
   * AI 续写 - 流式生成
   */
  async continueWriting(context: {
    content: string;
    cursorPosition: { line: number; ch: number };
    documentPath: string;
  }) {
    if (this.state.isGenerating) return;

    this.state.isGenerating = true;
    this.state.pendingRequest = new AbortController();

    try {
      // 显示 "思考中..." 占位符
      this.showGhostText('✨ 思考中...');

      // 监听流式响应
      let accumulated = '';
      const streamHandler = (data: { text: string }) => {
        accumulated += data.text;
        this.showGhostText(accumulated);
      };

      const endHandler = () => {
        window.$api.onAIStreamEnd(() => {});
        window.$api.onAIStreamError(() => {});
        window.$api.onAIStreamChunk(() => {});
      };

      window.$api.onAIStreamChunk(streamHandler);
      window.$api.onAIStreamEnd(endHandler);
      window.$api.onAIStreamError(() => {});

      await window.$api.aiStreamText(
        `请根据以下上下文继续写作，保持风格一致：

${context.content.slice(-500)}`,
        { maxTokens: 1000, temperature: 0.7 }
      );
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('AI continue error:', error);
        this.clearGhost();
        const msg = String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        toast.error(`AI 续写失败：${msg}`);
      }
    } finally {
      this.state.isGenerating = false;
      this.state.pendingRequest = null;
    }
  }

  /**
   * 取消当前请求
   */
  cancel() {
    this.state.pendingRequest?.abort();
    this.clearGhost();
    this.state.isGenerating = false;
  }

  /**
   * 获取当前状态
   */
  getState() {
    // 建议可能已被编辑器清除（用户继续输入），以编辑器为准
    if (!this.editor.hasGhost())
      this.state.suggestion = null;
    return this.state;
  }
}

// 全局实例
let globalInlineAI: CursorInlineAI | null = null;

export function initInlineAI(editor: MarkdownEditor) {
  globalInlineAI = new CursorInlineAI(editor);
  return globalInlineAI;
}

export function getInlineAI() {
  return globalInlineAI;
}
