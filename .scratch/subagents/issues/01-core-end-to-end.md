Status: ready-for-agent

## 父工单

[PRD：pi 编码代理的子代理扩展](../PRD.md)

## 要构建什么

实现子代理扩展的核心端到端流程。用户在主代理中调用 `subagent({ agent: "...", task: "..." })` 后，一个隔离子 pi 进程被启动，执行任务，并返回结果。

具体包括：

1. **代理定义解析**：扫描 `~/.pi/agent/agents/` 和 `.pi/agents/` 目录，解析 `.md` 文件中的 YAML frontmatter + Markdown 正文。处理字段默认值（`thinking` 默认 `off`，`systemPrompt` 默认 `replace`，`maxDepth` 默认 `10`）。项目本地优先于全局，同目录先加载的优先。跳过格式错误的文件并记录警告。

2. **子代理执行引擎**：根据 `AgentConfig` + 任务构建 pi 命令行（`--mode json -p --no-skills --no-prompt-templates --no-context-files`），通过 `node` + pi 包入口脚本启动子进程，解析 JSONL 流事件，实时计算进度/用量/耗时，返回 `AgentResult`。大任务（>8000 字符）写入临时文件。系统提示词写入临时文件通过 `--system-prompt` 传入。临时目录完成后清理。pi 入口点通过查找 `@earendil-works/pi-coding-agent` 包根目录解析。

3. **子代理工具注册**：注册 `subagent` 工具到 pi ExtensionAPI，JSON schema 为 `{ agent: string, task: string, cwd?: string }`。`execute` 调用执行引擎，处理后通过 `onUpdate` 传递进度。工具白名单通过 `--tools` 参数传递，扩展正常自动发现。

4. **扩展入口**：`extensions/index.ts` 组装上述模块。扩展启动时加载代理定义，注册 `subagent` 工具。

前端工具调用的参数 schema：

```typescript
// subagent 工具参数
{
  agent: string;   // 代理名称
  task: string;    // 任务描述
  cwd?: string;    // 可选，工作目录
}
```

## 验收条件

- [ ] 在 `~/.pi/agent/agents/` 下创建含正确 frontmatter 的 `.md` 代理文件后，扩展能发现并加载该代理
- [ ] 主代理调用 `subagent({ agent: "scout", task: "列出 src/ 下的文件" })` 后，子 pi 进程被启动并返回结果
- [ ] 子代理不继承主代理的对话上下文（所有上下文来自 task）
- [ ] 子代理只能使用 frontmatter `tools` 字段中列出的工具（严格白名单）
- [ ] `systemPrompt: replace` 时子代理的系统提示词完全替换为代理的 Markdown 正文
- [ ] `systemPrompt: append` 时子代理的系统提示词追加到默认提示词之后
- [ ] 大任务（>8000 字符）写入临时文件并正确引用
- [ ] 子代理完成后临时目录被清理
- [ ] 子代理会话保存在 `~/.pi/agent/sessions/{project}/subagents/` 下
- [ ] 格式错误的代理定义文件被跳过并记录警告，不阻止扩展启动

## 覆盖的用户故事

- #1：通过 Markdown 文件定义自定义代理
- #2：调用 `subagent` 委派任务
- #3：严格白名单的工具集
- #4：上下文隔离
- #5：并行派发（pi 自动支持多次工具调用并行执行）
- #9：子代理会话持久化
- #10：全局和项目目录发现代理
- #11：项目本地优先于全局
- #12：systemPrompt replace/append
- #13：工具自动发现
- #15：格式错误的代理文件被跳过

## 阻塞

无 — 可立即开始
