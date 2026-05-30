# PRD：Subagent 工具结果渲染

Status: ready-for-agent

## 问题陈述

当主代理把任务委派给子代理后，`subagent` 工具结果会在主代理对话中展示子代理的工具活动。这个执行轨迹很有用，但当子代理调用很多工具，或某个工具调用参数很长时，结果会变得嘈杂、占屏，并降低可扫读性。

用户需要在主代理视角下快速看懂子代理做了什么，同时在需要调试时仍能展开查看完整工具调用轨迹和完整子代理输出。折叠态应该紧凑；展开态应该完整。

## 方案

改进 `subagent` 工具结果渲染，让主代理看到紧凑、熟悉、宽度安全的子代理活动摘要。

折叠态只展示最近 20 个工具调用。如果有更早的调用被隐藏，显示 pi 风格的展开提示，例如：`... (53 earlier tool calls, Ctrl+O to expand)`。提示中的按键必须使用用户当前配置的 pi 工具展开快捷键，而不是硬编码 `Ctrl+O`。该提示行应使用 dim 样式，降低视觉噪音。折叠态最终输出摘要显示原始 Markdown 文本的前 20 个 `\n` 行（含空行、含代码块），不做任何预处理；用 `Text` 组件渲染，与 pi builtin 工具风格一致。空行计入 20 行。如果输出超过 20 行，末尾追加截断提示：`... (N more lines, <keybinding> to expand)`，dim 样式，提示行不计入 20 行。

展开态展示全部工具调用，并保留现有完整子代理输出渲染。工具调用行沿用原有路径显示方式：宽度足够时显示在一行，宽度不足时允许自然换行；不做左侧路径省略，也不做右侧 `...` 截断。

工具调用摘要应尽可能复刻 pi 原生 `renderCall` 的标题风格，覆盖常见工具：`read`、`bash`、`edit`、`write`、`find`、`grep`、`ls`、`subagent`、`webfetch`。折叠态和展开态的工具调用列表都应应用同一套 best-effort highlight：工具名使用工具标题样式，路径/主要参数使用 accent，辅助信息使用 toolOutput/muted/dim 等近似样式。`grep` 的 highlight 以 `~/bin/pi-config/extensions/grep-highlight.ts` 为参考：pattern 使用 `syntaxKeyword`，` in ` 使用 `dim`，路径使用 `accent`，glob 使用 `muted`，limit 使用 `toolOutput`。精确保留子进程中的真实 `renderCall` TUI 组件不在本方案内，因为子代理 JSON 事件流只包含工具名称、调用 ID、参数、部分结果和最终结果；不会携带序列化后的 `renderCall` 输出。

## 用户故事

