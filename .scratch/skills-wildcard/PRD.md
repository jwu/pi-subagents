# PRD: Skills Wildcard 支持

Status: ready-for-agent

## Problem Statement

Agent 配置中的 `skills` 字段目前只支持精确名称匹配——用户必须逐一列出每个 skill 的全名。当一个项目有大量 skills（或希望加载全部可用 skills）时，维护成本高且容易遗漏。

用户希望在 `skills` 字段中使用简单通配符 `*`，例如 `skills: *` 加载全部 skill，`skills: lark-*` 加载所有以 `lark-` 开头的 skills。

## Solution

在 `skill-resolver.ts` 的 `resolveSkills` 中增加通配符展开能力：当输入列表中出现包含 `*` 的条目时，先收集全部可用 skill（从 5 个来源按优先级去重），再用简单通配符匹配，最后和精确名称条目合并去重后返回。

使用方式：

```yaml
---
name: power-agent
skills: *, ask-user      # 加载全部 + 确保 ask-user 被加载
---
```

```yaml
---
name: lark-agent
skills: lark-*           # 只加载 lark- 前缀的 skills
---
```

## User Stories

1. As a developer defining an agent, I want `skills: *` to load all available skills, so that I don't need to manually list every skill name.
2. As a developer using namespaced skills (e.g. `lark-github`, `lark-jira`), I want `skills: lark-*` to load only matching skills, so that I can group related skills by naming convention.
3. As a developer, I want to mix wildcards and exact names (e.g. `skills: *, caveman`), so that I can load all skills while ensuring specific ones are included.
4. As a developer, I want duplicate skills (matched by both wildcard and exact name) to be de-duplicated automatically, so that my prompt doesn't contain redundant entries.
5. As a developer, I want a warning when a SKILL.md has no frontmatter `name`, so that I know the file is invalid and won't be loaded.
6. As a developer, I want wildcard matching to use the frontmatter `name` field (not the directory name), so that the canonical name defined in the SKILL.md is the source of truth.

## Implementation Decisions

### Wildcard 展开在 skill-resolver 层

`resolveSkills` 内部处理通配符。当输入列表包含 `*` 条目时，先收集全部 5 个 skill 来源的完整名称列表，按 frontmatter `name` 去重后缓存，再用简单通配符匹配。

`agent-loader.ts` 不需要任何改动——`skills: *` 在 CSV 解析后保留为 `["*"]` 传入即可。

### 全量收集与缓存

首次调用 `resolveSkills` 时（无论是否包含 wildcard），收集全部 5 个来源（项目 `.agents/skills/`、项目 `.pi/skills/`、全局 `~/.pi/agent/skills/`、全局 `~/.agents/skills/`、npm packages）中所有 SKILL.md 的 frontmatter，构建 `Map<name, ResolvedSkill>` 缓存。

- 去重 key = frontmatter `name`
- 无 `name` 的 SKILL.md 记录 warning 并跳过（修复现有 fallback 到目录名的 bug）
- 同一 name 的 skill 按现有优先级（project → global → packages）保留第一个
- 不考虑缓存失效（扩展生命周期内文件变更概率极低）

### 简单通配符匹配

仅支持 `*` 作为通配符，匹配任意字符序列。不支持 glob 语法（`?`、`{a,b}` 等）。

匹配示例：
- `*` → 匹配所有
- `lark-*` → 匹配 `lark-github`、`lark-jira`，不匹配 `lark` 或 `my-lark`
- `*-helper` → 匹配 `github-helper`、`jira-helper`

### 去重逻辑

输入列表中精确名称和 wildcard 展开结果合并时，按 resolved name 去重。精确名称优先于 wildcard 结果（虽然结果相同，但明确语义）。

### 修改范围

- **修改** `extensions/skill-resolver.ts`：新增全量收集函数、缓存、wildcard 匹配逻辑，修复无 name 时的 fallback bug
- **不修改** `extensions/agent-loader.ts`：`skills` 字段保持 `string[]` 类型，通配符条目作为字符串原样传递
- **小幅修改** `extensions/subagent-executor.ts`：透传并打印 skill resolver 返回的 warnings
- **新增/修改** `tests/skill-resolver.test.ts`：通配符匹配测试、优先级测试、无 name warning 测试

## Testing Decisions

遵循现有测试模式——`mockFs` 提供可控的文件系统，`packageSkillFiles` 模拟 npm package skills。

好的测试应该：
- 验证外部行为（输入 skills 列表 → 输出 resolved/missing/warnings），不测试内部缓存实现细节
- 一个 test 覆盖一个场景

需测试的场景：
1. `*` 加载全部 skill
2. `lark-*` 前缀匹配
3. 通配符无匹配时报告 missing
4. 精确名称 + wildcard 混用去重
5. 项目 skill 覆盖全局同名 skill（wildcard 场景下优先级仍保持）
6. SKILL.md 无 frontmatter `name` 时产生 warning 而非加载
7. 空 properties 的 skills（`skills:`）行为不变

## Out of Scope

- Glob 风格通配符（`?`、`{a,b}`、`**` 等）
- 缓存失效处理（文件热更新）
- 排除语法（如 `skills: *, -caveman`）
- `allowedAgents` 或 `tools` 字段的 wildcard 支持

## Further Notes

- 该功能的实现同时修复一个现存的 bug：SKILL.md 无 frontmatter `name` 时不应 fallback 到目录名，应为 warning。
- CONTEXT.md 中「技能（Skill）」术语需随实现更新，补充 wildcard 说明。
- README 中 `skills` 字段的描述需补充通配符用法说明。
