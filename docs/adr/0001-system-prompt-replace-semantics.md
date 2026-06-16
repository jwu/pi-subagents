# 明确 replace 模式的系统提示词语义

我们将旧的 `systemPrompt: replace` 行为重命名为 `replace-all`，并让 `replace` 表示更窄的语义：只替换 pi 默认系统提示词，但保留 pi context files（如 AGENTS.md 与 CLAUDE.md）。这是一次破坏性配置变更；选择这组命名，是因为它更贴近 pi 原生区分“替换默认提示词”和“禁用 context files”的方式。
