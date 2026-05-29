# PRD：pi 编码代理的子代理扩展

状态：ready-for-agent

## 问题陈述

pi 编码代理的用户希望将聚焦、隔离的工作委派给子代理（sub-agent）——用于代码库探索、网络调研、代码修改或多代理协作。主代理需要将任务分派给独立作用域的子 pi 进程并接收结果，无需手动设置 tmux 或污染上下文。目前，本项目中尚未实现此类委派机制。

## 解决方案

一个 pi 扩展，用于注册 `subagent` 工具。主代理通过指定代理名称和任务描述来调用该工具。扩展将启动一个隔离的子 pi 进程（`pi --mode json -p`），应用指定的代理配置（工具、模型、系统提示词），将进度流式传回父代理，并返回结果。用户在 `~/.pi/agent/agents/` 或 `.pi/agents/` 中以含 YAML frontmatter 的 `.md` 文件定义代理。

## 用户故事

1. 作为 pi 用户，我希望通过含 YAML frontmatter 的 Markdown 文件来定义自定义代理，这样我无需编写代码就能创建特定领域的专家代理（代码探索者、研究员、代码编辑器）。

2. 作为 pi 用户，我希望主代理能调用 `subagent({ agent: "scout", task: "..." })`，这样它可以将代码库探索委派给轻量模型，同时保留自身的上下文窗口。

3. 作为 pi 用户，我希望子代理以严格白名单的工具集运行（在 frontmatter 中指定），这样调研代理不会意外修改文件，且代码编辑代理只拥有其所需的工具。

4. 作为 pi 用户，我希望子代理无法访问主对话上下文，这样敏感信息不会泄露，且子代理仅基于明确限定的指令执行。

5. 作为 pi 用户，我希望主代理能在一次工具调用轮次中同时发起多个子代理调用，这样互不依赖的任务可以并行执行以提升效率。

6. 作为 pi 用户，我希望看到运行中子代理的实时进度（工具调用、token 消耗、状态），这样我可以监控长时间的委派任务。

7. 作为 pi 用户，我希望通过 frontmatter 中的 `allowedAgents` 字段来控制某个代理可以派发哪些子代理，这样可以防止无界递归（如 worker 可以派发 scout/researcher，但 scout 不能派发任何代理）。

8. 作为 pi 用户，我希望通过 frontmatter 中的 `maxDepth` 字段来控制每个代理的递归深度，这样可以限制委派工作的嵌套层数。

9. 作为 pi 用户，我希望子代理的会话持久化保存在 `~/.pi/agent/sessions/{project}/subagents/` 下，这样我可以事后调试或查看子代理的运行记录。

10. 作为 pi 用户，我希望代理定义可以从全局（`~/.pi/agent/agents/`）和项目（`.pi/agents/`）两个目录中被发现，这样我既能有跨项目共享的代理，也能有项目专属的代理。

11. 作为 pi 用户，我希望当全局和项目目录中存在同名代理时，项目本地的定义优先于全局定义，这样项目特有行为可以覆盖默认设置。

12. 作为 pi 用户，我希望通过 `systemPrompt: replace|append` 来为每个代理选择替换或追加系统提示词，这样代理既可以是完全自定义的，也可以基于 pi 的默认提示词进行增强。

13. 作为 pi 用户，我希望子代理能自动发现扩展（无需硬编码的工具到扩展的路径映射），这样新安装的扩展可以立即通过工具白名单供代理使用。

14. 作为 pi 用户，我希望子代理的输出在返回给父代理前被截断至 50KB/2000 行，这样大输出不会撑爆父代理的上下文窗口。

15. 作为 pi 用户，我希望无效或格式错误的代理定义被跳过并记录警告，而不是导致扩展崩溃，这样一个损坏的代理文件不会阻止所有子代理的运行。

## 实现决策

### 模块架构

项目拆分为五个模块：

1. **代理定义解析（深层模块）** — 扫描代理目录，解析 YAML frontmatter，处理名称冲突（项目本地优先于全局；同一目录内先加载的优先），验证字段，返回类型安全的 `AgentConfig` 对象。跳过格式错误的定义并记录警告。

2. **子代理执行引擎（深层模块）** — 根据 `AgentConfig` + 任务构建完整的 `pi` 命令行，启动子进程，解析 JSONL 流事件，计算进度/用量/耗时，返回完成的 `AgentResult`。管理用于大任务和系统提示词文件的临时目录。处理输出截断。

3. **子代理工具注册（浅层模块）** — 将 `subagent` 工具注册到 pi 的 ExtensionAPI。定义 JSON schema（`agent`、`task`、`cwd?`）。将 `execute` 连接到执行引擎，将 `renderCall`/`renderResult` 连接到 UI 模块。

4. **TUI 渲染（中等模块）** — 折叠视图：单行标题 + 代理状态 + 工具日志 + 用量行。展开视图：完整流式任务正文 + 代理输出（Markdown 格式）。嵌套子代理内联渲染在发起它们的工具调用行下方。

5. **扩展入口（浅层模块）** — `extensions/index.ts` 组装各模块：加载代理定义，注册 `subagent` 工具。

### 代理 Frontmatter 规范

