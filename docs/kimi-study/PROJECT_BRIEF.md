# Kimi Study 项目简报

## 产品定位

Kimi Study 是基于 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 官方仓库 fork 出来的**家庭学习工具**，面向不懂编程的家庭成员。

它保留 Kimi Code 底层的文件读取、工具调用、Skill、会话和 Agent 能力，但把用户界面重新包装成以 AI 导师为核心的长期学习工作台。

## 核心原则

1. **以改为主，以现成为主**：优先复用 Kimi Code 已有代码和成熟外部组件，不让模型原创大量代码。
2. **稳定优先**：面向家人使用，不追新、不重写、不做复杂动效。
3. **独立运行**：与原版 Kimi Code 隔离端口、数据目录、workspace 和配置。
4. **可同步上游**：保留与官方 Kimi Code 同步的能力，通过 Git upstream 合并更新。

## 用户不需要知道的概念

- workspace / session / 模型 / thinking
- Git / diff / terminal
- 文件路径 / shell 命令
- Kimi 调用了什么工具

## 用户只需要理解

- 我为什么学这个
- 我今天学什么
- 我现在应该做什么
- 哪些内容我只是看过
- 哪些内容我已经真正理解
- 下一步是什么

## 数据模型

以 **Teach Skill** 的学习文件为学习模型：

- `MISSION.md`：定义一个学习任务
- `RESOURCES.md`：学习资源清单
- `learning-records/`：学习记录和证据
- `NOTES.md`：笔记与复习队列

第一版不新增学习数据库，workspace 文件是学习事实来源。

## 关键功能方向

1. **产品配置（Product Profile）**：通过 `code` / `study` 产品配置，控制界面元素显示与隐藏。
2. **学习首页**：突出"继续学习"，显示当前进行中的 Mission 和下一步。
3. **教学看板**：基于 Teach 文件生成学习进度看板，只读展示。
4. **文件上传**：支持 EPUB 等普通学习资料安全上传到 workspace。
5. **HTML 预览修复**：让远程部署的 Kimi Web 也能直接预览 HTML 内容。
6. **技术能力渐进披露**：高级功能（terminal、git 等）默认隐藏，需要时显式开启。

## 第一版明确不做

- 商业 LMS 或多用户账号系统
- 复杂的数据库或后端存储
- 面向大众的产品化包装
- 替换 Kimi 原有设计系统或图标
- 自动同步上游（仍需手动维护）

## 部署形态

```
原版 Kimi Code          Kimi Study
官方 npm/npx 安装        自定义 Docker/Podman 镜像
端口 3847               端口 3857
编程数据                 学习数据
互不共享                 互不共享
```

## 维护方式

- 上游：`MoonshotAI/kimi-code`
- Origin：`Sebastianhayashi/kimi-code`
- 定期 `git fetch upstream` 后合并/变基，解决冲突，测试 Study 功能，构建新镜像。
- 大版本更新时让 Kimi 在独立分支做实验版本，验证后再决定是否推送给最终用户。
