Status: ready-for-agent

# 宽度感知的单行工具调用渲染

## Parent

.scratch/subagent-tool-result-rendering/PRD.md

## What to build

新增一个宽度感知的渲染能力，用于子代理结果中的工具调用行和隐藏提示行。工具调用行应保持单个视觉行；当终端宽度不足时，以 `...` 截断，而不是被普通文本组件自动换行。

该能力应尽量封装成小型渲染组件或等价深模块，只负责单行截断和渲染，不改变子代理执行器语义，也不影响普通输出摘要和展开态 Markdown 输出。

## Acceptance criteria

- [ ] 工具调用行在窄宽度下保持单行。
- [ ] 超宽工具调用行以 `...` 截断。
- [ ] 隐藏提示行在窄宽度下也保持单行并安全截断。
- [ ] 子代理输出摘要不被误改成强制单行截断。
- [ ] 新渲染能力有聚焦测试，能在指定宽度下断言截断结果。
- [ ] 折叠/展开切换后渲染仍正确。
- [ ] 类型检查通过。

## Blocked by

- .scratch/subagent-tool-result-rendering/issues/01-tool-call-title-replication.md
- .scratch/subagent-tool-result-rendering/issues/02-collapsed-expanded-tool-counts.md
