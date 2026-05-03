# FSRS for Obsidian

- [🇷🇺](README.ru.md)
- [🇺🇸](README.md)
- [🇨🇳](README.zh.md) <

**Free Spaced Repetition Scheduler** — Obsidian 的现代间隔重复算法。
将笔记转化为基于 FSRS 的记忆卡片。

[![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?&logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-000000.svg?&logo=Rust&logoColor=white)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-LGPLv3-blue.svg?)](LICENSE)
[![pipeline status](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/badges/main/pipeline.svg)](https://gitlab.com/Evgene-Kopylov/FSRS-plugin)
[![DeepSeek](https://img.shields.io/badge/AI-DeepSeek-536DFE.svg)](https://deepseek.com)

## 📋 目录

[toc]

## 🚀 特性

- **📊 FSRS 算法** — 比 SM-2 更高效
- **🎯 记忆控制** — 70-97% 的保留率
- **⚡ 高性能** — Rust/WASM 实现快速计算
- **🔄 动态界面** — 列表自动刷新
- **📱 移动端支持** — iOS(?), Android(✓)
- **🎨 灵活配置** — 筛选、排序、自定义
- **📈 统计** — 追踪进度

## 📦 安装

### 通过 BRAT（测试版）

1. 在 Obsidian 中安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 打开 **设置** → **社区插件** → **BRAT**
3. 添加仓库：`https://github.com/Evgene-Kopylov/fsrs_plugin`
4. 在 **设置** → **社区插件** 中启用插件

### 系统要求

- Obsidian v1.12.7 或更高版本
- 支持 WebAssembly（默认启用）

### 平台支持

| 平台 | 状态 |
| :--- | :--- |
| Linux (x86_64) | ✅ |
| macOS | ❔ (未测试) |
| Windows (x86_64) | ✅ |
| Android | ✅ |
| iOS | ❔ (未测试) |

## 🐌 快速开始

1. **创建卡片** — 打开笔记 → 执行命令 `添加 FSRS 字段到 frontmatter`（Ctrl/Cmd+P）。
2. **添加复习按钮** — 使用命令 `FSRS：插入复习按钮块`（Ctrl/Cmd+P），或手动创建 ` ```fsrs-review-button``` ` 块，或在设置中启用自动添加。
3. **插入表格** — 使用命令 `插入默认 fsrs-table`（Ctrl/Cmd+P），或手动创建 ` ```fsrs-table ...``` ` 块。
4. **开始复习** — 打开表格，将鼠标悬停在文件名上，点击评分。

详细图文指南：[**使用说明**](docs/intended_use.zh.md)

## 📖 使用方法

### `fsrs-table` 块（类 SQL 语法）

`fsrs-table` 块使用类 SQL 语法来配置卡片显示。

**基本语法：**

````markdown
```fsrs-table
SELECT 字段1, 字段2 as "标题", 字段3
ORDER BY 字段4 DESC
LIMIT 30
```
````

**可用字段（列）：**

| 字段 | 描述 | 备注 |
| ------ | ---------- | ------------ |
| `file` | 卡片文件名 | 可点击链接 |
| `reps` | 已完成复习次数 | |
| `stability` | 稳定性 (S) | FSRS 参数 |
| `difficulty` | 难度 (D) | 值从 0 到 10 |
| `retrievability` | 可提取性 (R) | 正确回答的概率 |
| `due` | 下次复习日期和时间 | |
| `state` | 卡片状态 | New、Learning、Review、Relearning |
| `elapsed` | 距上次复习天数 | |
| `scheduled` | 距下次复习天数 | |

**块参数：**

- `SELECT` — 选择要显示的字段（必填）
- `ORDER BY` — 按指定字段排序（ASC - 升序，DESC - 降序）
- `LIMIT` — 限制行数（0 = 使用插件默认值）

**示例：**

1. 逾期卡片（按优先级）：

````markdown
```fsrs-table
SELECT file as " ", difficulty as "D",
       stability as "S", retrievability as "R",
       due as "下次复习"
LIMIT 20
```
````

2. 所有卡片按日期排序：

````markdown
```fsrs-table
SELECT *
ORDER BY due ASC
LIMIT 100
```
````

### 笔记中的复习按钮 `fsrs-review-button`

````markdown
```fsrs-review-button
```
````

### FSRS 卡片格式

FSRS 卡片存储在笔记的 frontmatter 中。`reviews` 字段：

```yaml
---
reviews:
  - date: "2026-01-15T10:30:00Z"
    rating: 2
  - date: "2026-01-20T14:15:00Z"
    rating: 3
---
```

**每次会话的字段：**

- **`date`** — ISO 8601 格式的日期/时间
- **`rating`** — `0`（重来）、`1`（困难）、`2`（良好）、`3`（简单）

**说明：**

- 新卡片的 `reviews` 可以为 `[]`
- 每次复习都会向数组中添加一个会话
- FSRS 根据历史记录计算下一个日期

## 🎮 插件命令

### 通过命令面板（Ctrl/Cmd+P）

- **FSRS：添加 FSRS 字段到 frontmatter**
- **FSRS：复习当前卡片**
- **FSRS：删除最后一次复习**
- **FSRS：显示复习历史**
- **FSRS：插入复习按钮块**
- **FSRS：插入默认 fsrs-table**
- **FSRS：显示 fsrs-table 语法帮助**

## ⚙️ 设置

### FSRS 算法参数

| 设置 | 描述 | 默认值 |
| :--- | :--- | :--- |
| **目标保留率** | 目标记忆保留率 | 0.9 (90%) |
| **最大间隔** | 最大间隔（天） | 36500（约100年） |
| **启用间隔模糊** | 间隔随机变化（±5%） | 启用 |

### 新卡片默认值

| 设置 | 描述 | 默认值 |
| :--- | :--- | :--- |
| **初始稳定性** | 初始稳定性 | 0.0 |
| **初始难度** | 新卡片初始难度 | 0.0 |

### 显示设置

| 设置 | 描述 | 默认值 |
| :--- | :--- | :--- |
| **自动添加复习按钮** | 自动复习按钮 | 关闭 |

### 筛选设置

| 设置 | 描述 | 示例 |
| :--- | :--- | :--- |
| **忽略模式** | 忽略模式 | `.obsidian/`、`templates/` |

## 🧠 FSRS 算法

**FSRS** — Jarrett Ye 开发的现代间隔重复算法。基于 [FSRS-5](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) 实现（[rs-fsrs](https://github.com/open-spaced-repetition/fsrs-rs) v1.2.1）。
与 SM-2 的区别：

- 通过机器学习学习记忆模式
- 适应用户的记忆速度
- 相同记忆水平下，所需复习次数减少 20-30%
- 更好地处理间隔（数周/数月）

### 核心概念

FSRS 参数遵循 **DSR 模型**（难度 → 稳定性 → 可提取性），
反映记忆过程的逻辑：从材料的基本特征，到掌握牢固程度，再到回忆概率。

- **Difficulty（D / 难度）** — 静态特征，反映材料本身的记忆难度。不随时间变化。
  范围：0–10。
- **Stability（S / 稳定性）** — 记忆牢固程度，以天为单位。
  表示多少天后回忆概率降至 90%。
- **Retrievability（R / 可提取性）** — 动态概率（0.0–1.0）
  表示当前时刻能回忆起来的概率。根据 S 和距上次复习的时间计算。

该算法使用 21 个参数，基于数百万次复习进行了优化。

**更多信息：** [ABC of FSRS](docs/ABC%20of%20FSRS.md)

## 🛠️ 开发

**开发在 GitLab 进行：** [gitlab.com/Evgene-Kopylov/FSRS-plugin](https://gitlab.com/Evgene-Kopylov/FSRS-plugin)。
GitHub 仓库为镜像。

### 技术栈

- **前端：** TypeScript、Obsidian API
- **算法：** Rust（编译为 WebAssembly）
- **构建：** esbuild、wasm-pack
- **测试：** Rust (cargo test) + TypeScript (vitest)

## Rust 与 TypeScript 的职责划分

**原则：** Rust — 计算核心，TypeScript — Obsidian API 的薄封装。

### 发布流水线

项目使用 GitLab CI/CD 进行自动化构建、测试和发布：

### 从源码构建

```bash
# 克隆仓库
git clone https://gitlab.com/Evgene-Kopylov/FSRS-plugin.git
cd FSRS-plugin

# 安装依赖
npm install

# 构建 WASM 模块
npm run build-wasm

# 开发（监听模式）
npm run dev

# 生产构建
npm run build
```

### WASM 集成

插件使用 Rust/WASM 进行 FSRS 计算：

- **WASM 二进制文件**通过 base64 嵌入插件
- **无网络请求** — 全部本地运行
- **高性能** — 原生计算

**更多信息：** [WASM Integration](docs/WASM-INTEGRATION.md)

## 📄 许可证

插件采用 **LGPLv3**。

**LGPL** 允许：

- 在专有软件中使用
- 要求开源修改后的库代码

### 主要权利

- ✅ 使用（免费，包括商业用途）
- ✅ 研究（源代码可用）
- ✅ 分发
- ✅ 改进

### 条件

- 库的修改 — 以 LGPLv3 发布
- 允许动态链接，无需公开应用程序代码
- 保留版权声明
- 分发修改时 — 提供源代码

### 对 Obsidian 用户

- 个人/商业用途自由使用
- 衍生插件 — 以 LGPLv3 发布
- Rust WASM 组件的修改 — 以 LGPLv3 发布

全文：[LICENSE](LICENSE)

## 🙏 致谢

- **Jarrett Ye (叶峻峣)** — FSRS 算法作者
- **Obsidian 社区** — 灵感与支持
- **Rust 社区** — WASM 工具
- **DeepSeek** — 强大且便捷的开发工具（代码、重构、本地化）
- **所有贡献者** — 改进和 Bug 报告

## 📚 其他资源

- [FSRS 官方文档](https://github.com/open-spaced-repetition/fsrs)
- [Obsidian 论坛讨论](https://forum.obsidian.md/)
- [Issues 和功能请求](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/work_items)
- [fsrs-table 使用指南](docs/intended_use.zh.md)

***

**注意：** 插件正在积极开发中。功能可能会有小幅变化。
