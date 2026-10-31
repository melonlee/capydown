/**
 * 发布适配器
 *
 * 目前真正可用的只有两种方式：
 *  - 微信公众号：把渲染好的 HTML 写入剪贴板，由用户到公众号后台粘贴（不会自动发文）
 *  - Markdown 文件：带 Front Matter 导出到本地，方便发到博客 / 静态站点
 *
 * 知乎、掘金、语雀、飞书、Notion 等平台尚未实现，只作为「暂不支持」列出，
 * 调用 publish 会如实返回失败。
 */

import * as fs from 'fs/promises'
import { prepareWeChatContent, WECHAT_COPIED_MESSAGE } from './wechat'

/** 发布方式 */
export type PublishMode = 'clipboard' | 'file' | 'unsupported'

export interface PublishMetadata {
  title: string
  author?: string
  tags?: string[]
  category?: string
  summary?: string
  coverImage?: string
  date?: string
}

/** 每次发布时由调用方提供的上下文 */
export interface PublishContext {
  /** 渲染进程生成的公众号 HTML（样式已内联） */
  html?: string
  /** 导出文件的目标路径 */
  filePath?: string
}

export interface PublishResult {
  success: boolean
  platform: string
  mode: PublishMode
  /** 给用户看的结果说明 */
  message?: string
  /** 导出文件时的文件路径 */
  filePath?: string
  warnings?: string[]
  error?: string
}

export interface PlatformInfo {
  name: string
  displayName: string
  mode: PublishMode
  supported: boolean
  description: string
}

export interface PublishAdapter {
  name: string
  displayName: string
  mode: PublishMode
  description: string
  publish: (markdown: string, metadata: PublishMetadata, ctx: PublishContext) => Promise<PublishResult>
}

export type ClipboardWriter = (data: { html: string, text: string }) => void

// ---------------------------------------------------------------------------
// 微信公众号：复制到剪贴板
// ---------------------------------------------------------------------------
export class WeChatAdapter implements PublishAdapter {
  name = 'wechat'
  displayName = '微信公众号'
  mode: PublishMode = 'clipboard'
  description = '复制排版好的内容，到公众号后台粘贴'

  constructor(private writeClipboard: ClipboardWriter) {}

  async publish(_markdown: string, _metadata: PublishMetadata, ctx: PublishContext): Promise<PublishResult> {
    try {
      const prepared = prepareWeChatContent(ctx.html ?? '')
      this.writeClipboard({ html: prepared.html, text: prepared.text })
      return {
        success: true,
        platform: this.name,
        mode: this.mode,
        message: WECHAT_COPIED_MESSAGE,
        warnings: prepared.warnings,
      }
    }
    catch (error) {
      return {
        success: false,
        platform: this.name,
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown 文件导出（带 Front Matter）
// ---------------------------------------------------------------------------
export function generateFrontMatter(metadata: PublishMetadata): string {
  // JSON 字符串同时是合法的 YAML 双引号字符串，能正确转义引号和换行
  const q = (v: string) => JSON.stringify(v)
  const parts: string[] = ['---']
  parts.push(`title: ${q(metadata.title ?? '')}`)
  if (metadata.author)
    parts.push(`author: ${q(metadata.author)}`)
  if (metadata.date)
    parts.push(`date: ${q(metadata.date)}`)
  if (metadata.summary)
    parts.push(`description: ${q(metadata.summary)}`)
  if (metadata.tags?.length)
    parts.push(`tags: [${metadata.tags.map(q).join(', ')}]`)
  if (metadata.category)
    parts.push(`category: ${q(metadata.category)}`)
  if (metadata.coverImage)
    parts.push(`cover: ${q(metadata.coverImage)}`)
  parts.push('---')
  return parts.join('\n')
}

/** 去掉原文已有的 Front Matter，避免导出后出现两段 */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

export class MarkdownFileAdapter implements PublishAdapter {
  name = 'markdown'
  displayName = 'Markdown 文件'
  mode: PublishMode = 'file'
  description = '导出带 Front Matter 的 .md，适合 Hexo / Hugo / VitePress 等博客'

  async publish(markdown: string, metadata: PublishMetadata, ctx: PublishContext): Promise<PublishResult> {
    if (!ctx.filePath) {
      return { success: false, platform: this.name, mode: this.mode, error: '没有选择保存位置' }
    }
    try {
      const body = stripFrontMatter(markdown).replace(/^\s+/, '')
      await fs.writeFile(ctx.filePath, `${generateFrontMatter(metadata)}\n\n${body}`, 'utf-8')
      return {
        success: true,
        platform: this.name,
        mode: this.mode,
        filePath: ctx.filePath,
        message: `已导出到 ${ctx.filePath}`,
      }
    }
    catch (error) {
      return {
        success: false,
        platform: this.name,
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 尚未实现的平台
// ---------------------------------------------------------------------------
export class UnsupportedAdapter implements PublishAdapter {
  mode: PublishMode = 'unsupported'
  description = '暂不支持'

  constructor(public name: string, public displayName: string) {}

  async publish(): Promise<PublishResult> {
    return {
      success: false,
      platform: this.name,
      mode: this.mode,
      error: `暂不支持发布到${this.displayName}`,
    }
  }
}

// ---------------------------------------------------------------------------
// 管理器
// ---------------------------------------------------------------------------
export class PublishManager {
  private adapters = new Map<string, PublishAdapter>()

  constructor(writeClipboard: ClipboardWriter) {
    this.register(new WeChatAdapter(writeClipboard))
    this.register(new MarkdownFileAdapter())
    this.register(new UnsupportedAdapter('zhihu', '知乎'))
    this.register(new UnsupportedAdapter('juejin', '掘金'))
    this.register(new UnsupportedAdapter('yuque', '语雀'))
    this.register(new UnsupportedAdapter('feishu', '飞书文档'))
    this.register(new UnsupportedAdapter('notion', 'Notion'))
  }

  register(adapter: PublishAdapter) {
    this.adapters.set(adapter.name, adapter)
  }

  getAdapter(name: string): PublishAdapter | undefined {
    return this.adapters.get(name)
  }

  getPlatforms(): PlatformInfo[] {
    return Array.from(this.adapters.values()).map(a => ({
      name: a.name,
      displayName: a.displayName,
      mode: a.mode,
      supported: a.mode !== 'unsupported',
      description: a.description,
    }))
  }

  async publish(platform: string, markdown: string, metadata: PublishMetadata, ctx: PublishContext = {}): Promise<PublishResult> {
    const adapter = this.getAdapter(platform)
    if (!adapter) {
      return { success: false, platform, mode: 'unsupported', error: `未知平台：${platform}` }
    }
    return adapter.publish(markdown, metadata, ctx)
  }
}
