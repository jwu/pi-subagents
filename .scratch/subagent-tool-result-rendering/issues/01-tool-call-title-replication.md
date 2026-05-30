Status: ready-for-agent

# 常见工具调用标题 best-effort 复刻

## Parent

.scratch/subagent-tool-result-rendering/PRD.md

## What to build

让子代理结果中的工具调用列表尽可能使用接近 pi 原生工具 `renderCall` 的一行标题风格。覆盖常见工具：`read`、`bash`、`edit`、`write`、`find`、`grep`、`ls`、`subagent`、`webfetch`。未知工具保留稳定 fallback 摘要。

该 slice 完成后，用户在主代理视角查看子代理执行轨迹时，应能通过熟悉的标题快速识别每个工具调用，而不是看到 JSON blob 或不一致的格式。

## Acceptance criteria

- [ ] `read` 调用显示路径和行号范围（如适用），风格接近 pi 原生 read 标题。
- [ ] `bash` 调用显示为命令风格标题，并包含 timeout（如适用）。
- [ ] `edit`、`write`、`find`、`grep`、`ls`、`subagent`、`webfetch` 均有明确的一行标题格式。
- [ ] 未知工具仍有稳定 fallback，不抛错、不显示原始 JSON blob。
- [ ] 有测试覆盖上述常见工具和未知工具 fallback。
- [ ] 类型检查通过。

## Blocked by

None - can start immediately
