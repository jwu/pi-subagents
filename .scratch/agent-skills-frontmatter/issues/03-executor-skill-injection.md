---
Status: ready-for-agent
---

# subagent-executor 集成 skill 注入到 system prompt

## Parent

[PRD: Agent Skills Frontmatter](../PRD.md)

## What to build

在 `runSubagent` 中，写入 `system-prompt.md` 文件之前：

1. 从 `agent.skills` 获取 skill 名称列表
2. 调用 skill 解析模块的 `resolveSkills`
3. missing skills 输出 `console.warn` 日志
4. 用 pi 原生 `formatSkillsForPrompt` 的 XML 格式将 resolved skills 格式化为 `<available_skills>` 块
5. 拼接到 `options.agent.prompt` 尾部
6. 写入 `system-prompt.md` 文件传给子进程

### `<available_skills>` 格式

```xml
<available_skills>
  <skill>
    <name>caveman</name>
    <description>Ultra-compressed communication mode...</description>
    <location>/path/to/.agents/skills/caveman/SKILL.md</location>
  </skill>
</available_skills>
```

附带引导文字告诉模型"用 read 工具加载 skill 文件，路径相对于 skill 目录解析"。

### 边界情况

- Agent 未声明 `skills`（`undefined` 或空数组）：不注入任何内容，system prompt 保持原样
- 所有 skills 都 missing：注入空 `<available_skills>` 块？不——不注入任何内容，保持原样
- 子代理 `--no-skills` 保持不变

## Acceptance criteria

- [ ] Agent 声明 `skills: caveman` 时，system prompt 文件包含 `<available_skills>` 块
- [ ] `<available_skills>` 块包含正确的 name、description、location
- [ ] Agent 未声明 skills 时，system prompt 不包含 `<available_skills>` 块
- [ ] 部分 skills missing 时，missing 的 skill 不出现在列表中，输出 console.warn
- [ ] 所有 skills missing 时，不注入 `<available_skills>` 块
- [ ] 子进程命令行仍包含 `--no-skills`
- [ ] 测试验证 system prompt 文件内容

## Blocked by

- 01-agent-config-skills-field
- 02-skill-resolver-module
