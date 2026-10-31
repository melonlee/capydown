# AI：发布前校对 + 标题摘要

> 2026-11 · 分支 `polish/v0.2.0`

只保留两个真正有痛点的 AI 功能，其余（⌘K 通用面板、续写、润色 / 扩写 / 大纲 / 分析、AI 生图）全部从界面移除；源码保留，对应 IPC 只在 `experimental_features_enabled` 打开并重启后注册（`src/main/ipc-ai.ts` 的 `initLegacyWritingHandlers`）。

| 功能 | 为什么 | 入口 |
| --- | --- | --- |
| 发布前校对 | 公众号发布后正文最多只能改 20 个字，错别字发出去就改不回来 | 菜单「文件 → 发布前校对…」、命令面板、发布对话框顶部 |
| 标题 + 摘要 | 每篇都要想标题（≤ 64 字）和摘要（≤ 120 字） | 发布对话框「AI 拟标题和摘要」 |

## 代码结构

| 位置 | 内容 |
| --- | --- |
| `src/shared/ai/proofread.ts` | 切段（跳过 Front Matter / 代码块 / 公式 / HTML / 缩进代码 / 分割线 / 引用定义）、分批、提示词、JSON 解析与校验、定位、`planEdits` / `applyEdits` / `relocateIssue`、整篇编排 `proofreadText` |
| `src/shared/ai/publish-meta.ts` | 标题摘要提示词、解析、长度规则（`wechatLength` 按 Unicode 字符计） |
| `src/shared/ai/json.ts` | 宽松 JSON 解析：代码围栏、前后说明文字、行尾逗号 |
| `src/main/ai/features.ts` | 用 `AIService.generateText` 把上面两块接到真实服务商（不依赖 electron，测试和冒烟脚本直接用） |
| `src/main/ipc-ai.ts` | `ai:proofread`（进度事件 `ai:proofread-progress`，可 `ai:proofread-cancel`）、`ai:title-summary` |
| `src/renderer/src/composables/useProofread.ts` + `components/workbench/ProofreadPanel.vue` | 校对面板：定位、接受、忽略、全部接受 |
| `src/renderer/src/components/PublishDialog.vue` | 校对入口 + 标题摘要候选 |
| `src/renderer/src/components/AISettings.vue` | 服务商、Base URL、API Key、模型、测试连接 |

### 校对的约束

- **位置**：渲染进程发送 CodeMirror 的 `doc.toString()`，所有位置都是这个字符串的下标，与编辑器位置一一对应。纯函数同样适用于 CRLF 文本（`\r` 当普通字符，跨行片段写回 `\r\n`）。
- **分批**：段落 ≤ 1200 字（长段在句末切开），每批 ≤ 2400 字，最多 3 个并发；某一批失败不影响其它批，界面提示哪几行没检查成功。
- **结构化输出**：用户消息是 `{"paragraphs":[{"id":"P1","text":"…"}]}`，要求返回 `{"issues":[{"p","type","original","suggestion","reason"}]}`。OpenAI 兼容接口额外发 `response_format: json_object`，服务端不认识（HTTP 400/422 且提到 response_format/json）时自动去掉重试；JSON 解析失败的批次重试一次。
- **只做校对**：`rejectReason` 拒绝改动过大（编辑距离 > max(4, 60%)）、增删换行、改动 Markdown 标记字符的建议；`protectedRanges` 保护行内代码、链接地址、图片、HTML、URL、邮箱、行内公式、脚注、块标记、表格分隔行。
- **接受**：单条接受是一个编辑器事务（可撤销），后面的问题位置随之平移；「全部接受」是一个事务（一次 ⌘Z 全部还原）。文档在校对后被改过时，用原文片段 + 前后各 12 字上下文重新定位，找不到就标记「原文已改动」。

## 测试

```bash
pnpm test                       # 含 tests/unit/proofread.test.ts、publish-meta.test.ts、ai-features.test.ts
node scripts/dev/ai-smoke.mjs --mock   # 不需要 Key：本地模拟服务 + 真实服务商代码
node scripts/dev/mock-openai.mjs       # 只启动模拟服务（默认 http://127.0.0.1:8787/v1）
```

`ai-features.test.ts` 会在随机端口启动 `scripts/dev/mock-openai.mjs`，通过真实的 `OpenAICompatibleProvider` 跑校对和标题摘要（含 SSE 流式、JSON 模式降级、代码围栏、坏 JSON、401）。

模拟服务的特殊 Key：`bad-key` → 401；`no-json-mode` → 拒绝 `response_format`；`fenced` → 回复包在 ```json 里；`broken` → 回复不是 JSON。在应用里手动试：偏好设置 → AI → OpenAI 兼容，Base URL 填 `http://127.0.0.1:8787/v1`，Key、模型随便填。

## 用真实服务做冒烟测试

Key 只从环境变量读取，不会打印或写入文件，**不要提交到仓库**。

```bash
# OpenAI 兼容（DeepSeek / Kimi / 通义千问 / OpenAI / 自建网关）
LB_AI_BASE_URL=https://api.deepseek.com/v1 LB_AI_KEY=sk-xxx LB_AI_MODEL=deepseek-chat node scripts/dev/ai-smoke.mjs

# Claude（Base URL 可省略；走网关时设置 LB_AI_BASE_URL）
LB_AI_PROVIDER=claude LB_AI_KEY=sk-ant-xxx LB_AI_MODEL=claude-sonnet-4-6 node scripts/dev/ai-smoke.mjs
```

也可以用 `pnpm ai:smoke`（同样读取上面的环境变量）。脚本依次检查：连接、流式输出、发布前校对（代码块 / 链接 / Front Matter 不被改动、所有修改能精确应用）、标题摘要长度规则；全部通过退出码为 0。

常用网关的 Base URL：

| 服务 | Base URL | 模型示例 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

在应用里配置真实服务：偏好设置 → AI，填同样的三项，点「测试连接」。
