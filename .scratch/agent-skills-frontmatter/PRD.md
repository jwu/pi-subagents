---
Status: ready-for-agent
---

# Agent Skills Frontmatter

## Problem Statement

当用户希望通过子代理（Sub-agent）执行特定领域任务时（如用 TDD 循环开发、用 caveman 风格沟通），需要一种方式让子代理在启动时就知道有哪些 skills 可用，并按需加载对应的指导内容。目前子代理启动时传了 `--no-skills`，没有任何 skill 发现机制，代理（Agent）的 frontmatter 也没有声明 skills 的字段。

## Solution

在 Agent 的 frontmatter 中新增 `skills` 字段，值为逗号分隔的 skill 名称列表。子代理启动时，解析这些 skill 名称对应的 SKILL.md 文件，以 pi 原生的 `<available_skills>` XML 格式注入到 system prompt 中。子代理在 prompt 中看到 skill 列表（name + description + location），按需用 `read` 工具加载 skill 文件内容。

## User Stories

1. As an Agent 定义者，我想要在 Agent 的 frontmatter 中声明 `skills: tdd, caveman`，使该 Agent 的子代理能按需加载指定的 skills。
2. As a 子代理，我想要在 system prompt 中看到可用的 skills 列表及其描述和文件路径，以便根据任务需要主动加载 skill 内容。
3. As a 子代理，当 Agent 未声明 skills 时，我的 system prompt 不应包含 `<available_skills>` 块，保持当前行为不变。
4. As a 开发者，当 Agent 声明了不存在的 skill 名称时，我希望看到 warning 日志但子代理仍能正常启动。
5. As a 开发者，我希望 skills 按优先级从多处加载（项目级 > Packages > Settings > 全局级），同名 skill 取最高优先级。
6. As a 开发者，我希望 skills 的加载机制有独立的单元测试，验证优先级覆盖和缺失处理。

## Implementation Decisions

### Skills 字段解析

在 agent frontmatter 解析中新增 `skills` 字段，仅支持 `skills` 字段名（不兼容 `skill`）。用逗号分隔拆分为 `string[]`，与现有 `allowedAgents` 和 `tools` 的解析模式一致。

### Skills 解析与优先级

Skills 按以下优先级从文件系统加载，同名取最高优先级：

1. Project scope：`.pi/skills/`、`.agents/skills/`（cwd 及祖先目录，向上到 git repo root）
2. Packages：skills/ 目录或 package.json 中 pi.skills 字段（先 project packages，后 user packages）
3. Settings：settings.json 里的 skills 数组（先 .pi/settings.json，后 ~/.pi/agent/settings.json）
4. Global scope：`~/.pi/agent/skills/`、`~/.agents/skills/`

### Skills 注入格式

使用 pi 原生 `formatSkillsForPrompt` 的 XML 格式将 skill 列表注入 system prompt：

```xml
<available_skills>
  <skill>
    <name>caveman</name>
    <description>Ultra-compressed communication mode...</description>
    <location>/path/to/.agents/skills/caveman/SKILL.md</location>
  </skill>
</available_skills>
```

附带引导文字告诉模型"用 read 工具加载 skill 文件"。

### 注入时机

在 `runSubagent` 中，写入 `system-prompt.md` 文件之前：解析 skills → 格式化为 `<available_skills>` → 拼接到 `agent.prompt` 尾部 → 写入文件。子代理保留 `--no-skills` 标志。

### 模块划分

1. **`AgentConfig` 接口**：新增 `skills?: string[]` 字段
2. **agent-loader**：frontmatter 解析新增 `skills` 字段，用 `splitCsv` 拆分
3. **skill 解析模块**（新增 deep module）：`resolveSkills(skillNames, cwd)` → `{ resolved, missing }`，按优先级搜索 SKILL.md
4. **subagent-executor**：`runSubagent` 中调用 skill 解析模块，将结果注入 system prompt

### 缺失 Skills 处理

当 skill 名称在文件系统中找不到时，输出 warning 日志（console.warn），其余 skills 正常注入，子代理继续启动。

## Testing Decisions

### 测试原则

只测试外部行为，不测试实现细节。验证输入-输出契约。

### 需要测试的模块

1. **agent-loader**：验证 `skills: a, b, c` frontmatter 被正确解析为 `["a", "b", "c"]`
2. **skill 解析模块**：独立测试 `resolveSkills` 的优先级覆盖和缺失处理
3. **subagent-executor**：验证 system prompt 文件包含 `<available_skills>` 块（name、description、location 均正确）；验证无 skills 声明的 Agent 不产生该块

### 参考先例

- `tests/agent-loader.test.ts` 的 frontmatter 解析测试模式
- `tests/subagent-executor.test.ts` 的命令行参数验证模式

## Out of Scope

- 不在 prompt 中全文注入 skill 内容（只注入 name + description + location 列表）
- 不修改 `--no-skills` 行为
- 不兼容 `skill` 单数 frontmatter 字段名
- 不实现 skill 内容热更新（始终从文件系统读取最新内容）
- 不限制跨代理共享 skills（skills 无白名单机制，与 `allowedAgents` 独立）

## Further Notes

- 现有 `.agents/skills/` 目录下的 skills（caveman、diagnose、tdd 等）将直接可用
- 参考仓库 `nicobailon/pi-subagents` 的实现作为设计参考，但最终方案与 pi 原生 `formatSkillsForPrompt` 格式保持一致
