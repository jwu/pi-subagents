Status: ready-for-agent

## 父工单

[PRD：pi 编码代理的子代理扩展](../PRD.md)

## 要构建什么

为两个深层模块编写单元测试。使用 bun test 运行器，测试验证外部行为而非内部状态。对文件系统和进程启动使用测试替身。

### 代理定义解析测试

- 解析含完整 frontmatter 的有效 `.md` 文件，验证所有字段正确提取
- 缺少必填字段 `name` 的文件被跳过
- 默认值应用：`thinking` → `off`，`systemPrompt` → `replace`，`maxDepth` → `10`
- `thinking` 显式设为 `high` 时不被默认值覆盖
- 格式错误的 YAML frontmatter 被跳过并返回 warning
- 目录扫描忽略非 `.md` 文件
- 全局和项目目录中存在同名代理时，项目本地优先
- 同一目录内多个同名代理时，先加载的优先
- `tools` 字段正确分割为字符串数组
- `allowedAgents` 字段正确分割为字符串数组

### 子代理执行引擎测试

- 基本 agent 配置构建正确的 pi 命令行（验证 `--model`、`--thinking`、`--tools`、`--no-skills`、`--no-prompt-templates`、`--no-context-files`）
- `systemPrompt: replace` 时使用 `--system-prompt` 参数
- `systemPrompt: append` 时使用 `--append-system-prompt` 参数
- 递归控制：`PI_SUBAGENT_DEPTH` 和 `PI_SUBAGENT_MAX_DEPTH` 正确设置
- `allowedAgents` 非空时 `PI_SUBAGENT_ALLOWED` 正确设置
- 短任务（≤8000 字符）直接内联在命令行中
- 长任务（>8000 字符）写入临时文件并通过 `@` 语法引用
- JSONL 流事件正确解析为 `AgentProgress`
- 输出超过 50KB 时正确截断
- 子进程非零退出时返回 isError 结果

### 测试文件结构

沿用 `pi-filechanges` 和 `pi-webfetch` 的模式：

```
tests/
├── agent-parser.test.ts    # 代理定义解析测试
└── subagent-executor.test.ts  # 子代理执行引擎测试
```

## 验收条件

- [ ] `bun test` 所有测试通过
- [ ] `bun run typecheck` 无类型错误
- [ ] 测试不依赖实际的 pi 进程或真实文件系统（使用内存文件系统或 mock）
- [ ] 每个测试函数验证一个独立的行为

## 覆盖的用户故事

- 间接覆盖所有用户故事（验证核心模块正确性）

## 阻塞

- [01-核心端到端流程](01-core-end-to-end.md) — 需要被测试的模块实现就绪
