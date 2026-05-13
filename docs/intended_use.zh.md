# FSRS 使用指南

- [🇷🇺](intended_use.ru.md)
- [🇺🇸](intended_use.en.md)
- [🇨🇳](intended_use.zh.md) <

本指南将介绍安装插件后如何开始使用。
一切都在 Obsidian 中运行 — 无需外部服务。

---

## 0. 安装

插件尚未上架 Obsidian 社区目录 —
请通过 **BRAT**（Beta Reviewers Auto-update Tester）安装：

1. 从 **设置 → 第三方插件 → 浏览** 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. 打开 **设置 → BRAT → Add Beta plugin**
3. 输入仓库 URL：`https://github.com/Evgene-Kopylov/fsrs_plugin`
4. 在 **设置 → 第三方插件** 中启用插件

BRAT 将自动跟踪更新。

---

## 1. 初始化卡片

安装并启用插件后，打开您计划复习的笔记。

打开命令面板（`Ctrl/Cmd+P`）并执行：

### FSRS：添加 FSRS 字段到 frontmatter

![命令面板中的「添加 FSRS 字段」命令](images/add-fsrs-fields-command.png)

插件将在笔记的 frontmatter 中添加空的 `reviews: []` 数组，
并在 frontmatter 之后插入复习按钮：

````markdown
---
reviews: []
---

```fsrs-review-button
```
````

在阅读模式下，代码块将渲染为按钮。
点击后弹出评分选项：
**Again**（重来）、**Hard**（困难）、**Good**（良好）、**Easy**（简单）。

![阅读模式下的复习按钮](images/btn-in-preview.png)

按钮在表格的悬停预览中同样可点击 —
这是主要的复习流程（见第 2 节）。

也可以直接通过命令复习：**FSRS：✓ 复习当前卡片** —
无需按钮，从面板直接调用。是否自动插入按钮可在设置中配置。

`reviews` 数组存储日期和评分。
几次复习后，frontmatter 如下所示：

```yaml
---
reviews:
  - date: "2025-03-15T12:00:00Z"
    rating: 2
  - date: "2025-03-17T08:00:00Z"
    rating: 3
---
```

评分值：
**0** = Again（重来）、
**1** = Hard（困难）、
**2** = Good（良好）、
**3** = Easy（简单）。

如果在设置中关闭了自动插入 —
请手动执行 **FSRS：插入复习按钮块**。

---

## 2. 创建卡片表格

打开您想要查看卡片集合的笔记，执行：

### FSRS：插入默认 fsrs-table

![命令面板中的「插入 fsrs-table」命令](images/insert-table.png)

它将插入现成的 `fsrs-table` 块与类 SQL 查询：

````markdown
```fsrs-table
SELECT file as "卡片",
       retrievability as "R",
       stability as "S",
       difficulty as "D",
       due as "下次复习"
LIMIT 20
```
````

在阅读模式下，该块将渲染为包含所有卡片的表格，
默认排序（按紧急程度 — 最遗忘的在上方）。

![渲染后的 fsrs-table 含卡片](images/fsrs-table-demonstration.png)

### 各列含义

FSRS 根据复习历史（日期和评分）为每张卡片计算三个参数：

| 字段 | 含义 | 变化方式 |
| --- | --- | --- |
| **Difficulty** (D) | 材料难度 | 几乎不变 — 难的主题始终难 |
| **Stability** (S) | 记忆牢固程度（天） | 每次成功复习后增长 |
| **Retrievability** (R) | 当前回忆概率 | 复习后每秒下降 |

当 Retrievability 低于阈值时，卡片出现在复习列表中。
阈值可配置：想要 90% 保留率？复习更频繁。80% 足够？复习更少。

完整字段列表 — 见 [README](../README.zh.md###可用字段列)。
查询定制示例 — 见 [sql-syntax.md](sql-syntax.md)。

---

## 3. 无需跳转即可复习

这是插件的主要使用场景。
将鼠标悬停在表格中的文件名上。

将弹出包含笔记内容的窗口，
其中正是复习按钮 — 可直接从预览中点击。

![包含内容和复习按钮的弹出窗口](images/demo-tanzanit.gif)

复习循环保持在同一个窗口中：

1. 打开包含表格的笔记（例如每日笔记）。
2. 表格显示所有卡片 — 最紧急的在最上方。
3. 悬停在卡片上 — 弹出内容。
4. 阅读，点击评分 — 卡片更新。
5. 移到下一行。

这样可以在几分钟内浏览所有卡片，
无需切换到其他笔记。

---

## 首次使用快速检查清单

- [ ] 已通过 BRAT 安装并启用插件
- [ ] 对第一张卡片笔记执行 **FSRS：添加 FSRS 字段到 frontmatter**
  （按钮会自动添加）
- [ ] 执行 **FSRS：插入默认 fsrs-table**
- [ ] 一切就绪，可以开始复习

---
