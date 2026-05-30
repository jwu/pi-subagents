Status: ready-for-agent

# 展开态完整输出保护

## Parent

.scratch/subagent-tool-result-rendering/PRD.md

## What to build

在引入宽度感知工具调用行后，确保展开态仍然保留完整子代理信息：工具调用列表显示全部调用，子代理最终输出继续使用现有 Markdown 渲染，不被单行截断组件影响。

该 slice 的重点是保护展开态语义：展开应意味着“看完整细节”，而不是只看到截断后的工具轨迹或被降级的输出正文。

## Acceptance criteria

- [ ] 展开态显示全部工具调用，不受 20 个折叠态限制影响。
- [ ] 展开态子代理最终输出继续使用 Markdown 渲染。
- [ ] 宽度感知单行截断只作用于工具调用/提示行，不作用于完整 Markdown 输出。
- [ ] 展开态下长输出仍可按现有方式显示。
- [ ] 有测试覆盖展开态完整工具列表和 Markdown 输出保护。
- [ ] 类型检查通过。

## Blocked by

- .scratch/subagent-tool-result-rendering/issues/03-width-aware-single-line-tool-rows.md