1. 作为主代理用户，我希望折叠态的子代理结果只展示最近的工具活动，以免长任务刷屏。
2. 作为主代理用户，我希望当工具调用被隐藏时看到隐藏数量，以便知道当前轨迹不完整。
3. 作为主代理用户，我希望隐藏数量提示告诉我如何展开，以便快速查看完整轨迹。
4. 作为主代理用户，我希望展开提示尊重我的 pi 快捷键配置，以免 UI 提示和实际按键不一致。
5. 作为主代理用户，我希望展开态显示所有工具调用，以便审计或调试子代理工作。
6. 作为主代理用户，我希望工具调用行宽度足够时保持单行，宽度不足时自然换行，以免路径或文件名被省略导致信息丢失。
7. 作为主代理用户，我希望超长工具调用行不要做左侧路径省略或右侧 `...` 截断，而是沿用普通文本换行行为。
8. 作为主代理用户，我希望 `read` 调用看起来像 pi 原生 `read` 调用，以便快速识别文件读取。
9. 作为主代理用户，我希望 `bash` 调用看起来像 pi 原生 bash 调用，以便命令行操作更突出。
10. 作为主代理用户，我希望 `edit` 调用显示被编辑路径，以便快速发现文件修改。
11. 作为主代理用户，我希望 `write` 调用只显示写入路径，不直接倾倒完整写入内容，以便轨迹保持紧凑。
12. 作为主代理用户，我希望 `find` 调用显示 pattern、目标路径和 limit，以便理解搜索行为。
13. 作为主代理用户，我希望 `grep` 调用显示 pattern、目标路径、glob 和 limit，以便理解搜索行为。
14. 作为主代理用户，我希望 `ls` 调用显示目标路径和 limit，以便理解目录列举行为。
15. 作为主代理用户，我希望 `webfetch` 调用显示 URL 和 mode，以便理解网络读取行为。
16. 作为主代理用户，我希望嵌套 `subagent` 调用显示代理名和任务预览，以便看懂子代理继续委派了什么。
17. 作为主代理用户，我希望隐藏数量提示使用 dim 样式，以便知道它是辅助提示而不是实际工具调用。
18. 作为主代理用户，我希望工具调用摘要继承接近原生 `renderCall` 的 highlight，以便路径、pattern、命令等关键信息更容易扫读。
19. 作为主代理用户，我希望长路径沿用原来的缩短路径显示方式，宽度不足时换行而不是改写为 `.../foo/bar/file.ts`。
20. 作为维护者，我希望未知工具有稳定 fallback 摘要，以便扩展工具即使没有专门格式化也能可用。
21. 作为维护者，我希望格式化逻辑无需真实 TUI 也能测试，以便捕捉渲染回归。
22. 作为维护者，我希望工具日志渲染复用普通文本换行行为，避免额外路径省略或截断逻辑散落在格式化函数中。
23. 作为维护者，我希望展开态完整 Markdown 输出保持不变，以免用户丢失子代理富文本输出。

## 实现决策

- 折叠态子代理结果只显示最近 20 个工具调用。
- 折叠态子代理最终输出摘要显示原始 Markdown 文本的前 20 个 `\n` 行（含空行、含代码块），不做预处理；用 `Text` 组件渲染。空行计入 20 行，与 pi builtin 工具（read、bash 等）渲染风格一致。不再额外限制为 3 个段落，也不去除代码块。
- 折叠态输出超过 20 行时，末尾追加截断提示：`... (N more lines, <keybinding> to expand)`，dim 样式，提示行不计入 20 行。N 为剩余行数（原始 `\n` 行总数 - 20）。展开快捷键通过 pi 的 keybinding hint 工具动态获取。
- 子代理 usage 行应使用 `agent_end.messages` 中所有 assistant 消息的聚合 usage，避免只显示最后一个 assistant turn 的 token/cost。context window 优先从事件 usage 读取，缺失时根据消息 provider/model 从 pi model registry 推断。
- 展开态子代理结果显示全部工具调用。
- 隐藏数量文案使用 `earlier tool calls`，不用 `earlier tools`，因为这里统计的是调用记录，不是工具定义种类。
- 状态行保留现有 `2 tools` 这类说法，不改成 `2 tool calls`。
- 展开提示必须通过 pi 的 keybinding hint 工具生成，而不是硬编码快捷键。
- 隐藏数量提示行使用 dim 样式渲染。
- 支持 best-effort 工具调用标题复刻。精确保留子进程真实 `renderCall` 输出不可行，除非 pi 上游事件 schema 未来支持序列化渲染结果。
- 常见工具格式化覆盖：`read`、`bash`、`edit`、`write`、`find`、`grep`、`ls`、`subagent`、`webfetch`。
- `subagent` 自身的 `renderCall` 在折叠态和展开态都应保留标题 highlight：`subagent` 使用 `toolTitle` + bold，代理名使用 `accent`；展开态的任务正文和折叠态任务预览使用同样的 `dim` 样式。
- 折叠态和展开态的工具调用标题都应尽可能复刻原生 highlight：工具名 `toolTitle` + bold，路径/主参数 `accent`，limit、mode 等辅助文本 `toolOutput`，bash timeout 使用 muted，fallback/任务预览可使用 dim。
- `grep` 标题 highlight 参考 `~/bin/pi-config/extensions/grep-highlight.ts`：`grep` 工具名使用 `toolTitle` + bold，pattern（`/.../`）使用 `syntaxKeyword`，` in ` 使用 `dim`，path 使用 `accent`，glob 使用 `muted`，limit 使用 `toolOutput`。
- 长路径不做左侧省略改写；沿用原始缩短路径（如 `~/...`）和普通文本换行行为。
- 工具调用行不做宽度感知硬截断；当终端宽度不足时允许换行。
- 完整子代理输出在展开态继续单独渲染，保留现有 Markdown 行为。
- `write` 工具调用第一版只显示路径摘要；不展示写入内容预览。
- 未知工具 fallback 为基于工具名和第一个字符串参数的一行摘要。

