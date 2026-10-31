/**
 * 微信公众号：把编辑器渲染出的 HTML 整理成可直接粘贴到公众号后台的内容。
 *
 * 纯函数，无 Electron 依赖，便于单元测试。
 * 渲染（Markdown → 带主题样式的 HTML、样式内联）发生在渲染进程；这里只做
 * 最后一道清理和检查，然后由主进程写入剪贴板。
 */

export const WECHAT_COPIED_MESSAGE = '已复制，请到公众号后台粘贴'

export interface PreparedWeChatContent {
  /** 清理后的 HTML（写入剪贴板 text/html） */
  html: string
  /** 纯文本版本（写入剪贴板 text/plain，作为兜底） */
  text: string
  /** 公众号无法抓取的图片地址（本地路径、相对路径、data URI 等） */
  unreachableImages: string[]
  /** 给用户看的提醒 */
  warnings: string[]
}

// 公众号编辑器会丢弃或拒绝这些元素；脚本类元素更不应该进入剪贴板
const DROPPED_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select']

function stripDroppedElements(html: string): string {
  let out = html
  for (const tag of DROPPED_ELEMENTS) {
    // 成对标签（含内容）
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
    // 自闭合 / 未闭合的单标签
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  return out
}

function stripEventHandlers(html: string): string {
  // onclick="..." / onload='...' / onerror=foo
  return html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function stripJavascriptUrls(html: string): string {
  return html.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}

/** 找出公众号无法从网络抓取的图片 */
export function findUnreachableImages(html: string): string[] {
  const result: string[] = []
  const re = /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const src = (m[2] ?? m[3] ?? '').trim()
    if (!/^https?:\/\//i.test(src)) {
      result.push(src)
    }
  }
  return result
}

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&amp;': '&',
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|section|div|tr|figure)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|lt|gt|quot|#39|amp);/g, e => ENTITY_MAP[e] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 清理渲染后的 HTML，并检查公众号粘贴时会出问题的地方。
 * @throws 当 HTML 为空时
 */
export function prepareWeChatContent(renderedHtml: string): PreparedWeChatContent {
  if (typeof renderedHtml !== 'string' || renderedHtml.trim().length === 0) {
    throw new Error('没有可复制的内容：请先在编辑器中打开一篇文章')
  }

  const html = stripJavascriptUrls(stripEventHandlers(stripDroppedElements(renderedHtml))).trim()
  const unreachableImages = findUnreachableImages(html)
  const warnings: string[] = []
  if (unreachableImages.length > 0) {
    warnings.push(
      `有 ${unreachableImages.length} 张图片是本地或非网络地址，公众号无法自动转存，请先用「上传图片」传到图床再复制`,
    )
  }

  return {
    html,
    text: htmlToPlainText(html),
    unreachableImages,
    warnings,
  }
}
