# Issue 跟踪：本地 Markdown

本仓库的 Issue 和 PRD 以 Markdown 文件形式存放在 `.scratch/` 目录下。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD 文件：`.scratch/<feature-slug>/PRD.md`
- 实现 Issue：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- Triage 状态记录在每个 Issue 文件顶部的 `Status:` 行（状态值见 `triage-labels.md`）
- 评论和对话历史追加到文件末尾的 `## 评论` 标题下

## 当技能说"发布到 issue tracker"

在 `.scratch/<feature-slug>/` 下创建新文件（如目录不存在则先创建）。

## 当技能说"获取相关工单"

读取指定路径的文件。用户通常会直接传递文件路径或 Issue 编号。
