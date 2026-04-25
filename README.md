# FSRS Plugin for Obsidian

- [🇷🇺](README.ru.md)
- [🇺🇸](README.md) <

**Free Spaced Repetition Scheduler** — a modern spaced repetition algorithm for Obsidian.
The plugin turns your notes into FSRS-based flashcards for effective memorization.

[![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?&logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-000000.svg?&logo=Rust&logoColor=white)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-LGPLv3-blue.svg?)](LICENSE)
[![GitLab CI](https://img.shields.io/gitlab/pipeline-status/Evgene-Kopylov/FSRS-plugin?branch=main&)](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/pipelines)

## 📋 Table of Contents

[toc]

## 🚀 Features

- **📊 FSRS Algorithm** — more efficient than SM-2
- **🎯 Retention Control** — 70–97% target level
- **⚡ High Performance** — Rust/WASM for fast computations
- **🔄 Dynamic Interface** — auto-updating lists
- **📱 Mobile Support** — iOS, Android
- **🎨 Flexible Configuration** — filtering, sorting, customization
- **📈 Statistics** — track your progress

## 📦 Installation

### Via Obsidian Community Plugins (recommended)

1. Go to **Settings** → **Community plugins** → **Browse**
2. Search for "FSRS Plugin"
3. Click **Install**, then **Enable**

### Via BRAT (for beta testing)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian
2. Open **Settings** → **Community plugins** → **BRAT**
3. Add the repository: `https://github.com/Evgene-Kopylov/fsrs_plugin`
4. Enable the plugin in **Settings** → **Community plugins**

### Requirements

- Obsidian v0.15.0 or higher
- WebAssembly support (enabled by default)

## 🐌 Quick Start

1. **Create a card** – open a note → run the command `Add FSRS fields to file header` (Ctrl/Cmd+P).
2. **Add a review button** – insert a ` ```fsrs-review-button``` ` block in your note (or enable auto-adding in settings).
3. **Insert a table** – in another note, create a ` ```fsrs-table ...``` ` block.
4. **Start reviewing** – open the table, hover over a file name, and click a rating.

A detailed step-by-step guide with screenshots: [**Usage Guide**](docs/intended_use.md)

## 📖 Usage

### The `fsrs-table` Block (SQL-like Syntax)

The `fsrs-table` block uses SQL-like syntax to customize how cards are displayed.

**Basic syntax:**

````markdown
```fsrs-table
SELECT field1, field2 as "Header", field3
ORDER BY field4 DESC
LIMIT 30
```
````

**Available columns:**

| Field | Description | Notes |
|-------|-------------|-------|
| `file` | card file name | clickable link |
| `reps` | number of repetitions completed | |
| `overdue` | hours overdue | |
| `stability` | card stability (S) | FSRS parameter |
| `difficulty` | card difficulty (D) | value from 0 to 10 |
| `retrievability` | retrievability (R) | probability of correct recall |
| `due` | next review date and time | |
| `state` | card state | New, Learning, Review, Relearning |
| `elapsed` | days since last review | |
| `scheduled` | days until next review | |

**Block parameters:**

- `SELECT` — choose fields to display (required)
- `ORDER BY` — sort by a specified field (`ASC` ascending, `DESC` descending)
- `LIMIT` — limit the number of rows (`0` uses the value from plugin settings)

**Examples:**

1. Overdue cards with priority:

````markdown
```fsrs-table
SELECT file as " ", retrievability as "R",
       stability as "S", difficulty as "D",
       overdue as "Overdue"
LIMIT 20
```
````

2. All cards sorted by date:

````markdown
```fsrs-table
SELECT *
ORDER BY due ASC
LIMIT 100
```
````

### Review Button in Notes `fsrs-review-button`

````markdown
```fsrs-review-button
```
````

### FSRS Card Format

FSRS cards are stored in the note's frontmatter under the `reviews` field:

```yaml
---
reviews:
  - date: "2025-01-15T10:30:00Z"
    rating: "Good"
    stability: 5.21
    difficulty: 0.45
  - date: "2025-01-20T14:15:00Z"
    rating: "Easy"
    stability: 12.5
    difficulty: 0.35
---
```

**Fields of each review session:**

- **`date`** — date/time in ISO 8601
- **`rating`** — `"Again"`, `"Hard"`, `"Good"`, or `"Easy"`
- **`stability`** — S, stability (days)
- **`difficulty`** — D, difficulty (0.0–1.0)

**Notes:**

- `reviews` can be `[]` for new cards
- Each review adds a session to the array
- FSRS calculates the next review date based on history
- The plugin adds these fields automatically

## 🎮 Plugin Commands

### Via Command Palette (Ctrl/Cmd+P)

- **FSRS Plugin: Add FSRS fields to file header**
- **FSRS Plugin: Find cards to review**
- **FSRS Plugin: Review current card**
- **FSRS Plugin: Remove last card review**
- **FSRS Plugin: Show review history**
- **FSRS Plugin: Show fsrs-table syntax help**

### Via the Status Bar

- Button `🔄FSRS:` at the bottom of the Obsidian window

## ⚙️ Settings

### FSRS Algorithm Parameters

| Setting | Description | Default |
|---------|-------------|---------|
| **Request Retention** | Target retention level | 0.92 (92%) |
| **Maximum Interval** | Max interval (days) | 36500 (~100 years) |
| **Enable Interval Fuzz** | Randomize intervals (±5%) | Enabled |

### Default Settings for New Cards

| Setting | Description | Default |
|---------|-------------|---------|
| **Initial Stability** | Initial stability | 0.0 |
| **Initial Difficulty** | Initial difficulty for new cards | 0.0 |

### Display Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Auto Add Review Button** | Automatically add review button | Disabled |

### Early Review Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Minimum Early Review Interval** | Minimum minutes before review | 40 |

### Filter Settings

| Setting | Description | Example |
|---------|-------------|---------|
| **Ignore Patterns** | Ignore patterns | `.obsidian/`, `templates/` |

## 🧠 The FSRS Algorithm

**FSRS** is a modern spaced repetition algorithm by Jarrett Ye. Compared to SM-2:

- Learns memory patterns via machine learning
- Adapts to your memory speed
- Requires 20–30% fewer reviews for the same retention level
- Handles breaks (weeks/months) much better

### Key Concepts

- **Retrievability (R)** — probability of successful recall
- **Stability (S)** — time it takes for R to decay from 100% to 90%
- **Difficulty (D)** — information difficulty (affects how stability grows)

The algorithm uses 21 parameters optimized on millions of reviews.

**Read more:** [ABC of FSRS](docs/ABC%20of%20FSRS.md)

## 🛠️ Development

**Development happens on GitLab:** [gitlab.com/Evgene-Kopylov/FSRS-plugin](https://gitlab.com/Evgene-Kopylov/FSRS-plugin).
The GitHub repository is a mirror.

### Tech Stack

- **Frontend:** TypeScript, Obsidian API
- **Algorithm:** Rust (compiled to WebAssembly)
- **Build:** esbuild, wasm-pack
- **Testing:** Rust (cargo test) + TypeScript (vitest)

### Rust and TypeScript Responsibility Split

**Principle:** Rust is the computation core, TypeScript is a thin wrapper for the Obsidian API.

### Release Pipeline

The project uses GitLab CI/CD for automated build, test, and release:

[![GitLab CI](https://img.shields.io/gitlab/pipeline-status/Evgene-Kopylov/FSRS-plugin?branch=main&)](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/pipelines)

### Building from Source

```bash
# Clone the repository
git clone https://gitlab.com/Evgene-Kopylov/FSRS-plugin.git
cd FSRS-plugin

# Install dependencies
npm install

# Build the WASM module
npm run build-wasm

# Development (watch mode)
npm run dev

# Production build
npm run build
```

### WASM Integration

The plugin uses Rust/WASM for FSRS computations:

- **WASM binary** is embedded into the plugin via base64
- **No network requests** — everything runs locally
- **High performance** — native-level computation

**Read more:** [WASM Integration](docs/WASM-INTEGRATION.md)

## 📄 License

This plugin is licensed under **LGPLv3**.

**LGPL** permits:

- Use in proprietary software
- Requires modified library source code to be open

### Main Rights

- ✅ Use (free, including commercial use)
- ✅ Study (access to source code)
- ✅ Distribute
- ✅ Improve

### Requirements

- Library modifications must remain under LGPLv3
- Dynamic linking is allowed without disclosing application code
- Maintain copyright notices
- Provide source code when distributing modifications

### For Obsidian Users

- Free to use for personal/commercial purposes
- Derivative plugins must be under LGPLv3
- Modifications to Rust WASM components must be under LGPLv3

Full text: [LICENSE](LICENSE)

## 🙏 Acknowledgements

- **Jarrett Ye** — creator of FSRS
- **Obsidian Community** — inspiration and support
- **Rust Community** — WASM tooling
- **All contributors** — improvements and bug reports

## 📚 Additional Resources

- [Official FSRS Documentation](https://github.com/open-spaced-repetition/fsrs)
- [Obsidian Forum Discussion](https://forum.obsidian.md/)
- [Issues & Feature Requests](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/work_items)
- [FSRS Table Usage Guide](docs/intended_use.md)

***

**Note:** The plugin is under active development.
Functionality may change slightly.

*Last updated: 2026*
