---
Status: ready-for-agent
---

# Skill 解析模块（新增 deep module）

## Parent

[PRD: Agent Skills Frontmatter](../PRD.md)

## What to build

新增一个独立的 skill 解析模块。输入 skill 名称列表和 cwd，按优先级从文件系统搜索对应的 SKILL.md 文件，返回解析结果。

### 优先级规则

1. Project scope：`.pi/skills/`、`.agents/skills/`（cwd 及祖先目录，向上到 git repo root）
2. Packages：skills/ 目录或 package.json 中 pi.skills 字段（先 project packages，后 user packages）
3. Settings：settings.json 里的 skills 数组（先 .pi/settings.json，后 ~/.pi/agent/settings.json）
4. Global scope：`~/.pi/agent/skills/`、`~/.agents/skills/`

同名 skill 取最高优先级。

### 接口

```ts
interface ResolvedSkill {
  name: string;
  description: string;   // 来自 SKILL.md frontmatter
  location: string;      // SKILL.md 绝对路径
}

function resolveSkills(
  skillNames: string[],
  cwd: string,
): { resolved: ResolvedSkill[]; missing: string[] }
```

### 解析方式

- 读取 SKILL.md，解析 frontmatter 中的 `name` 和 `description`
- 如果 SKILL.md 无 frontmatter 或缺少 description，视为解析失败（归入 missing）
- description 超过 1024 字符时截断（与 pi 原生规范一致）

## Acceptance criteria

- [ ] `resolveSkills(["caveman"], cwd)` 从 `.agents/skills/caveman/SKILL.md` 正确解析
- [ ] 同名 skill 在 project 和 global 都存在时，取 project 的
- [ ] 不存在的 skill 名称出现在 `missing` 数组中
- [ ] 空 skill 名称列表返回 `{ resolved: [], missing: [] }`
- [ ] SKILL.md 缺少 description 时归入 missing
- [ ] 独立单元测试覆盖以上所有场景

## Blocked by

None - can start immediately
