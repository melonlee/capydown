# 技术文章怎么写，才有人看完

技术文章最常见的问题，不是写得不对，而是**读者不知道为什么要读下去**。

![键盘上的双手](https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&q=80)

## 先给结论，再给过程

开头三行就告诉读者：这篇文章解决什么问题、读完能得到什么。

> 如果只能留下一句话，你希望读者记住哪一句？

## 代码要短、要能跑

示例代码控制在 20 行以内，删掉与主题无关的部分：

```typescript
// 防抖：连续触发时，只在停下来 delay 毫秒后执行一次
export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
```

```python
# 统计一篇 Markdown 的中文字数
import re

def count_chinese(text: str) -> int:
    return len(re.findall(r"[一-鿿]", text))
```

## 用表格讲清取舍

| 方案 | 优点 | 缺点 | 适合 |
| --- | --- | --- | --- |
| 防抖 | 只执行最后一次 | 有延迟 | 搜索框、自动保存 |
| 节流 | 稳定的执行频率 | 会丢中间状态 | 滚动、拖拽 |

## 结尾给出延伸阅读

列出两三个可靠的参考链接，比堆砌十个更有用。