```yaml
name: scout                    # 必填。代理唯一名称。
description: 快速代码库侦查     # 可选。
tools: read, grep, find, ls    # 逗号分隔的严格白名单。
model: anthropic/claude-haiku-4-5  # 可选。provider/model-id 格式。
thinking: off                  # off|low|medium|high。默认 off。
systemPrompt: replace          # replace（默认）或 append。
allowedAgents: scout, researcher  # 可选。限制可派发的子代理。
maxDepth: 1                    # 可选。从本代理起算的最大递归深度。默认 10。
---
代理系统提示词正文（Markdown）...
```

### 代理目录位置

| 范围 | 路径 |
|------|------|
| 全局 | `~/.pi/agent/agents/*.md` |
| 项目 | `.pi/agents/*.md` |

项目本地优先于全局。同一目录内先加载的优先。非 `.md` 文件将被忽略。

### 子代理进程启动方式

每个子代理通过以下方式启动：

```
node <pi-entry-point> --mode json -p --no-skills --no-prompt-templates \
  --no-context-files --model <model> --thinking <thinking> \
  --tools <tools> --system-prompt <prompt-file> \
  "Task: <task>"
```

- pi 入口点通过查找 `@earendil-works/pi-coding-agent` 包根目录及其入口脚本来解析，然后通过 `node` 执行。
- 扩展正常加载（自动发现）；`--tools` 白名单限制子代理实际可调用的工具。
- 大任务（>8000 字符）写入临时文件，通过 `@file` 语法引用。
- 每次子代理运行创建临时目录，完成后清理。

### 递归控制

- `allowedAgents` 在启动时通过 `PI_SUBAGENT_ALLOWED` 环境变量强制执行。
- `maxDepth` 通过 `PI_SUBAGENT_DEPTH`（当前深度，自动递增）和 `PI_SUBAGENT_MAX_DEPTH`（上限）强制执行。若 `depth > maxDepth`，子代理工具不可用。
- 若未指定 `allowedAgents` 但代理具有 `subagent` 工具，则所有代理均可用。
- `maxDepth` 未指定时默认值为 10。

### 工具发现策略

不维护硬编码的工具到扩展路径映射。子代理进程正常加载所有扩展。frontmatter 中的 `tools` 字段作为 `--tools` 参数，充当严格白名单。

### 子代理会话存储

会话存储在 `~/.pi/agent/sessions/{project}/subagents/` 下，使用 pi 的正常会话管理。不使用 `--no-session`。

### 输出截断

子代理最终输出在返回父代理前按 50KB / 2000 行截断头部的阈值进行截断。

### 错误处理

- 格式错误的代理 `.md` 文件被跳过并记录警告。
- 子代理进程失败时，工具结果标记为 `isError: true`。
- 未知的代理名称将抛出错误，并附带可用代理列表。

### UI 渲染

两种视图，通过 `ctrl+o` 切换：
- **折叠视图**：单行标题 + 代理状态 + 按时间顺序排列的工具日志 + 最新消息摘要行 + 用量行（token 输入/输出、缓存、费用、上下文窗口百分比）。
- **展开视图**：完整的流式任务正文 + 代理输出（Markdown 格式）+ 嵌套子代理内联渲染于发起它们的工具调用行下方。

## 测试决策

### 好测试的标准

测试验证外部行为：给定输入，模块产生正确的输出。不检查内部状态。对文件系统和进程启动使用测试替身。

### 需要测试的模块

1. **代理定义解析** — 单元测试：
   - 解析含 frontmatter 的有效 `.md` 文件
   - 缺少必填字段（name）
   - 默认值应用
   - 格式错误的文件被跳过
   - 名称冲突解决
   - 目录扫描忽略非 `.md` 文件

2. **子代理执行引擎** — 单元测试：
   - 正确构建 pi 命令行参数
   - 递归控制的环境变量设置
   - 任务长度阈值处理
   - JSONL 事件解析与进度计算
   - 输出截断
   - 临时目录生命周期
   - 错误处理

### 参考实践

沿用 `pi-filechanges` 和 `pi-webfetch` 的测试模式：bun test 运行器，`bun tsc --noEmit` 类型检查，prettier 格式化。

## 不在范围内

- 内置代理（不捆绑 scout/researcher/worker）
- 并发控制（无信号量或最大并发数限制）
- 超时机制
- 链式工作流 / 顺序代理流水线
- 异步 / 后台执行
- 工作树隔离
- 代理间通信（intercom）
- 管理操作（list/create/update/delete/status/interrupt/resume/doctor）
- 子代理中使用 skills（`--no-skills`）
- 子代理中使用 prompt templates（`--no-prompt-templates`）
- 上下文文件继承（`--no-context-files`）
- 跨扩展代理注册 API（`globalThis.__pi_subagents`）
- MCP 工具支持
- 代理 `package` 命名空间

## 补充说明

本 PRD 基于与 amosblomqvist/pi-subagents 参考实现的 grilled interview 提炼而成。主要差异：
- 不捆绑内置代理；完全基于目录发现
- 工具自动发现，无需硬编码扩展路径映射
- 正常会话管理，不使用 `--no-session`
- 采用 Nicobailon 风格的 pi 二进制解析（包入口 + node 执行）
- `maxDepth` 新增为 frontmatter 的一级字段
- `systemPrompt` 字段新增（replace/append）
- 精简范围：仅单代理调用
