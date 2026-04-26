import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "eslint.config.js",
                        "manifest.json",
                        "vitest.config.ts",
                    ],
                },
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: [".json"],
            },
        },
    },
    ...obsidianmd.configs.recommended,
    {
        plugins: {
            obsidianmd,
        },
        rules: {
            "obsidianmd/ui/sentence-case": [
                "error",
                {
                    acronyms: ["FSRS"],
                    allowAutoFix: true,
                },
            ],
        },
    },
    {
        files: ["src/**/*.ts"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            // Строгие правила типизации
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/require-await": "error",

            // Запрет console.log (warn, чтобы не ломать сборку)
            "no-console": "warn",
        },
    },
    globalIgnores([
        "*.cjs",
        "*.js",
        "*.mjs",
        "dist",
        "esbuild.config.mjs",
        "eslint.config.js",
        "main.js",
        "node_modules",
        "scripts/",
        "tests/",
        "vitest.config.ts",
        "version-bump.mjs",
        "versions.json",
        "wasm-lib/pkg/",
        "wasm-lib/public/",
    ]),
);
