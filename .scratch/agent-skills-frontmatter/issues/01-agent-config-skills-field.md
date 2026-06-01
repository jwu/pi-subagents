---
Status: ready-for-agent
---

# Agent frontmatter 新增 `skills` 字段解析

## Parent

[PRD: Agent Skills Frontmatter](../PRD.md)

## What to build

在 agent 定义文件的 frontmatter 解析中新增 `skills` 字段。值格式为逗号分隔的 skill 名称列表（如 `skills: tdd, caveman`），解析为 `string[]` 存入 `AgentConfig`。

与现有 `allowedAgents`、`tools` 字段的解析模式一致——使用已有的 `splitCsv` 函数拆分，空值返回 undefined。

## Acceptance criteria

- [ ] `AgentConfig` 接口新增 `skills?: string[]` 字段
- [ ] frontmatter 中 `skills: a, b` 被正确解析为 `["a", "b"]`
- [ ] 未声明 `skills` 时 `AgentConfig.skills` 为 `undefined`
- [ ] `skills:` 后值为空时（如 `skills: `）返回 `undefined`
- [ ] 不解析 `skill`（单数）字段
- [ ] 测试覆盖：agent-loader 的测试文件中新增 frontmatter 解析测试用例

## Blocked by

None - can start immediately
