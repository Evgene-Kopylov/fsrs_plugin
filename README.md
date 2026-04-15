# FSRS Plugin for Obsidian

[![Node.js build](https://github.com/obsidianmd/obsidian-fsrs-plugin/actions/workflows/lint.yml/badge.svg)](https://github.com/obsidianmd/obsidian-fsrs-plugin/actions/workflows/lint.yml)

Free Spaced Repetition Scheduler (FSRS) plugin for Obsidian. Implements the FSRS algorithm for spaced repetition flashcards directly in your notes.

## Features

- **Add FSRS fields**: Insert YAML frontmatter with FSRS card data into the current note
- **Find cards for review**: Scan all files to find cards with due dates for review
- **Review cards**: Update card parameters based on user assessment (Again, Hard, Good, Easy)
- **WASM-powered**: Uses Rust-compiled WebAssembly for high-performance FSRS calculations
- **YAML-based storage**: Stores FSRS parameters directly in note frontmatter
- **Machine learning optimization**: FSRS algorithm adapts to your memory patterns

## What is FSRS?

FSRS (Free Spaced Repetition Scheduler) is a modern spaced repetition algorithm based on machine learning. Unlike traditional algorithms like SM-2 (used in Anki), FSRS:

- Uses machine learning to optimize review schedules
- Adapts to individual memory patterns
- Provides more accurate prediction of retention
- Is open source and actively developed

## Installation

### From Obsidian Community Plugins
1. Open Obsidian Settings
2. Go to **Community plugins** and disable Safe Mode
3. Click **Browse** and search for "FSRS"
4. Install and enable the plugin

### Manual Installation
1. Download the latest release from GitHub
2. Extract the files into your vault's plugin folder: `VaultFolder/.obsidian/plugins/fsrs-plugin/`
3. Restart Obsidian
4. Enable the plugin in **Settings → Community plugins**

## Usage

### Adding FSRS to a Note
1. Open the note you want to use as a flashcard
2. Run the command **"Add FSRS fields"** from the command palette (Ctrl/Cmd+P)
3. The plugin will add FSRS YAML frontmatter to your note

### Finding Cards for Review
1. Run the command **"Find cards for review"** from the command palette
2. The plugin will scan all notes and display cards that are due for review
3. Click on a card to open it for review

### Reviewing Cards
When reviewing a card, you can rate your recall using four options:
- **Again**: Complete forgetting, reset the card
- **Hard**: Recalled with significant difficulty
- **Good**: Recalled with some difficulty
- **Easy**: Perfect recall

The FSRS algorithm will calculate the optimal next review date based on your rating.

## FSRS YAML Fields

The plugin adds the following fields to your note's frontmatter:

```yaml
---
fsrs_due: "2024-01-01T00:00:00Z"
fsrs_stability: 0.0
fsrs_difficulty: 0.0
fsrs_elapsed_days: 0
fsrs_scheduled_days: 0
fsrs_reps: 0
fsrs_lapses: 0
fsrs_state: "New"
fsrs_last_review: "2024-01-01T00:00:00Z"
---
```

### Field Descriptions
- `fsrs_due`: Next review date (UTC ISO format)
- `fsrs_stability`: Memory stability factor
- `fsrs_difficulty`: Card difficulty factor
- `fsrs_elapsed_days`: Days since last review
- `fsrs_scheduled_days`: Scheduled interval for next review
- `fsrs_reps`: Total number of reviews
- `fsrs_lapses`: Number of times card was forgotten
- `fsrs_state`: Current state (New, Learning, Review, Relearning)
- `fsrs_last_review`: Last review timestamp

## Commands

| Command | Description | Default Hotkey |
|---------|-------------|----------------|
| `Add FSRS fields` | Add FSRS YAML frontmatter to current note | None |
| `Find cards for review` | Find all cards due for review | None |
| `Review card` | Update card parameters after review | None |

## Settings

The plugin provides several configuration options:

- **Algorithm Parameters**: Customize FSRS weights, retention targets, and maximum intervals
- **Display Options**: Show/hide stability, difficulty, and retrievability values
- **Review Interface**: Customize review buttons and notifications
- **Filtering**: Filter cards by folders, tags, or states

## For Developers

### Prerequisites
- Node.js 16+
- Rust toolchain (for WASM compilation)
- Obsidian plugin API types

### Building from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/obsidianmd/obsidian-fsrs-plugin.git
   cd obsidian-fsrs-plugin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. For development with auto-rebuild:
   ```bash
   npm run dev
   ```

### Project Structure
```
obsidian-fsrs-plugin/
├── src/                    # TypeScript source code
│   ├── main.ts            # Plugin entry point
│   ├── settings.ts        # Plugin settings
│   └── ...
├── wasm-lib/              # Rust code for WASM module
│   ├── src/lib.rs         # Core FSRS logic in Rust
│   └── Cargo.toml         # Rust dependencies
├── scripts/               # Build scripts
│   └── encode-wasm.js     # Encodes WASM to base64
└── ...
```

### Architecture
The plugin uses a hybrid architecture:
- **TypeScript/JavaScript**: Plugin lifecycle, UI, Obsidian API integration
- **Rust/WebAssembly**: Core FSRS algorithm for performance
- **YAML frontmatter**: Card state storage in notes

The Rust code is compiled to WebAssembly and embedded in the plugin as base64-encoded string.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run build` and `npm run lint`
5. Submit a pull request

## License

This plugin is released under the 0-BSD license. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- FSRS algorithm by [J.A. Ceprián](https://github.com/open-spaced-repetition)
- Rust FSRS library: [rs-fsrs](https://github.com/open-spaced-repetition/rs-fsrs)
- Obsidian team for the amazing plugin API
- All contributors and users of the plugin

## Support

- **Issues**: Report bugs or feature requests on [GitHub Issues](https://github.com/obsidianmd/obsidian-fsrs-plugin/issues)
- **Documentation**: Check the [Obsidian Plugin Documentation](https://docs.obsidian.md)
- **Community**: Join the [Obsidian Discord](https://discord.gg/obsidianmd)

## Version History

- **1.0.0**: Initial release with basic FSRS integration
- See [CHANGELOG.md](CHANGELOG.md) for detailed version history

---

Made with ❤️ for the Obsidian community