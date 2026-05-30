Status: ready-for-agent

# 折叠态/展开态工具调用数量策略

## Parent

.scratch/subagent-tool-result-rendering/PRD.md

## What to build

实现并验证子代理工具调用列表的折叠/展开数量策略：折叠态只展示最近 20 个工具调用；展开态展示全部工具调用。当折叠态隐藏了更早调用时，显示隐藏数量和 pi 当前配置的工具展开快捷键提示。

状态行继续保留现有 `tools` 文案，不改成 `tool calls`。

## Acceptance criteria

- [ ] 折叠态最多显示最近 20 个工具调用。
- [ ] 展开态显示全部工具调用。
- [ ] 折叠态隐藏更早调用时显示 `earlier tool calls` 文案。
- [ ] 展开提示通过 pi keybinding hint 生成，而不是硬编码具体快捷键。
- [ ] 状态行继续使用现有 `tools` 文案。
- [ ] 有测试覆盖折叠态、展开态、隐藏数量和展开提示。
- [ ] 类型检查通过。

## Blocked by

None - can start immediately