## 测试决策

- 测试应验证外部可见渲染行为，而不是内部 helper 结构。
- 现有子代理渲染测试是先例，应继续覆盖格式化行为。
- 单元测试应覆盖折叠态 20 个工具调用限制，以及展开态显示全部工具调用。
- 单元测试应覆盖隐藏数量文案、展开快捷键提示注入，以及隐藏提示行 dim 样式。
- 单元测试应覆盖 `read`、`bash`、`edit`、`write`、`find`、`grep`、`ls`、`subagent`、`webfetch` 的 best-effort 标题格式。
- 单元测试应覆盖 `subagent` 自身 `renderCall` 的折叠态和展开态标题 highlight，并确认展开态任务正文使用与折叠态任务预览一致的 `dim` 样式。
- 单元测试应覆盖折叠态和展开态常见工具标题的 highlight 结构，尤其是 `ls` 路径使用 accent、工具名使用 toolTitle + bold，以及 `grep` pattern/path/glob/limit 使用与 grep-highlight 扩展一致的样式。
- 单元测试应覆盖长路径在宽度不足时换行而不是左侧省略，并确认 `read` 的行号范围仍保留。
- 单元测试应覆盖折叠态最终输出摘要显示原始 Markdown 文本的前 20 个 `\n` 行（含空行、含代码块），不做预处理；超过 20 行时追加 dim 截断提示，提示行不计入 20 行。确认不会去除代码块或在 3 个段落处提前停止。
- 单元测试应覆盖从 `agent_end.messages` 聚合 usage，而不是只依赖单个 `message_end`。
- 测试应确认子代理输出摘要和展开态 Markdown 输出保持现有换行/Markdown 行为。
- 类型检查仍作为验证步骤。

## 不在范围内

- 将子进程真实 TUI `renderCall` 组件序列化进 JSON 事件。
- 修改 pi 上游事件 schema。
- 在子代理工具日志里渲染完整 `write` 内容预览。
- 将状态行里的 `tools` 改为 `tool calls`。
- 修改子代理执行器行为或任务委派语义。
- 修改领域词汇表；本工作关注渲染行为，不涉及领域语言调整。

## 进一步说明

讨论中已经确认的小决策包括：折叠态限制为 20 个工具调用，展开态显示全部工具调用，隐藏数量提示使用 pi 当前配置的工具展开快捷键，隐藏提示使用 dim 样式，工具调用 result 行尽量复刻原生 `renderCall` highlight，长路径不做左侧省略而是允许换行。

剩余风险最高的设计点是 highlight 与普通文本换行的组合。最稳妥的方案是继续使用普通 Text 渲染工具日志块，保持展开态 Markdown 输出不变。

## Grill 确认

2026-05-30 grill-with-docs 面谈确认折叠态输出摘要行为：
- 与展开态 Markdown 渲染方式**不一致**（展开态用 `Markdown` 组件，折叠态用 `Text` 组件按 `\n` 行截断），与 pi builtin 工具（read、bash 等）行为一致
- 不做代码块去除、不过滤空行、不 trim——原始文本直接截前 20 行
- 空行计入 20 行
- 截断提示 `... (N more lines, <keybinding> to expand)` dim 样式，不计入 20 行
- 子代理输出以代码块开头导致摘要全是代码：接受，不做特殊处理
