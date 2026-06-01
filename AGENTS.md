# AGENTS.md

pi-subagents — pi 的子代理扩展。向隔离的 pi 子进程委派任务，子进程不继承对话上下文。

## 项目

- **类型**：pi 扩展（npm 包），TypeScript + Bun
- **运行环境**：Node ≥20，Bun 作为运行器、测试器、类型检查器
- **发布**：semantic-release + conventional commits；`bun run release`
- **语言**：项目文档与注释以中文为主

## 关键结构

| 入口 | 职责 |
|------|------|
| `extensions/index.ts` | 扩展入口，注册 subagent 工具 |
| `extensions/subagent-tool.ts` | subagent 工具实现 |
| `extensions/subagent-executor.ts` | 子进程启动与管理 |
| `extensions/agent-loader.ts` | 代理 .md 文件解析 |
| `tests/` | 单元测试，与被测文件一一对应 |

领域概念（代理、任务、allowedAgents 等）定义在 `CONTEXT.md`。

Agent skills 存放在 `.agents/skills/`，需时按名称加载。

## 工作规则

- 默认小步修改、小 diff
- 优先复用项目中已有的模式
- 非必要不引入新依赖

## 命令

```bash
bun test                     # 全量单测（提交前）
bun test -- --preload .pi/hooks/setup.ts tests/subagent-tool.test.ts  # 单文件测试
bun run typecheck            # 全量类型检查
bun run format               # 全量格式化
bun run lint                 # format:check + typecheck
```

全量 build / test 只在以下情况执行：用户明确要求，或修改涉及共享模块时。

## 安全

可直接执行：读文件、搜索、格式化、typecheck、单测

必须先确认：安装依赖、删除文件、git push、修改 CI、发布 release

## 参考与反参考

- **推荐参考**：`extensions/subagent-executor.ts`（核心模式）、`tests/subagent-executor.test.ts`（测试模式）
- **避免照抄**：无

## 更多文档

| 文档 | 何时阅读 |
|------|----------|
| `CONTEXT.md` | 需要理解领域术语时 |
| `docs/agents/issue-tracker.md` | 创建或查找 Issue 时 |
| `docs/agents/triage-labels.md` | 需要 triage 标签时 |
| `docs/agents/domain.md` | 消费项目领域文档时 |
| `README.md` | 需要了解用户面向的功能、配置字段时 |

## 卡住时

- 先提问，不猜测
- 大规模修改前先提计划
- 上下文不足时主动查阅 `CONTEXT.md` 或 `docs/` 目录
