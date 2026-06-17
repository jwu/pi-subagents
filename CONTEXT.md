# pi-subagents

一个 pi 扩展，提供子代理能力——主代理可以将任务委派给在隔离上下文中运行的子 pi 进程。

## 术语表

**子代理（Sub-agent）**：
由主代理启动的隔离子 pi 进程，用于完成委派任务。默认不继承父会话历史；调用时可用 `session: fork` 从当前父会话 leaf 创建独立分支快照。
_避免使用_：Child process、worker process（"worker" 是特定的代理名称，而非子代理的同义词）

**代理（Agent）**：
一个命名配置，定义子代理的行为：拥有哪些工具、使用哪个模型以及其系统提示词。代理以含 YAML frontmatter 的 `.md` 文件形式定义，存放在 `agents/` 目录中。
_避免使用_：Agent config、agent profile

**任务（Task）**：
从父代理传递给子代理的自然语言指令，包含完成任务所需的即时上下文。默认 `session: none` 时子代理没有父会话历史；`session: fork` 时仍应在任务中明确本次委派目标与期望输出。
_避免使用_：Prompt、job、command

**允许的代理（`allowedAgents`）**：
可选的 frontmatter 字段，限制某个代理可以派发哪些子代理。由父进程在子进程启动前强制执行——子进程永远不会看到其父代理允许列表之外的代理名称。
_避免使用_：subagent_agents、agent allowlist、spawn restriction

**工具（`tools`）**：
代理可用的工具名称严格白名单。frontmatter 中使用逗号分隔的字符串。pi 内置工具（read、write、edit、bash、grep、find、ls）及扩展发现的工具均自动解析——无需手动维护路径映射。
_避免使用_：tool list、tool set、tool configuration

**技能（Skill）**：
可按需加载的能力包，为代理提供特定任务的工作流、说明和引用资料。技能以 frontmatter 中的 `name` 作为唯一身份；没有 `name` 的技能定义无效。代理可声明精确技能名称，也可用简单通配符（如 `*`、`lark-*`）声明一组技能。子代理启动时会收到可用技能列表，并在任务匹配时读取对应技能文件。
_避免使用_：skill prompt、capability file、instruction bundle

**系统提示词模式（`systemPrompt`）**：
控制代理的 Markdown 正文如何应用于子代理系统提示词。`append`（默认）保留 pi 默认提示词与项目上下文文件，再追加代理正文；`replace` 替换 pi 默认提示词但保留项目上下文文件；`replace-all` 同时替换 pi 默认提示词并排除项目上下文文件。取值为 `append`、`replace` 或 `replace-all`。
_避免使用_：system prompt strategy、prompt injection mode、replace-pi-only

**子代理系统提示词（Sub-agent system prompt）**：
子代理启动时接收的系统级指令，由代理定义、系统提示词模式以及子代理可用资源提示共同组成。`append` 模式包含 pi 默认提示词与项目上下文；`replace` 模式以代理正文为主体但仍包含项目上下文；`replace-all` 模式仅以代理正文为主体。用于预览与核对子代理会话开始前的行为边界。
_避免使用_：subagent prompt、agent prompt、child prompt

**调试导出（Debug export）**：
对子代理运行时有效系统提示词的文件化快照，用于核对子代理实际接收到的行为边界。`append` 与 `replace` 模式的导出应包含项目上下文文件；`replace-all` 模式的导出不包含项目上下文文件，但应包含由运行时注入的工具与指南块。
_避免使用_：prompt preview、debug command output

**可用子代理提示（Available subagents prompt）**：
向模型暴露当前可派发的代理名称。工具提示中保留一行 `Available subagents: scout, worker`；当活动工具集包含 `subagent` 时，子进程在 `before_agent_start` hook 中向系统提示词追加独立块 `Available subagents:\n- scout\n- worker`。该列表受递归深度和 `allowedAgents`/`PI_SUBAGENT_ALLOWED` 过滤约束，子进程不会看到父代理允许列表之外的代理名称。
_避免使用_：agent list prompt、subagent guideline only

**模型（`model`）**：
LLM 服务商和模型 ID，格式为 `provider/model-id`（例如 `anthropic/claude-sonnet-4-6`）。可选；默认使用父代理会话的活动模型。
_避免使用_：llm、model config

**推理等级（`thinking`）**：
代理的推理/思考等级：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`。默认为 `off`。控制传递给子 pi 进程的 `--thinking` 标志。
_避免使用_：reasoning level、think mode

**代理目录（`agents/`）**：
存放代理 `.md` 定义文件的目录。全局：`~/.pi/agent/agents/`。按项目：`.pi/agents/`。通过扫描这些目录发现代理；不捆绑内置代理。
_避免使用_：agent folder、agent config directory

**最大深度（`maxDepth`）**：
从本代理向下允许的最大递归深度。从本代理自身层级开始计数：`maxDepth: 0` 表示不允许派发子代理，`maxDepth: 1` 允许派发一层子代理，以此类推。若代理拥有 `subagent` 工具但未声明显式值，默认为 10。通过传递给子进程的 `PI_SUBAGENT_DEPTH` 和 `PI_SUBAGENT_MAX_DEPTH` 环境变量强制执行。
_避免使用_：recursion limit、depth limit、nesting limit

**子代理会话（Session for sub-agents）**：
子代理会话存储在 `~/.pi/agent/sessions/{project}/subagents/` 下，使用 pi 的正常会话管理（不使用 `--no-session`）。默认 `session: none` 创建新的独立子代理会话；显式 `session: fork` 会从当前调用者的父会话 leaf 创建分支 session，并通过 `--session` 传给子进程。若父会话无法 fork（未持久化、无 leaf、fork 文件未落盘，或显式 `cwd` 与父会话 cwd 不同），会降级为 `none` 并在结果元数据/渲染中给出 warning。
_避免使用_：ephemeral session、sub-agent session directory
