# 折叠态输出摘要截断规则修改

Status: ready-for-agent

## 问题

当前 `summaryText()` 函数对子代理输出做了预处理：`stripCodeBlocks`（去除代码块）+ 过滤空行 + 每行 trim。与 pi builtin 工具（read、bash 等）的纯文本截断风格不一致。

## 期望行为

折叠态输出摘要应与 pi builtin 工具风格一致：原始 Markdown 文本直接按 `\n` 拆分，取前 20 行（含空行、含代码块），不做任何预处理。超过 20 行时末尾追加截断提示。

## 实现要点

1. **重写 `summaryText()`** — 移除 `stripCodeBlocks`、trim、空行过滤逻辑。改为：`split('\n').slice(0, 20)`，不做任何预处理。

2. **添加截断提示** — 当输出超过 20 行时，在 `formatSubagentResultLines` 的输出 lines 中追加一条 `kind: 'hint'` 行：
   - 文案：`... (N more lines, <keybinding> to expand)`
   - N = 原始 `\n` 行总数 - 20
   - `<keybinding>` 通过 `keyHint('app.tools.expand', 'to expand')` 动态获取
   - 样式：dim
   - 不计入 20 行

3. **移除旧的段落限制逻辑** — 删除 `stripCodeBlocks` 和 3 段落限制相关代码。

## 测试要点

- 折叠态输出摘要显示原始 Markdown 文本的前 20 个 `\n` 行（含空行、含代码块）
- 超过 20 行时追加 dim 截断提示，提示行不计入 20 行
- 不会去除代码块
- 空行保留且计入 20 行
- 截断提示中的展开快捷键通过 keyHint 动态生成

## 评论
