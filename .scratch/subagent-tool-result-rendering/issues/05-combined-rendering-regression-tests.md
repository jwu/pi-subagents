Status: ready-for-agent

# 组合渲染回归测试

## Parent

.scratch/subagent-tool-result-rendering/PRD.md

## What to build

补充组合场景回归测试，覆盖子代理工具结果渲染的主要交互：大量工具调用、长路径、长 grep pattern、长 bash command、嵌套 subagent、webfetch、折叠/展开切换和宽度截断。

该 slice 应验证用户最终看到的渲染行为，而不是内部 helper 的实现细节。

## Acceptance criteria

- [ ] 测试覆盖大量工具调用时折叠态只显示最近 20 个，展开态显示全部。
- [ ] 测试覆盖长路径工具调用在窄宽度下单行截断。
- [ ] 测试覆盖长 grep pattern 和长 bash command 的单行截断。
- [ ] 测试覆盖嵌套 subagent 的展示不回退成 JSON blob。
- [ ] 测试覆盖 webfetch 标题格式。
- [ ] 测试覆盖展开态 Markdown 输出不被单行截断组件影响。
- [ ] 类型检查通过。

## Blocked by

- .scratch/subagent-tool-result-rendering/issues/01-tool-call-title-replication.md
- .scratch/subagent-tool-result-rendering/issues/02-collapsed-expanded-tool-counts.md
- .scratch/subagent-tool-result-rendering/issues/03-width-aware-single-line-tool-rows.md
- .scratch/subagent-tool-result-rendering/issues/04-expanded-output-preservation.md
