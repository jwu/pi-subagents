---
Status: ready-for-agent
---

## Problem Statement

当 pi-subagents 扩展加载后，LLM 通过 `subagent` 工具委派任务给子代理。但 LLM 在对话开始时并不知道有哪些子代理可用——它只能在**调用失败后**（传入不存在的代理名称时）从错误消息中获知可用列表。这导致 LLM 无法在第一次调用时就选择正确的代理，浪费 token 和用户时间。

## Solution

subagent 工具注册时通过 `promptGuidelines` 字段告知 LLM 当前可用的子代理。pi 会自动将此信息放入 system prompt 的 `Guidelines:` 部分，无需额外解析或事件处理。列表与 `subagent` 工具实际可调用的代理保持一致（受 `PI_SUBAGENT_ALLOWED` 和 `maxDepth` 约束）。

## User Stories

1. 作为一个使用 pi-subagents 的用户，我希望 LLM 在对话开始时就被告知有哪些子代理可用，这样 LLM 可以直接委派任务给正确的代理，而不是先猜错再纠正。
2. 作为一个定义了多个项目代理的用户，我希望 system prompt 中只列出当前上下文下实际可调用的代理，这样 LLM 不会尝试调用被限制的代理。
3. 作为一个在递归子代理链中的用户，当达到 maxDepth 上限时，subagent 工具不会被注册，因此 Guidelines 中也不会有相关条目。
4. 作为一个使用 `PI_SUBAGENT_ALLOWED` 限制代理范围的用户，我希望 system prompt 中列出的代理与工具允许的代理完全一致。
5. 作为一个没有定义任何代理的用户，我不希望 Guidelines 中出现多余的空信息。

## Implementation Decisions

### 共享模块提取

将 `isPastMaxDepth`、`allowedAgentNames`、`parseEnvNumber` 从 `subagent-tool.ts` 提取到新的共享模块 `env-utils.ts` 中。

### promptGuidelines 注入

在 `registerSubagentTool` 中，子代理列表经过 `PI_SUBAGENT_ALLOWED` 过滤和字母排序后，通过 `pi.registerTool` 的 `promptGuidelines` 字段传入。pi 自动将其放入 system prompt 的 `Guidelines:` 部分。

### 注入格式

单行 guideline：`Available subagents: agent-one, agent-two`

渲染效果：
```
Guidelines:
- Be concise in your responses
- Show file paths clearly when working with files
- Available subagents: scout, reviewer
```

### 代理名称排序

按字母升序排列，保证每次会话中的顺序一致。

### 无新术语

此行为增强不引入新的领域概念，不需要更新 CONTEXT.md 的术语表。

## Testing Decisions

### 测试原则

只测试外部可观察行为，不测试实现细节。测试风格与现有测试文件一致：使用 `bun:test`，直接测试导出的公共函数。

### 测试范围

1. **共享模块测试**（`tests/env-utils.test.ts`）：验证 `isPastMaxDepth`、`allowedAgentNames`、`parseEnvNumber` 各场景
2. **promptGuidelines 测试**（`tests/subagent-tool.test.ts`）：
   - 有可用代理时，`promptGuidelines` 包含正确的格式化列表
   - 无可用代理（空列表）时，`promptGuidelines` 为 `undefined`
   - `PI_SUBAGENT_ALLOWED` 过滤后只列出允许的代理
   - 过滤后无代理时，`promptGuidelines` 为 `undefined`

### 先例

参考 `tests/subagent-tool.test.ts` 中已有的 `PI_SUBAGENT_ALLOWED` 过滤测试和 `isPastMaxDepth` 测试。

## Out of Scope

- 在 system prompt 中列出代理的**描述**或**工具列表**——仅名称
- 多行 Markdown 列表格式——单行 guideline 格式足够清晰
- 可配置性开关——始终开启
- `before_agent_start` 事件方案——`promptGuidelines` 使用 pi 原生 API 更简洁
- CONTEXT.md 术语表更新——无新概念
- ADR——此决策易于逆转、不意外、无重大权衡

## Further Notes

通过 `promptGuidelines` 注入而非 `before_agent_start` 事件，利用 pi 的 Guideline 机制自动集成到 system prompt 的固定位置（Guidelines 部分），无需解析 system prompt 字符串。这是 pi 的原生扩展机制，也是注入此类工具级提示的标准做法。
