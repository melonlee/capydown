/**
 * 从模型回复里尽量稳妥地取出 JSON：
 * 去掉 ```json 代码围栏和前后的解释文字，容忍行尾多余的逗号。
 * 实在解析不了就抛错，由调用方决定重试或报错。
 */
export function parseJsonLoose(raw: string): unknown {
  if (typeof raw !== 'string')
    throw new TypeError('模型没有返回文本')
  let text = raw.trim().replace(/^\uFEFF/, '')

  // 1. 代码围栏：取第一个 ``` 块的内容
  const fence = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/)
  if (fence)
    text = fence[1].trim()

  // 2. 直接解析
  const direct = tryParse(text)
  if (direct.ok)
    return direct.value

  // 3. 截取第一个 { 或 [ 到与之匹配的结尾
  const sliced = sliceBalanced(text)
  if (sliced) {
    const r = tryParse(sliced)
    if (r.ok)
      return r.value
    // 4. 去掉行尾多余逗号再试
    const repaired = tryParse(sliced.replace(/,\s*([}\]])/g, '$1'))
    if (repaired.ok)
      return repaired.value
  }
  throw new Error(`无法解析模型返回的 JSON：${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`)
}

function tryParse(s: string): { ok: true, value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) }
  }
  catch {
    return { ok: false }
  }
}

/** 找到第一个 { / [，按括号配对（跳过字符串里的括号）截出完整的 JSON 片段 */
function sliceBalanced(text: string): string | null {
  const start = text.search(/[{[]/)
  if (start < 0)
    return null
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped)
        escaped = false
      else if (c === '\\')
        escaped = true
      else if (c === '"')
        inString = false
      continue
    }
    if (c === '"')
      inString = true
    else if (c === '{' || c === '[')
      stack.push(c === '{' ? '}' : ']')
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c)
        return null
      if (stack.length === 0)
        return text.slice(start, i + 1)
    }
  }
  return null
}
